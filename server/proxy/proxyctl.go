package proxy

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/NikasAl/NutriAdvisor/server/config"
	"golang.org/x/net/proxy"
)

// ProxyState represents the current state of a proxy tunnel.
type ProxyState string

const (
	StateStopped   ProxyState = "stopped"
	StateStarting  ProxyState = "starting"
	StateRunning   ProxyState = "running"
	StateUnhealthy ProxyState = "unhealthy"
	StateFailed    ProxyState = "failed"
)

// ManagedProxy represents a single managed SSH tunnel.
type ManagedProxy struct {
	Cfg    *config.ProxyCfg
	State  ProxyState
	PID    int
	Error  string
	Checks int // total health checks performed
	OKs    int // successful health checks
	LastOK time.Time
}

// ProxyManager manages SSH SOCKS5 tunnels lifecycle.
type ProxyManager struct {
	mu      sync.RWMutex
	proxies map[string]*ManagedProxy // id → proxy
	cancel  context.CancelFunc
	wg     sync.WaitGroup
}

// NewProxyManager creates a new proxy manager from config.
// It does NOT start tunnels — call Start() to begin.
func NewProxyManager(cfgs []config.ProxyCfg) *ProxyManager {
	pm := &ProxyManager{
		proxies: make(map[string]*ManagedProxy),
	}
	for i := range cfgs {
		c := &cfgs[i]
		if !c.IsEnabled() {
			slog.Info("proxy disabled, skipping", "id", c.ID)
			continue
		}
		if c.SSHLogin == "" || c.SOCKS5Addr == "" {
			slog.Warn("proxy misconfigured (missing ssh_login or socks5_addr), skipping", "id", c.ID)
			continue
		}
		pm.proxies[c.ID] = &ManagedProxy{
			Cfg:   c,
			State: StateStopped,
		}
	}
	return pm
}

// Start launches all enabled proxies and begins health check loops.
func (pm *ProxyManager) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	pm.cancel = cancel

	count := 0
	for id, mp := range pm.proxies {
		count++
		go pm.runProxy(ctx, id, mp)
	}

	if count > 0 {
		slog.Info("proxy manager started", "proxies", count)
	} else {
		slog.Info("proxy manager started (no proxies configured)")
	}
}

// Stop gracefully stops all tunnels and health checks.
func (pm *ProxyManager) Stop() {
	if pm.cancel != nil {
		pm.cancel()
	}
	pm.wg.Wait()

	pm.mu.Lock()
	defer pm.mu.Unlock()
	for id, mp := range pm.proxies {
		pm.stopTunnel(id, mp)
	}
	slog.Info("proxy manager stopped")
}

// GetProxyDialer returns a proxy.Dialer for the best available proxy.
// Returns nil if no healthy proxy is available.
func (pm *ProxyManager) GetProxyDialer(tags []string) proxy.Dialer {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, mp := range pm.proxies {
		if mp.State != StateRunning {
			continue
		}
		// Filter by tags if specified
		if len(tags) > 0 && !matchTags(mp.Cfg.Tags, tags) {
			continue
		}
		// Create SOCKS5 dialer
		dialer, err := proxy.SOCKS5("tcp", mp.Cfg.SOCKS5Addr, nil, &net.Dialer{
			Timeout: 10 * time.Second,
		})
		if err != nil {
			slog.Warn("create SOCKS5 dialer failed", "id", mp.Cfg.ID, "error", err)
			continue
		}
		return dialer
	}
	return nil
}

// GetHTTPTransport returns an http.Transport configured to use the best available proxy.
// Returns nil if no healthy proxy is available.
func (pm *ProxyManager) GetHTTPTransport(baseTransport *http.Transport, tags []string) *http.Transport {
	dialer := pm.GetProxyDialer(tags)
	if dialer == nil {
		return nil
	}

	// Clone the base transport and replace the dialer
	t := baseTransport.Clone()
	if sd, ok := dialer.(interface{ Dial(network, addr string) (net.Conn, error) }); ok {
		t.Dial = sd.Dial
	}
	return t
}

// Statuses returns status of all managed proxies.
func (pm *ProxyManager) Statuses() []ProxyStatusInfo {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	result := make([]ProxyStatusInfo, 0, len(pm.proxies))
	for _, mp := range pm.proxies {
		result = append(result, ProxyStatusInfo{
			ID:         mp.Cfg.ID,
			State:      string(mp.State),
			SOCKS5Addr: mp.Cfg.SOCKS5Addr,
			SSHLogin:   mp.Cfg.SSHLogin,
			SSHHost:    mp.Cfg.SSHHost(),
			PID:        mp.PID,
			AutoRestart: mp.Cfg.AutoRestart,
			Checks:     mp.Checks,
			OKs:        mp.OKs,
			LastOK:     mp.LastOK,
			Error:      mp.Error,
			Tags:       mp.Cfg.Tags,
		})
	}
	return result
}

// HasHealthyProxy returns true if at least one proxy is in running state.
func (pm *ProxyManager) HasHealthyProxy(tags []string) bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, mp := range pm.proxies {
		if mp.State != StateRunning {
			continue
		}
		if len(tags) > 0 && !matchTags(mp.Cfg.Tags, tags) {
			continue
		}
		return true
	}
	return false
}

// RestartProxy manually restarts a specific proxy by ID.
func (pm *ProxyManager) RestartProxy(id string) error {
	pm.mu.Lock()
	mp, ok := pm.proxies[id]
	if !ok {
		pm.mu.Unlock()
		return fmt.Errorf("proxy %q not found", id)
	}
	pm.stopTunnel(id, mp)
	mp.State = StateStopped
	mp.Error = ""
	pm.mu.Unlock()

	slog.Info("manual proxy restart", "id", id)
	go func() {
		pm.wg.Add(1)
		defer pm.wg.Done()
		pm.startTunnel(context.Background(), id, mp)
		pm.startHealthCheck(context.Background(), id, mp)
	}()
	return nil
}

// ProxyStatusInfo holds status info for API responses.
type ProxyStatusInfo struct {
	ID          string    `json:"id"`
	State       string    `json:"state"`
	SOCKS5Addr  string    `json:"socks5_addr"`
	SSHLogin    string    `json:"ssh_login"`
	SSHHost     string    `json:"ssh_host"`
	PID         int       `json:"pid"`
	AutoRestart bool      `json:"auto_restart"`
	Checks      int       `json:"checks"`
	OKs         int       `json:"oks"`
	LastOK      time.Time `json:"last_ok"`
	Error       string    `json:"error"`
	Tags        []string  `json:"tags"`
}

// ---------------------------------------------------------------------------
// Internal methods
// ---------------------------------------------------------------------------

func (pm *ProxyManager) runProxy(ctx context.Context, id string, mp *ManagedProxy) {
	pm.wg.Add(1)
	defer pm.wg.Done()

	// Initial start
	pm.startTunnel(ctx, id, mp)

	// Health check loop
	pm.startHealthCheck(ctx, id, mp)
}

func (pm *ProxyManager) startTunnel(ctx context.Context, id string, mp *ManagedProxy) {
	pm.mu.Lock()
	mp.State = StateStarting
	pm.mu.Unlock()

	slog.Info("starting SSH tunnel",
		"id", id,
		"socks5", mp.Cfg.SOCKS5Addr,
		"host", mp.Cfg.SSHHost(),
		"user", mp.Cfg.SSHUser(),
	)

	cmd := exec.CommandContext(ctx, "sshpass", "-p", mp.Cfg.SSHPassword(),
		"ssh",
		"-o", "StrictHostKeyChecking=accept-new",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "LogLevel=ERROR",
		"-D", mp.Cfg.SOCKS5Addr,
		"-C", "-N",
		"-p", fmt.Sprintf("%d", mp.Cfg.SSHPortOrDefault()),
		mp.Cfg.SSHLogin,
	)

	err := cmd.Start()
	if err != nil {
		pm.mu.Lock()
		mp.State = StateFailed
		mp.Error = fmt.Sprintf("ssh start: %v", err)
		pm.mu.Unlock()
		slog.Error("SSH tunnel start failed",
			"id", id,
			"error", err,
		)
		return
	}

	pm.mu.Lock()
	mp.PID = cmd.Process.Pid
	mp.State = StateRunning
	mp.Error = ""
	pm.mu.Unlock()

	slog.Info("SSH tunnel started",
		"id", id,
		"pid", cmd.Process.Pid,
		"socks5", mp.Cfg.SOCKS5Addr,
	)

	// Wait for exit in goroutine
	go func() {
		waitErr := cmd.Wait()
		pm.mu.Lock()
		if mp.State == StateRunning {
			mp.State = StateFailed
			mp.Error = fmt.Sprintf("tunnel exited: %v", waitErr)
			mp.PID = 0
			slog.Warn("SSH tunnel exited",
				"id", id,
				"error", waitErr,
			)
		}
		pm.mu.Unlock()
	}()
}

func (pm *ProxyManager) stopTunnel(id string, mp *ManagedProxy) {
	if mp.PID > 0 {
		slog.Info("stopping SSH tunnel", "id", id, "pid", mp.PID)
		// Try SIGTERM first
		if err := terminateProcess(mp.PID); err != nil {
			slog.Warn("failed to stop tunnel", "id", id, "pid", mp.PID, "error", err)
		}
		mp.PID = 0
	}
	mp.State = StateStopped
}

func (pm *ProxyManager) startHealthCheck(ctx context.Context, id string, mp *ManagedProxy) {
	interval := mp.Cfg.HealthCheckIntervalOrDefault()
	checkURL := mp.Cfg.HealthCheckURL

	// Wait a bit for tunnel to establish
	time.Sleep(2 * time.Second)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pm.doHealthCheck(id, mp, checkURL)
		}
	}
}

func (pm *ProxyManager) doHealthCheck(id string, mp *ManagedProxy, checkURL string) {
	pm.mu.RLock()
	state := mp.State
	pm.mu.RUnlock()

	if state != StateRunning && state != StateUnhealthy {
		return
	}

	pm.mu.Lock()
	mp.Checks++
	pm.mu.Unlock()

	// Health check: try to connect through the SOCKS5 proxy
	healthy := false

	if checkURL != "" {
		healthy = pm.checkViaURL(id, mp, checkURL)
	} else {
		// Default check: TCP connect to SOCKS5 port
		healthy = pm.checkViaTCP(id, mp)
	}

	pm.mu.Lock()
	if healthy {
		mp.OKs++
		mp.LastOK = time.Now()
		if mp.State == StateUnhealthy {
			slog.Info("proxy recovered", "id", id)
			mp.State = StateRunning
			mp.Error = ""
		}
	} else {
		if mp.State == StateRunning {
			slog.Warn("proxy health check failed", "id", id)
			mp.State = StateUnhealthy
		}

		// Auto-restart if enabled
		if mp.Cfg.AutoRestart && mp.State != StateRunning {
			pm.mu.Unlock()
			slog.Info("auto-restarting proxy", "id", id)
			pm.stopTunnel(id, mp)
			time.Sleep(mp.Cfg.RestartDelayOrDefault())
			pm.startTunnel(context.Background(), id, mp)
			return
		}
	}
	pm.mu.Unlock()
}

func (pm *ProxyManager) checkViaURL(id string, mp *ManagedProxy, checkURL string) bool {
	// Create HTTP client that routes through SOCKS5
	dialer, err := proxy.SOCKS5("tcp", mp.Cfg.SOCKS5Addr, nil, &net.Dialer{
		Timeout: 10 * time.Second,
	})
	if err != nil {
		return false
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			Dial: dialer.Dial,
		},
	}

	resp, err := client.Get(checkURL)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 500
}

func (pm *ProxyManager) checkViaTCP(id string, mp *ManagedProxy) bool {
	conn, err := net.DialTimeout("tcp", mp.Cfg.SOCKS5Addr, 5*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func matchTags(proxyTags, requiredTags []string) bool {
	if len(requiredTags) == 0 {
		return true
	}
	tagSet := make(map[string]bool)
	for _, t := range proxyTags {
		tagSet[t] = true
	}
	for _, t := range requiredTags {
		if tagSet[t] {
			return true
		}
	}
	return false
}

func terminateProcess(pid int) error {
	if runtime.GOOS == "windows" {
		return exec.Command("taskkill", "/F", "/PID", fmt.Sprintf("%d", pid)).Run()
	}
	return exec.Command("kill", fmt.Sprintf("%d", pid)).Run()
}
