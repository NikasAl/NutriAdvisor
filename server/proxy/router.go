package proxy

import (
        "fmt"
        "log/slog"
        "net/http"
        "sync"
        "time"

        "github.com/NikasAl/NutriAdvisor/server/config"
        "github.com/NikasAl/NutriAdvisor/server/providers"
)

// Router selects the best available provider for a given model alias.
type Router struct {
        cfg       *config.Config
        pools     map[string]*Pool   // provider name → concurrency pool
        providers map[string]providers.Provider
        mu        sync.RWMutex
        proxyMgr  *ProxyManager // optional, may be nil
}

// SetProxyManager sets the proxy manager for transport injection.
func (r *Router) SetProxyManager(pm *ProxyManager) {
        r.proxyMgr = pm
        // Register callback for dynamic transport re-injection when proxy state changes
        pm.SetOnStateChange(func(id string, mp *ManagedProxy) {
                r.reinjectTransports()
        })
}

// reinjectTransports re-injects proxy transports into all providers that need them.
// Called on every proxy state change to ensure providers always use a healthy proxy.
func (r *Router) reinjectTransports() {
        if r.proxyMgr == nil {
                return
        }

        for name, pcfg := range r.providerConfigs() {
                if !pcfg.ProxyRequired {
                        continue
                }
                p := r.providers[name]
                if p == nil {
                        continue
                }

                ts, ok := p.(providers.TransportSetter)
                if !ok {
                        continue
                }

                transport := r.proxyMgr.GetHTTPTransport(
                        http.DefaultTransport.(*http.Transport).Clone(), nil,
                )
                if transport != nil {
                        ts.SetTransport(transport)
                }
                // If transport == nil, keep the old one — it may still work for direct access
        }
}

// InjectProxyTransports configures providers that need a proxy with
// SOCKS5 transport from the ProxyManager.
func (r *Router) InjectProxyTransports() {
        if r.proxyMgr == nil {
                slog.Info("no proxy manager configured, skipping transport injection")
                return
        }

        injected := 0
        for name, pcfg := range r.providerConfigs() {
                if !pcfg.ProxyRequired {
                        continue
                }
                p := r.providers[name]
                if p == nil {
                        continue
                }

                ts, ok := p.(providers.TransportSetter)
                if !ok {
                        slog.Warn("provider needs proxy but does not support TransportSetter", "name", name)
                        continue
                }

                transport := r.proxyMgr.GetHTTPTransport(
                        http.DefaultTransport.(*http.Transport).Clone(), nil,
                )
                if transport == nil {
                        slog.Warn("no healthy proxy available for provider",
                                "name", name,
                        )
                        // Provider stays active but will use direct connection (may fail)
                        continue
                }

                ts.SetTransport(transport)
                injected++
                slog.Info("injected SOCKS5 proxy transport",
                        "provider", name,
                        "proxy", "auto-selected",
                )
        }

        if injected > 0 {
                slog.Info("proxy transport injection complete", "injected", injected)
        }
}

// providerConfigs returns enabled provider configs as a map.
func (r *Router) providerConfigs() map[string]*config.ProviderCfg {
        result := make(map[string]*config.ProviderCfg)
        for i := range r.cfg.Providers {
                p := &r.cfg.Providers[i]
                if p.IsEnabled() {
                        result[p.Name] = p
                }
        }
        return result
}

// NewRouter creates a new router from config, initialising all providers and pools.
func NewRouter(cfg *config.Config) *Router {
        r := &Router{
                cfg:       cfg,
                pools:     make(map[string]*Pool),
                providers: make(map[string]providers.Provider),
        }

        for i := range cfg.Providers {
                pcfg := &cfg.Providers[i]
                if !pcfg.IsEnabled() {
                        slog.Info("provider disabled, skipping", "name", pcfg.Name)
                        continue
                }

                // Create provider adapter
                var p providers.Provider
                switch pcfg.Type {
                case "llamacpp", "openai_compatible":
                        p = providers.NewOpenAIProvider(pcfg)
                case "gigachat":
                        p = providers.NewGigaChatProvider(pcfg)
                default:
                        slog.Warn("unknown provider type, using openai_compatible", "name", pcfg.Name, "type", pcfg.Type)
                        p = providers.NewOpenAIProvider(pcfg)
                }

                r.providers[pcfg.Name] = p

                // Create concurrency pool
                maxC := pcfg.MaxConcurrency
                if maxC < 1 {
                        maxC = 1
                }
                r.pools[pcfg.Name] = NewPool(pcfg.Name, maxC)
        }

        return r
}

// SelectProvider picks the best available provider-model pair for a model alias.
// Returns the provider, the real model name, and a release function to call when done.
func (r *Router) SelectProvider(aliasName string) (providers.Provider, string, func(), error) {
        r.mu.RLock()
        defer r.mu.RUnlock()

        candidates := r.cfg.FindModelsByAlias(aliasName)
        if len(candidates) == 0 {
                return nil, "", nil, fmt.Errorf("no provider found for model '%s'", aliasName)
        }

        alias := r.cfg.FindAlias(aliasName)
        strategy := "priority"
        if alias != nil && alias.Strategy != "" {
                strategy = alias.Strategy
        }

        switch strategy {
        case "priority":
                return r.selectPriority(candidates)
        case "least_loaded":
                return r.selectLeastLoaded(candidates)
        case "round_robin":
                return r.selectRoundRobin(aliasName, candidates)
        default:
                return r.selectPriority(candidates)
        }
}

// CandidateProvider pairs a provider instance with the real model name.
// Used by handler for fallback retry on error.
type CandidateProvider struct {
        Provider providers.Provider
        Model    string // real model name on this provider
        Priority int    // model priority (for logging)
        release  func() // releases the concurrency slot
}

// Release returns the concurrency slot. Must be called for every candidate
// that will NOT be used (i.e. all candidates after the successful one,
// or all candidates if all fail).
func (cp *CandidateProvider) Release() {
        if cp.release != nil {
                cp.release()
        }
}

// SelectProviderCandidates returns all available provider-model candidates
// for a given alias, sorted by priority. Each candidate has already acquired
// a concurrency slot. The handler can try them in order and release unused ones.
// IMPORTANT: caller must call Release() on each candidate that won't be used.
func (r *Router) SelectProviderCandidates(aliasName string) ([]CandidateProvider, error) {
        r.mu.RLock()
        defer r.mu.RUnlock()

        candidates := r.cfg.FindModelsByAlias(aliasName)
        if len(candidates) == 0 {
                return nil, fmt.Errorf("no provider found for model '%s'", aliasName)
        }

        var result []CandidateProvider
        for _, cm := range candidates {
                p := r.providers[cm.Provider.Name]
                if p == nil || !p.IsActive() {
                        continue
                }
                pool, ok := r.pools[cm.Provider.Name]
                if !ok {
                        continue
                }
                slot, release := pool.Acquire(5 * time.Second)
                if !slot {
                        slog.Debug("candidate at capacity, skipping", "provider", cm.Provider.Name, "model", cm.Model.Name)
                        continue
                }
                result = append(result, CandidateProvider{
                        Provider: p,
                        Model:    cm.Model.Name,
                        Priority: cm.Model.Priority,
                        release:  release,
                })
        }

        if len(result) == 0 {
                return nil, fmt.Errorf("all providers for model '%s' are busy or inactive", aliasName)
        }
        return result, nil
}

func (r *Router) selectPriority(candidates []config.ProviderModel) (providers.Provider, string, func(), error) {
        // Sort by provider priority (already ordered by fallback chain, but verify)
        for _, cm := range candidates {
                p := r.providers[cm.Provider.Name]
                if p == nil || !p.IsActive() {
                        slog.Debug("provider not active, skipping", "provider", cm.Provider.Name)
                        continue
                }
                pool, ok := r.pools[cm.Provider.Name]
                if !ok {
                        continue
                }
                slot, release := pool.Acquire(30 * time.Second)
                if slot {
                        slog.Debug("selected provider", "provider", cm.Provider.Name, "model", cm.Model.Name, "alias", cm.Model.Alias)
                        return p, cm.Model.Name, release, nil
                }
                slog.Debug("provider at capacity, skipping", "provider", cm.Provider.Name)
        }

        return nil, "", nil, fmt.Errorf("all providers for model are busy or inactive")
}

func (r *Router) selectLeastLoaded(candidates []config.ProviderModel) (providers.Provider, string, func(), error) {
        type scored struct {
                cm      config.ProviderModel
                load    float64
        }
        var best *scored

        for _, cm := range candidates {
                p := r.providers[cm.Provider.Name]
                if p == nil || !p.IsActive() {
                        continue
                }
                pool := r.pools[cm.Provider.Name]
                load := pool.Load()
                s := &scored{cm: cm, load: load}
                if best == nil || s.load < best.load {
                        best = s
                }
        }

        if best != nil {
                pool := r.pools[best.cm.Provider.Name]
                slot, release := pool.Acquire(30 * time.Second)
                if slot {
                        return r.providers[best.cm.Provider.Name], best.cm.Model.Name, release, nil
                }
        }

        return nil, "", nil, fmt.Errorf("all providers busy")
}

var roundRobinCounters map[string]int = make(map[string]int)
var rrMu sync.Mutex

func (r *Router) selectRoundRobin(aliasName string, candidates []config.ProviderModel) (providers.Provider, string, func(), error) {
        rrMu.Lock()
        idx := roundRobinCounters[aliasName] % len(candidates)
        roundRobinCounters[aliasName]++
        rrMu.Unlock()

        cm := candidates[idx]
        p := r.providers[cm.Provider.Name]
        if p == nil || !p.IsActive() {
                // Fallback: try next
                for _, c := range candidates {
                        p2 := r.providers[c.Provider.Name]
                        if p2 != nil && p2.IsActive() {
                                cm = c
                                p = p2
                                break
                        }
                }
        }

        if p == nil {
                return nil, "", nil, fmt.Errorf("no active provider for '%s'", aliasName)
        }

        pool := r.pools[cm.Provider.Name]
        slot, release := pool.Acquire(30 * time.Second)
        if slot {
                return p, cm.Model.Name, release, nil
        }

        return nil, "", nil, fmt.Errorf("selected provider is busy")
}

// Pool manages concurrency slots for a provider.
type Pool struct {
        name     string
        maxSlots int
        sem      chan struct{}
}

// NewPool creates a new concurrency pool.
func NewPool(name string, maxSlots int) *Pool {
        return &Pool{
                name:     name,
                maxSlots: maxSlots,
                sem:      make(chan struct{}, maxSlots),
        }
}

// Acquire tries to get a concurrency slot, waiting up to waitDuration.
// Returns true if acquired (caller must call release), false if timed out.
func (p *Pool) Acquire(waitDuration time.Duration) (acquired bool, release func()) {
        if waitDuration <= 0 {
                waitDuration = 30 * time.Second
        }
        timer := time.NewTimer(waitDuration)
        defer timer.Stop()

        select {
        case p.sem <- struct{}{}:
                return true, func() { <-p.sem }
        case <-timer.C:
                return false, func() {}
        }
}

// Load returns the current load as a fraction [0..1].
func (p *Pool) Load() float64 {
        return float64(len(p.sem)) / float64(p.maxSlots)
}

// Stats returns pool statistics.
func (p *Pool) Stats() (active int, capacity int) {
        return len(p.sem), p.maxSlots
}

// GetProvider returns a provider by name (for admin API).
func (r *Router) GetProvider(name string) providers.Provider {
        r.mu.RLock()
        defer r.mu.RUnlock()
        return r.providers[name]
}

// ProviderStatus holds status info for one provider.
type ProviderStatus struct {
        Name         string  `json:"name"`
        Active       bool    `json:"active"`
        ActiveSlots  int     `json:"active_slots"`
        MaxSlots     int     `json:"max_slots"`
        LoadPct      float64 `json:"load_pct"`
}

// AllProviderStatuses returns status of all providers.
func (r *Router) AllProviderStatuses() []ProviderStatus {
        r.mu.RLock()
        defer r.mu.RUnlock()

        var statuses []ProviderStatus
        for name, p := range r.providers {
                pool := r.pools[name]
                if pool == nil {
                        continue
                }
                active, capacity := pool.Stats()
                loadPct := float64(0)
                if capacity > 0 {
                        loadPct = float64(active) / float64(capacity) * 100
                }
                statuses = append(statuses, ProviderStatus{
                        Name:        name,
                        Active:      p.IsActive(),
                        ActiveSlots: active,
                        MaxSlots:    capacity,
                        LoadPct:     loadPct,
                })
        }
        return statuses
}
