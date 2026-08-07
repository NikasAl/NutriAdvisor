package config

import (
        "fmt"
        "os"
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
type ProxyCfg struct {
        ID                   string        `yaml:"id"`
        SOCKS5               string        `yaml:"socks5"`
        SSHLogin             string        `yaml:"ssh_login"`
        AutoRestart          bool          `yaml:"auto_restart"`
        HealthCheckInterval  time.Duration `yaml:"health_check_interval"`
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

// FindModelsByAlias returns all (provider, model) pairs for a given alias.
func (c *Config) FindModelsByAlias(aliasName string) []ProviderModel {
        alias := c.FindAlias(aliasName)
        if alias == nil {
                // Try direct model name match
                var results []ProviderModel
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
                return results
        }

        // Use fallback chain from alias
        var results []ProviderModel
        for _, pName := range alias.FallbackChain {
                p := c.FindProvider(pName)
                if p == nil {
                        continue
                }
                for j := range p.Models {
                        if p.Models[j].Alias == aliasName {
                                results = append(results, ProviderModel{
                                        Provider: p,
                                        Model:    &p.Models[j],
                                })
                                break
                        }
                }
        }
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
