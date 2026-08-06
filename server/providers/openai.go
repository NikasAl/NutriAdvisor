package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/NikasAl/NutriAdvisor/server/config"
)

// OpenAIProvider implements Provider for OpenAI-compatible APIs.
type OpenAIProvider struct {
	cfg       *config.ProviderCfg
	client    *http.Client
	active    bool
	activeMux sync.RWMutex
}

// NewOpenAIProvider creates a new provider from config.
func NewOpenAIProvider(cfg *config.ProviderCfg) *OpenAIProvider {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// TODO: add SOCKS5 proxy support from proxyctl

	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second
	}

	return &OpenAIProvider{
		cfg:    cfg,
		client: &http.Client{Timeout: timeout, Transport: transport},
		active: true,
	}
}

func (p *OpenAIProvider) Name() string { return p.cfg.Name }

func (p *OpenAIProvider) IsActive() bool {
	p.activeMux.RLock()
	defer p.activeMux.RUnlock()
	return p.active
}

func (p *OpenAIProvider) SetActive(v bool) {
	p.activeMux.Lock()
	defer p.activeMux.Unlock()
	p.active = v
}

// buildURL constructs the full endpoint URL.
func (p *OpenAIProvider) buildURL(path string) string {
	base := strings.TrimRight(p.cfg.BaseURL, "/")
	return base + path
}

// doRequest executes an HTTP request to the provider.
func (p *OpenAIProvider) doRequest(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	url := p.buildURL(path)
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request to %s: %w", p.cfg.Name, err)
	}
	return resp, nil
}

// SendRequest sends a non-streaming chat completion request.
func (p *OpenAIProvider) SendRequest(ctx context.Context, req *ChatRequest) ([]byte, *ResponseUsage, error) {
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

	// Parse usage from response
	var result struct {
		Usage ResponseUsage `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &result); err == nil {
		return respBody, &result.Usage, nil
	}

	return respBody, nil, nil
}

// SendStream sends a streaming chat completion request and returns an SSE reader.
// The returned io.ReadCloser yields raw SSE lines (data: {...}\n\n).
// Caller must close it.
func (p *OpenAIProvider) SendStream(ctx context.Context, req *ChatRequest) (io.ReadCloser, error) {
	req.Stream = true

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// For streaming, use a longer timeout — we'll cancel via context
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

	// Check content type
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

// streamReader wraps the HTTP response body for SSE streaming.
type streamReader struct {
	body   io.ReadCloser
	cancel context.CancelFunc
	buf    *bufio.Reader
	done   bool
}

// Read implements io.Reader — yields raw SSE data lines.
func (sr *streamReader) Read(p []byte) (n int, err error) {
	if sr.done {
		return 0, io.EOF
	}
	return sr.buf.Read(p)
}

// Close stops the stream.
func (sr *streamReader) Close() error {
	sr.done = true
	sr.cancel()
	return sr.body.Close()
}
