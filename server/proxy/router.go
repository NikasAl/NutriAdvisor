package proxy

import (
        "fmt"
        "log/slog"
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
