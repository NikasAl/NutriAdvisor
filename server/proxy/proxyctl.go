package proxy

import (
        "context"
        "fmt"
        "io"
        "log/slog"
        "math"
        "net"
        "net/http"
        "os/exec"
        "runtime"
        "strings"
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
        StateBackoff   ProxyState = "backoff"
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

        // Failure tracking for backoff + circuit breaker
        ConsecutiveFailures int       // count of consecutive restart failures
        LastFailTime        time.Time // time of last failure
}

// ProxyManager manages SSH SOCKS5 tunnels lifecycle.
type ProxyManager struct {
        mu      sync.RWMutex
        proxies map[string]*ManagedProxy // id → proxy
        cancel  context.CancelFunc
        wg     sync.WaitGroup

        // Callback: invoked when any proxy state changes (for transport re-injection)
        OnStateChange func(id string, mp *ManagedProxy)
}

// backoffDuration calculates exponential backoff with jitter.
// base=5s, factor=2, max=5min.
func backoffDuration(failures int) time.Duration {
        base := 5 * time.Second
        max := 5 * time.Minute
        // Exponential: base * 2^failures, capped at max
        mult := math.Pow(2, float64(failures))
        d := time.Duration(float64(base) * mult)
        if d > max {
                d = max
        }
        // Add jitter: ±20%
        jitter := time.Duration(float64(d) * 0.2)
        d -= jitter
        if d < base {
                d = base
        }
        return d
}

// maxConsecutiveFailures is the circuit breaker threshold.
// After this many consecutive failures, the proxy enters long backoff (5 min)
// and must succeed once to reset.
const maxConsecutiveFailures = 10

// longBackoffDuration is the cooldown after circuit breaker trips.
const longBackoffDuration = 5 * time.Minute

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
                // Validate unique SOCKS5 address
                if _, dup := pm.proxies[c.ID]; dup {
                        slog.Warn("proxy duplicate id, skipping", "id", c.ID)
                        continue
                }
                addrConflict := false
                for _, existing := range pm.proxies {
                        if existing.Cfg.SOCKS5Addr == c.SOCKS5Addr {
                                slog.Error("proxy socks5_addr conflict — two proxies cannot share the same address",
                                        "new_id", c.ID,
                                        "existing_id", existing.Cfg.ID,
                                        "socks5_addr", c.SOCKS5Addr,
                                )
                                addrConflict = true
                                break
                        }
                }
                if addrConflict {
                        continue
                }
                pm.proxies[c.ID] = &ManagedProxy{
                        Cfg:   c,
                        State: StateStopped,
                }
        }
        return pm
}

// SetOnStateChange registers a callback invoked when any proxy changes state.
// The callback is called WITHOUT the lock held, so it must acquire its own lock
// if it needs to access ProxyManager state.
func (pm *ProxyManager) SetOnStateChange(fn func(id string, mp *ManagedProxy)) {
        pm.OnStateChange = fn
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
                pm.stopTunnelLocked(id, mp)
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

        // Clone the base transport and replace the dialer.
        // IMPORTANT: DialContext takes priority over Dial in Go's http.Transport.
        // We must clear DialContext so that our SOCKS5 Dial is actually used.
        t := baseTransport.Clone()
        if sd, ok := dialer.(interface{ Dial(network, addr string) (net.Conn, error) }); ok {
                t.DialContext = nil
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
                        ID:                 mp.Cfg.ID,
                        State:              string(mp.State),
                        SOCKS5Addr:         mp.Cfg.SOCKS5Addr,
                        SSHLogin:           mp.Cfg.SSHLogin,
                        SSHHost:            mp.Cfg.SSHHost(),
                        PID:                mp.PID,
                        AutoRestart:        mp.Cfg.AutoRestart,
                        Checks:             mp.Checks,
                        OKs:                mp.OKs,
                        LastOK:             mp.LastOK,
                        Error:              mp.Error,
                        Tags:               mp.Cfg.Tags,
                        ConsecutiveFailures: mp.ConsecutiveFailures,
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
// Resets the failure counter so the proxy starts fresh.
func (pm *ProxyManager) RestartProxy(id string) error {
        pm.mu.Lock()
        mp, ok := pm.proxies[id]
        if !ok {
                pm.mu.Unlock()
                return fmt.Errorf("proxy %q not found", id)
        }
        pm.stopTunnelLocked(id, mp)
        mp.State = StateStopped
        mp.Error = ""
        mp.ConsecutiveFailures = 0 // reset failure counter on manual restart
        pm.mu.Unlock()

        slog.Info("manual proxy restart", "id", id)
        // The health check loop is already running (started by runProxy),
        // so we only need to start the tunnel — the loop will pick up the new state.
        go func() {
                pm.startTunnel(context.Background(), id, mp)
        }()
        return nil
}

// ProxyStatusInfo holds status info for API responses.
type ProxyStatusInfo struct {
        ID                  string    `json:"id"`
        State               string    `json:"state"`
        SOCKS5Addr          string    `json:"socks5_addr"`
        SSHLogin            string    `json:"ssh_login"`
        SSHHost             string    `json:"ssh_host"`
        PID                 int       `json:"pid"`
        AutoRestart         bool      `json:"auto_restart"`
        Checks              int       `json:"checks"`
        OKs                 int       `json:"oks"`
        LastOK              time.Time `json:"last_ok"`
        Error               string    `json:"error"`
        Tags                []string  `json:"tags"`
        ConsecutiveFailures int       `json:"consecutive_failures"`
}

// ---------------------------------------------------------------------------
// Internal methods
// ---------------------------------------------------------------------------

// runProxy is the main lifecycle goroutine for a single proxy.
// It starts the tunnel and enters the health check loop.
// The health check loop handles ALL state transitions including auto-restart.
func (pm *ProxyManager) runProxy(ctx context.Context, id string, mp *ManagedProxy) {
        pm.wg.Add(1)
        defer pm.wg.Done()

        // Initial start
        pm.startTunnel(ctx, id, mp)

        // Health check loop — this is the ONLY loop, it never exits unless ctx is cancelled
        pm.healthCheckLoop(ctx, id, mp)
}

// healthCheckLoop runs the health check ticker and handles ALL state transitions:
// - Running → Unhealthy (health check failure)
// - Unhealthy → Running (recovery)
// - Failed/Unhealthy → auto-restart with backoff
// - Backoff → retry after cooldown
// Circuit breaker after maxConsecutiveFailures.
func (pm *ProxyManager) healthCheckLoop(ctx context.Context, id string, mp *ManagedProxy) {
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
                        pm.handleHealthTick(ctx, id, mp, checkURL)
                }
        }
}

// handleHealthTick processes one health check tick.
func (pm *ProxyManager) handleHealthTick(ctx context.Context, id string, mp *ManagedProxy, checkURL string) {
        pm.mu.RLock()
        state := mp.State
        pm.mu.RUnlock()

        // --- Handle backoff state: wait for cooldown, then try once ---
        if state == StateBackoff {
                pm.mu.RLock()
                elapsed := time.Since(mp.LastFailTime)
                pm.mu.RUnlock()

                if elapsed >= longBackoffDuration {
                        slog.Info("proxy backoff cooldown elapsed, attempting restart",
                                "id", id, "backoff", elapsed.Round(time.Second))
                        pm.mu.Lock()
                        mp.State = StateStopped // reset so we can attempt start
                        pm.mu.Unlock()
                        pm.doAutoRestart(ctx, id, mp)
                }
                return
        }

        // --- Handle failed state: attempt auto-restart ---
        if state == StateFailed {
                if mp.Cfg.AutoRestart {
                        pm.doAutoRestart(ctx, id, mp)
                }
                return
        }

        // --- Handle stopped state: attempt auto-restart (shouldn't normally happen) ---
        if state == StateStopped {
                if mp.Cfg.AutoRestart {
                        pm.doAutoRestart(ctx, id, mp)
                }
                return
        }

        // --- Only Running and Unhealthy get health checks below ---
        if state != StateRunning && state != StateUnhealthy {
                return
        }

        pm.mu.Lock()
        mp.Checks++
        pm.mu.Unlock()

        // Perform health check
        healthy := false
        if checkURL != "" {
                healthy = pm.checkViaURL(id, mp, checkURL)
        } else {
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
                        pm.notifyStateChange(id, mp)
                }
                pm.mu.Unlock()
        } else {
                if mp.State == StateRunning {
                        slog.Warn("proxy health check failed", "id", id)
                        mp.State = StateUnhealthy
                        pm.notifyStateChange(id, mp)
                }

                // Auto-restart if enabled
                if mp.Cfg.AutoRestart {
                        pm.mu.Unlock()
                        pm.doAutoRestart(ctx, id, mp)
                } else {
                        pm.mu.Unlock()
                }
        }
}

// doAutoRestart stops the current tunnel (if any), waits with backoff, then starts a new one.
// This method does NOT exit the health check loop — the caller continues the loop.
func (pm *ProxyManager) doAutoRestart(ctx context.Context, id string, mp *ManagedProxy) {
        pm.mu.Lock()

        // Circuit breaker check
        if mp.ConsecutiveFailures >= maxConsecutiveFailures {
                if mp.State != StateBackoff {
                        slog.Warn("proxy circuit breaker tripped, entering long backoff",
                                "id", id,
                                "consecutive_failures", mp.ConsecutiveFailures,
                                "backoff", longBackoffDuration,
                        )
                        mp.State = StateBackoff
                        mp.LastFailTime = time.Now()
                        pm.notifyStateChange(id, mp)
                }
                pm.mu.Unlock()
                return
        }

        delay := backoffDuration(mp.ConsecutiveFailures)
        pm.mu.Unlock()

        // Stop existing tunnel
        pm.mu.Lock()
        pm.stopTunnelLocked(id, mp)
        pm.mu.Unlock()

        slog.Info("auto-restarting proxy",
                "id", id,
                "attempt", mp.ConsecutiveFailures+1,
                "delay", delay.Round(time.Second),
        )

        // Wait before restart (backoff)
        select {
        case <-ctx.Done():
                return
        case <-time.After(delay):
        }

        // Start new tunnel
        pm.startTunnel(ctx, id, mp)
}

// notifyStateChange calls the OnStateChange callback if registered.
// Caller must NOT hold pm.mu when calling this — but we call it while holding the lock.
// Since the callback likely needs to re-acquire the lock via public methods,
// we release first.
func (pm *ProxyManager) notifyStateChange(id string, mp *ManagedProxy) {
        if pm.OnStateChange != nil {
                // Call outside of lock to avoid deadlocks
                fn := pm.OnStateChange
                go fn(id, mp)
        }
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
                mp.ConsecutiveFailures++
                mp.LastFailTime = time.Now()
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
                // Only transition to Failed if still Running (not already stopped by health check)
                if mp.State == StateRunning {
                        mp.State = StateFailed
                        mp.Error = fmt.Sprintf("tunnel exited: %v", waitErr)
                        mp.PID = 0
                        mp.ConsecutiveFailures++
                        mp.LastFailTime = time.Now()
                        slog.Warn("SSH tunnel exited",
                                "id", id,
                                "error", waitErr,
                                "consecutive_failures", mp.ConsecutiveFailures,
                        )
                        pm.notifyStateChange(id, mp)
                } else if mp.State == StateStarting {
                        // Tunnel died during startup
                        mp.State = StateFailed
                        mp.Error = fmt.Sprintf("tunnel exited during start: %v", waitErr)
                        mp.PID = 0
                        mp.ConsecutiveFailures++
                        mp.LastFailTime = time.Now()
                        pm.notifyStateChange(id, mp)
                }
                pm.mu.Unlock()
        }()
}

// stopTunnelLocked stops the SSH tunnel. Caller MUST hold pm.mu.
func (pm *ProxyManager) stopTunnelLocked(id string, mp *ManagedProxy) {
        if mp.PID > 0 {
                slog.Info("stopping SSH tunnel", "id", id, "pid", mp.PID)
                if err := terminateProcess(mp.PID); err != nil {
                        slog.Warn("failed to stop tunnel", "id", id, "pid", mp.PID, "error", err)
                }
                mp.PID = 0
        }
        mp.State = StateStopped
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

// VerifyConnectivity makes a test request through the proxy to confirm it works
// and logs the external IP. Returns true if the proxy is actually routing traffic.
func (pm *ProxyManager) VerifyConnectivity(id string) bool {
        pm.mu.RLock()
        mp, ok := pm.proxies[id]
        pm.mu.RUnlock()
        if !ok || mp.State != StateRunning {
                return false
        }

        dialer, err := proxy.SOCKS5("tcp", mp.Cfg.SOCKS5Addr, nil, &net.Dialer{
                Timeout: 10 * time.Second,
        })
        if err != nil {
                slog.Error("proxy connectivity check: create dialer failed", "id", id, "error", err)
                return false
        }

        client := &http.Client{
                Timeout: 15 * time.Second,
                Transport: &http.Transport{
                        Dial: dialer.(interface{ Dial(string, string) (net.Conn, error) }).Dial,
                },
        }

        // Try multiple IP check services
        for _, checkURL := range []string{"https://api.ipify.org", "https://checkip.amazonaws.com"} {
                resp, err := client.Get(checkURL)
                if err != nil {
                        slog.Debug("proxy connectivity check: request failed", "id", id, "url", checkURL, "error", err)
                        continue
                }
                body, _ := io.ReadAll(resp.Body)
                resp.Body.Close()
                ip := strings.TrimSpace(string(body))
                if resp.StatusCode == 200 && ip != "" {
                        slog.Info("proxy connectivity verified", "id", id, "external_ip", ip, "via", checkURL)
                        return true
                }
        }

        slog.Warn("proxy connectivity check: all services failed", "id", id)
        return false
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
