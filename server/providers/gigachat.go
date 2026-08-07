package providers

import (
        "bufio"
        "bytes"
        "context"
        "crypto/rand"
        "crypto/tls"
        "crypto/x509"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "os"
        "strings"
        "sync"
        "time"

        "github.com/NikasAl/NutriAdvisor/server/config"
)

// GigaChatProvider implements Provider for GigaChat (Sber).
// GigaChat uses OAuth2: a Base64 auth key is exchanged for an access_token
// via POST to https://ngw.devices.sberbank.ru:9443/api/v2/oauth,
// then the token is used as Bearer for chat requests.
type GigaChatProvider struct {
        cfg       *config.ProviderCfg
        client    *http.Client
        active    bool
        activeMux sync.RWMutex

        // OAuth2 fields
        authKey    string // Base64 auth key from Sber dashboard
        tokenCache struct {
                sync.RWMutex
                token     string
                expiresAt time.Time
        }
}

// NewGigaChatProvider creates a new GigaChat provider from config.
// cfg.APIKey should contain the Base64 auth key (not a Bearer token).
func NewGigaChatProvider(cfg *config.ProviderCfg) *GigaChatProvider {
        transport := http.DefaultTransport.(*http.Transport).Clone()
        // GigaChat OAuth endpoint (ngw.devices.sberbank.ru:9443) uses a certificate
        // signed by Russian Trusted CA which may not be in the system trust store.
        // We load additional root CAs from certs/ directory and system store.
        transport.TLSClientConfig = buildTLSConfig()
        // TODO: add SOCKS5 proxy support

        timeout := cfg.Timeout
        if timeout == 0 {
                timeout = 120 * time.Second
        }

        return &GigaChatProvider{
                cfg:     cfg,
                client:  &http.Client{Timeout: timeout, Transport: transport},
                active:  true,
                authKey: cfg.APIKey,
        }
}

// buildTLSConfig creates a TLS config that includes the system CA pool
// plus any .pem/.crt files found in the certs/ directory next to the binary.
func buildTLSConfig() *tls.Config {
        tlsCfg := &tls.Config{
                MinVersion: tls.VersionTLS12,
        }

        // Try system cert pool
        if systemPool, err := x509.SystemCertPool(); err == nil {
                tlsCfg.RootCAs = systemPool
        } else {
                slog.Warn("cannot load system cert pool, using empty pool", "error", err)
                tlsCfg.RootCAs = x509.NewCertPool()
        }

        // Load additional CAs from certs/ directory
        certsDir := "certs"
        entries, err := os.ReadDir(certsDir)
        if err == nil {
                loaded := 0
                for _, e := range entries {
                        if e.IsDir() {
                                continue
                        }
                        name := e.Name()
                        if !(strings.HasSuffix(name, ".pem") || strings.HasSuffix(name, ".crt") || strings.HasSuffix(name, ".cer")) {
                                continue
                        }
                        data, err := os.ReadFile(certsDir + "/" + name)
                        if err != nil {
                                slog.Warn("cannot read cert file", "file", name, "error", err)
                                continue
                        }
                        if tlsCfg.RootCAs.AppendCertsFromPEM(data) {
                                slog.Info("loaded additional root CA", "file", name)
                                loaded++
                        } else {
                                slog.Warn("failed to parse cert file (not PEM?)", "file", name)
                        }
                }
                if loaded > 0 {
                        slog.Info("loaded additional root CAs", "count", loaded, "dir", certsDir)
                }
        } else if !os.IsNotExist(err) {
                slog.Warn("cannot read certs directory", "dir", certsDir, "error", err)
        }

        return tlsCfg
}

func (p *GigaChatProvider) Name() string { return p.cfg.Name }

func (p *GigaChatProvider) IsActive() bool {
        p.activeMux.RLock()
        defer p.activeMux.RUnlock()
        return p.active
}

func (p *GigaChatProvider) SetActive(v bool) {
        p.activeMux.Lock()
        defer p.activeMux.Unlock()
        p.active = v
}

// buildURL constructs the full endpoint URL.
func (p *GigaChatProvider) buildURL(path string) string {
        base := strings.TrimRight(p.cfg.BaseURL, "/")
        // GigaChat API base is like https://gigachat.devices.sberbank.ru/api/v1
        // We strip /v1 to avoid doubling since paths include /v1/...
        base = strings.TrimSuffix(base, "/v1")
        return base + path
}

// uuid generates a random UUID v4 for the RqUID header.
func uuid() string {
        b := make([]byte, 16)
        rand.Read(b)
        b[6] = (b[6] & 0x0f) | 0x40 // version 4
        b[8] = (b[8] & 0x3f) | 0x80 // variant 10
        return hex.EncodeToString(b)
}

// getAccessToken obtains a Bearer token via OAuth2, with caching.
func (p *GigaChatProvider) getAccessToken(ctx context.Context) (string, error) {
        // Check cache first
        p.tokenCache.RLock()
        if p.tokenCache.token != "" && time.Now().Before(p.tokenCache.expiresAt) {
                token := p.tokenCache.token
                p.tokenCache.RUnlock()
                return token, nil
        }
        p.tokenCache.RUnlock()

        if p.authKey == "" {
                return "", fmt.Errorf("GigaChat auth key not configured (set api_key in config)")
        }

        oauthURL := "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
        rqUID := uuid()

        reqBody := strings.NewReader("scope=GIGACHAT_API_PERS")
        req, err := http.NewRequestWithContext(ctx, "POST", oauthURL, reqBody)
        if err != nil {
                return "", fmt.Errorf("create oauth request: %w", err)
        }

        req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
        req.Header.Set("Accept", "application/json")
        req.Header.Set("RqUID", rqUID)
        req.Header.Set("Authorization", "Basic "+p.authKey)

        resp, err := p.client.Do(req)
        if err != nil {
                return "", fmt.Errorf("GigaChat OAuth request: %w", err)
        }
        defer resp.Body.Close()

        body, err := io.ReadAll(resp.Body)
        if err != nil {
                return "", fmt.Errorf("read oauth response: %w", err)
        }

        if resp.StatusCode != http.StatusOK {
                return "", fmt.Errorf("GigaChat OAuth error (%d): %s", resp.StatusCode, string(body))
        }

        var result struct {
                AccessToken string `json:"access_token"`
                ExpiresAt   int64  `json:"expires_at"` // unix ms
        }
        if err := json.Unmarshal(body, &result); err != nil {
                return "", fmt.Errorf("parse oauth response: %w", err)
        }

        if result.AccessToken == "" {
                return "", fmt.Errorf("GigaChat OAuth returned empty token")
        }

        // Cache the token; expires_at is unix ms, subtract 60s safety margin
        expiresAt := time.Unix(result.ExpiresAt/1000, 0).Add(-60 * time.Second)
        if expiresAt.Before(time.Now()) {
                expiresAt = time.Now().Add(30 * time.Minute) // fallback
        }

        p.tokenCache.Lock()
        p.tokenCache.token = result.AccessToken
        p.tokenCache.expiresAt = expiresAt
        p.tokenCache.Unlock()

        return result.AccessToken, nil
}

// doRequest executes an HTTP request to the GigaChat API.
func (p *GigaChatProvider) doRequest(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
        url := p.buildURL(path)
        req, err := http.NewRequestWithContext(ctx, method, url, body)
        if err != nil {
                return nil, fmt.Errorf("create request: %w", err)
        }

        req.Header.Set("Content-Type", "application/json")

        // Get access token (may use cached)
        token, err := p.getAccessToken(ctx)
        if err != nil {
                return nil, fmt.Errorf("get access token: %w", err)
        }

        req.Header.Set("Authorization", "Bearer "+token)

        resp, err := p.client.Do(req)
        if err != nil {
                return nil, fmt.Errorf("request to %s: %w", p.cfg.Name, err)
        }

        // If 401, token may have expired — invalidate cache and retry once
        if resp.StatusCode == http.StatusUnauthorized {
                resp.Body.Close()
                p.tokenCache.Lock()
                p.tokenCache.token = ""
                p.tokenCache.Unlock()

                token, err = p.getAccessToken(ctx)
                if err != nil {
                        return nil, fmt.Errorf("refresh access token: %w", err)
                }

                req.Header.Set("Authorization", "Bearer "+token)
                resp, err = p.client.Do(req)
                if err != nil {
                        return nil, fmt.Errorf("retry request to %s: %w", p.cfg.Name, err)
                }
        }

        return resp, nil
}

// SendRequest sends a non-streaming chat completion request.
func (p *GigaChatProvider) SendRequest(ctx context.Context, req *ChatRequest) ([]byte, *ResponseUsage, error) {
        req.Stream = false

        body, err := json.Marshal(req)
        if err != nil {
                return nil, nil, fmt.Errorf("marshal request: %w", err)
        }

        resp, err := p.doRequest(ctx, "POST", "/v1/chat/completions", bytes.NewReader(body))
        if err != nil {
                return nil, nil, err
        }
        defer resp.Body.Close()

        respBody, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, nil, fmt.Errorf("read response: %w", err)
        }

        if resp.StatusCode != http.StatusOK {
                return nil, nil, fmt.Errorf("provider %s returned %d: %s", p.cfg.Name, resp.StatusCode, string(respBody))
        }

        var result struct {
                Usage ResponseUsage `json:"usage"`
        }
        if err := json.Unmarshal(respBody, &result); err == nil {
                return respBody, &result.Usage, nil
        }

        return respBody, nil, nil
}

// SendStream sends a streaming chat completion request and returns an SSE reader.
func (p *GigaChatProvider) SendStream(ctx context.Context, req *ChatRequest) (io.ReadCloser, error) {
        req.Stream = true

        body, err := json.Marshal(req)
        if err != nil {
                return nil, fmt.Errorf("marshal request: %w", err)
        }

        streamCtx, cancel := context.WithCancel(ctx)

        resp, err := p.doRequest(streamCtx, "POST", "/v1/chat/completions", bytes.NewReader(body))
        if err != nil {
                cancel()
                return nil, err
        }

        if resp.StatusCode != http.StatusOK {
                cancel()
                defer resp.Body.Close()
                respBody, _ := io.ReadAll(resp.Body)
                return nil, fmt.Errorf("provider %s returned %d: %s", p.cfg.Name, resp.StatusCode, string(respBody))
        }

        ct := resp.Header.Get("Content-Type")
        if !strings.Contains(ct, "text/event-stream") && !strings.Contains(ct, "application/octet-stream") {
                cancel()
                resp.Body.Close()
                return nil, fmt.Errorf("provider %s: unexpected content-type %s for stream", p.cfg.Name, ct)
        }

        return &streamReader{
                body:   resp.Body,
                cancel: cancel,
                buf:    bufio.NewReader(resp.Body),
        }, nil
}
