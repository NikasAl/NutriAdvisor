package config

import (
        "fmt"
        "os"
        "sort"
        "strings"
        "time"

        "gopkg.in/yaml.v3"
)

// Config is the root configuration loaded from YAML + env vars.
type Config struct {
        Server   ServerConfig   `yaml:"server"`
        Auth     AuthConfig     `yaml:"auth"`
        Providers []ProviderCfg `yaml:"providers"`
        Aliases  []AliasCfg     `yaml:"model_aliases"`
        Proxies  []ProxyCfg     `yaml:"external_proxies"`
        Billing  BillingConfig  `yaml:"billing"`
        Logging  LoggingConfig  `yaml:"logging"`
}

type ServerConfig struct {
        Listen string `yaml:"listen"` // e.g. ":3001"
}

type AuthConfig struct {
        JWTSecret           string `yaml:"jwt_secret"`
        FreeTierDailyLimit  int    `yaml:"free_tier_daily_limit"`
}

// ProviderCfg defines an LLM backend.
type ProviderCfg struct {
        Name           string        `yaml:"name"`
        Type           string        `yaml:"type"`           // "llamacpp", "openai_compatible"
        BaseURL        string        `yaml:"base_url"`
        APIKey         string        `yaml:"api_key"`        // may contain ${ENV_VAR}
        MaxConcurrency int           `yaml:"max_concurrency"`
        Priority       int           `yaml:"priority"`       // lower = higher priority
        Timeout        time.Duration `yaml:"timeout"`
        ProxyRequired  bool          `yaml:"proxy_required"`
        Models         []ModelCfg    `yaml:"models"`
        Enabled        *bool         `yaml:"enabled"`        // nil = true
}

// IsEnabled returns true if the provider is enabled (default true).
func (p *ProviderCfg) IsEnabled() bool {
        if p.Enabled != nil {
                return *p.Enabled
        }
        return true
}

// ModelCfg defines a model available on a provider.
type ModelCfg struct {
        Name        string  `yaml:"name"`
        Alias       string  `yaml:"alias"`        // groups models across providers
        Priority    int     `yaml:"priority"`     // lower = higher priority (default 0)
        InputPrice  float64 `yaml:"input_price"`  // price per 1M input tokens (user-facing, with margin)
        OutputPrice float64 `yaml:"output_price"` // price per 1M output tokens (user-facing, with margin)
        MaxTokens   int     `yaml:"max_tokens"`
}

// AliasCfg maps a model alias to a priority-ordered fallback chain.
type AliasCfg struct {
        Name         string   `yaml:"name"`
        FallbackChain []string `yaml:"fallback_chain"` // provider names, priority order
        Strategy     string   `yaml:"strategy"`       // "priority" | "round_robin" | "least_loaded"
}

// ProxyCfg defines an external SOCKS5 proxy (SSH tunnel).
// The proxy is created via: ssh -D <local_port> -C -N -p 22 <ssh_login>
// Password is derived from ssh_login: everything before the first '-' in the user part.
type ProxyCfg struct {
        ID                  string        `yaml:"id"`
        Enabled             *bool         `yaml:"enabled"`            // nil = true
        SOCKS5Addr          string        `yaml:"socks5_addr"`        // e.g. "127.0.0.1:10801" (unique per proxy)
        SSHLogin            string        `yaml:"ssh_login"`          // e.g. "user-pass@host.example.com"
        SSHPort             int           `yaml:"ssh_port"`           // default 22
        AutoRestart         bool          `yaml:"auto_restart"`       // restart dead tunnels
        HealthCheckURL      string        `yaml:"health_check_url"`   // URL to check through proxy (e.g. "https://httpbin.org/ip")
        HealthCheckInterval time.Duration `yaml:"health_check_interval"` // default 30s
        RestartDelay       time.Duration `yaml:"restart_delay"`      // delay before restart attempt, default 5s
        Tags                []string      `yaml:"tags"`               // e.g. ["usa", "europe"] for routing
}

// IsEnabled returns true if the proxy is enabled (default true).
func (p *ProxyCfg) IsEnabled() bool {
        if p.Enabled != nil {
                return *p.Enabled
        }
        return true
}

// SSHUser extracts the user part from ssh_login (before @).
func (p *ProxyCfg) SSHUser() string {
        at := strings.Index(p.SSHLogin, "@")
        if at < 0 {
                return p.SSHLogin
        }
        return p.SSHLogin[:at]
}

// SSHHost extracts the host part from ssh_login (after @).
func (p *ProxyCfg) SSHHost() string {
        at := strings.Index(p.SSHLogin, "@")
        if at < 0 {
                return p.SSHLogin
        }
        return p.SSHLogin[at+1:]
}

// SSHPassword derives the password: everything before first '-' in user part.
func (p *ProxyCfg) SSHPassword() string {
        user := p.SSHUser()
        dash := strings.Index(user, "-")
        if dash < 0 {
                return user
        }
        return user[:dash]
}

// SSHPortOrDefault returns the SSH port, defaulting to 22.
func (p *ProxyCfg) SSHPortOrDefault() int {
        if p.SSHPort > 0 {
                return p.SSHPort
        }
        return 22
}

// HealthCheckIntervalOrDefault returns the health check interval, defaulting to 30s.
func (p *ProxyCfg) HealthCheckIntervalOrDefault() time.Duration {
        if p.HealthCheckInterval > 0 {
                return p.HealthCheckInterval
        }
        return 30 * time.Second
}

// RestartDelayOrDefault returns the restart delay, defaulting to 5s.
func (p *ProxyCfg) RestartDelayOrDefault() time.Duration {
        if p.RestartDelay > 0 {
                return p.RestartDelay
        }
        return 5 * time.Second
}

// BillingConfig holds billing-related settings.
type BillingConfig struct {
        DBPath            string `yaml:"db_path"`
        MinBalanceToServe int    `yaml:"min_balance_to_serve"` // in kopecks
        CMServerURL       string `yaml:"cm_server_url"`       // e.g. "http://127.0.0.1:8002/cm"
        CMApp             string `yaml:"cm_app"`              // e.g. "nuadvi"
}

// LoggingConfig controls log output.
type LoggingConfig struct {
        Level  string `yaml:"level"`  // "debug" | "info" | "warn"
        Format string `yaml:"format"` // "text" | "json"
}

// Load reads and parses config from the given file path.
func Load(path string) (*Config, error) {
        data, err := os.ReadFile(path)
        if err != nil {
                return nil, fmt.Errorf("read config %s: %w", path, err)
        }

        var cfg Config
        if err := yaml.Unmarshal(data, &cfg); err != nil {
                return nil, fmt.Errorf("parse config %s: %w", path, err)
        }

        // Apply defaults
        if cfg.Server.Listen == "" {
                cfg.Server.Listen = ":3001"
        }
        if cfg.Auth.FreeTierDailyLimit == 0 {
                cfg.Auth.FreeTierDailyLimit = 3
        }
        if cfg.Billing.DBPath == "" {
                cfg.Billing.DBPath = "./data/billing.db"
        }
        if cfg.Billing.CMServerURL == "" {
                cfg.Billing.CMServerURL = "http://127.0.0.1:8002/cm"
        }
        if cfg.Billing.CMApp == "" {
                cfg.Billing.CMApp = "nuadvi"
        }
        if cfg.Logging.Level == "" {
                cfg.Logging.Level = "info"
        }
        if cfg.Logging.Format == "" {
                cfg.Logging.Format = "text"
        }

        // Resolve env vars in provider API keys
        for i := range cfg.Providers {
                cfg.Providers[i].APIKey = resolveEnv(cfg.Providers[i].APIKey)
        }

        return &cfg, nil
}

// resolveEnv replaces ${VAR} patterns with environment variable values.
func resolveEnv(s string) string {
        if s == "" {
                return ""
        }
        return os.Expand(s, func(key string) string {
                return os.Getenv(key)
        })
}

// FindAlias looks up an alias by name and returns it, or nil.
func (c *Config) FindAlias(name string) *AliasCfg {
        for i := range c.Aliases {
                if c.Aliases[i].Name == name {
                        return &c.Aliases[i]
                }
        }
        return nil
}

// FindProvider looks up a provider by name and returns it, or nil.
func (c *Config) FindProvider(name string) *ProviderCfg {
        for i := range c.Providers {
                if c.Providers[i].Name == name && c.Providers[i].IsEnabled() {
                        return &c.Providers[i]
                }
        }
        return nil
}

// FindModelsByAlias returns all (provider, model) pairs for a given alias,
// sorted by model priority (lower = higher priority).
// When models share the same alias, they are ordered by their priority field.
// The fallback_chain from the alias is still respected as a secondary order
// (providers listed earlier in the chain come first for equal priorities).
func (c *Config) FindModelsByAlias(aliasName string) []ProviderModel {
        var results []ProviderModel

        alias := c.FindAlias(aliasName)
        if alias == nil {
                // No alias defined — try direct model name/alias match across all providers
                for i := range c.Providers {
                        p := &c.Providers[i]
                        if !p.IsEnabled() {
                                continue
                        }
                        for j := range p.Models {
                                if p.Models[j].Name == aliasName || p.Models[j].Alias == aliasName {
                                        results = append(results, ProviderModel{
                                                Provider: p,
                                                Model:    &p.Models[j],
                                        })
                                }
                        }
                }
        } else {
                // Alias exists — collect models from fallback chain providers
                chainOrder := make(map[string]int) // provider name → position in chain
                for idx, pName := range alias.FallbackChain {
                        chainOrder[pName] = idx
                }

                for i := range c.Providers {
                        p := &c.Providers[i]
                        if !p.IsEnabled() {
                                continue
                        }
                        // Only include providers that are in the fallback chain
                        _, inChain := chainOrder[p.Name]
                        if !inChain {
                                continue
                        }
                        for j := range p.Models {
                                if p.Models[j].Alias == aliasName {
                                        results = append(results, ProviderModel{
                                                Provider: p,
                                                Model:    &p.Models[j],
                                        })
                                }
                        }
                }
        }

        // Sort by model priority first, then by provider chain order
        sort.SliceStable(results, func(i, j int) bool {
                pi, pj := results[i].Model.Priority, results[j].Model.Priority
                if pi != pj {
                        return pi < pj
                }
                // Equal priority — use provider priority as tiebreaker
                return results[i].Provider.Priority < results[j].Provider.Priority
        })

        return results
}

// ProviderModel pairs a provider with one of its models.
type ProviderModel struct {
        Provider *ProviderCfg
        Model    *ModelCfg
}

// ListModelEntry is returned by the /v1/models endpoint.
type ListModelEntry struct {
        ID       string `json:"id"`
        Object   string `json:"object"`
        Created  int64  `json:"created"`
        OwnedBy  string `json:"owned_by"`
}

// AvailableModels returns a deduplicated list of model IDs for /v1/models.
func (c *Config) AvailableModels() []ListModelEntry {
        seen := make(map[string]bool)
        models := make([]ListModelEntry, 0) // non-nil to avoid JSON "null"

        for _, pm := range c.AllProviderModels() {
                alias := pm.Model.Alias
                if alias == "" {
                        alias = pm.Model.Name
                }
                if alias == "" {
                        continue
                }
                if seen[alias] {
                        continue
                }
                seen[alias] = true
                models = append(models, ListModelEntry{
                        ID:      alias,
                        Object:  "model",
                        Created: 0,
                        OwnedBy: pm.Provider.Name,
                })
        }
        return models
}

// AllProviderModels returns all provider-model pairs.
func (c *Config) AllProviderModels() []ProviderModel {
        results := make([]ProviderModel, 0) // non-nil
        for i := range c.Providers {
                p := &c.Providers[i]
                if !p.IsEnabled() {
                        continue
                }
                for j := range p.Models {
                        results = append(results, ProviderModel{Provider: p, Model: &p.Models[j]})
                }
        }
        return results
}

// resolveEnv replaces ${VAR} and ${VAR:-default} patterns.
// This version handles the simple ${VAR} case.
func init() {
        // Ensure data directory exists
        _ = os.MkdirAll("./data", 0755)
}

// String returns a summary string for logging.
func (c *Config) String() string {
        var b strings.Builder
        b.WriteString("Config:\n")
        b.WriteString(fmt.Sprintf("  Listen: %s\n", c.Server.Listen))
        b.WriteString(fmt.Sprintf("  Free tier: %d req/day\n", c.Auth.FreeTierDailyLimit))
        b.WriteString(fmt.Sprintf("  Providers (%d):\n", len(c.Providers)))
        for _, p := range c.Providers {
                status := "enabled"
                if !p.IsEnabled() {
                        status = "disabled"
                }
                b.WriteString(fmt.Sprintf("    - %s (%s, priority=%d, concurrency=%d) [%s]\n",
                        p.Name, p.Type, p.Priority, p.MaxConcurrency, status))
                for _, m := range p.Models {
                        alias := m.Alias
                        if alias == "" {
                                alias = m.Name
                        }
                        b.WriteString(fmt.Sprintf("      %s → alias=%s (in=%.4f out=%.4f ₽/1M tok)\n",
                                m.Name, alias, m.InputPrice, m.OutputPrice))
                }
        }
        b.WriteString(fmt.Sprintf("  Aliases (%d):\n", len(c.Aliases)))
        for _, a := range c.Aliases {
                b.WriteString(fmt.Sprintf("    %s → %v (strategy=%s)\n", a.Name, a.FallbackChain, a.Strategy))
        }
        return b.String()
}
