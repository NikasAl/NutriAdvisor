package handlers

import (
        "bufio"
        "context"
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "strings"
        "time"

        "github.com/NikasAl/NutriAdvisor/server/config"
        "github.com/NikasAl/NutriAdvisor/server/proxy"
        "github.com/NikasAl/NutriAdvisor/server/providers"
)

// Handler holds dependencies for all HTTP handlers.
type Handler struct {
        cfg      *config.Config
        router   *proxy.Router
        proxyMgr *proxy.ProxyManager // optional, may be nil
}

// NewHandler creates a new handler group.
func NewHandler(cfg *config.Config, router *proxy.Router) *Handler {
        return &Handler{cfg: cfg, router: router}
}

// SetProxyManager sets the proxy manager (called after NewHandler).
func (h *Handler) SetProxyManager(pm *proxy.ProxyManager) {
        h.proxyMgr = pm
}

// RegisterRoutes registers all HTTP routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
        mux.HandleFunc("/v1/chat/completions", h.handleChatCompletions)
        mux.HandleFunc("/v1/models", h.handleModels)
        mux.HandleFunc("/health", h.handleHealth)
        mux.HandleFunc("/api/admin/providers", h.handleAdminProviders)
        mux.HandleFunc("/api/admin/proxies", h.handleAdminProxies)
        mux.HandleFunc("/api/admin/proxies/", h.handleAdminProxyAction)
}

// handleChatCompletions is the main proxy endpoint for LLM requests.
func (h *Handler) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
                return
        }

        // Parse request body
        var req providers.ChatRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeError(w, http.StatusBadRequest, "invalid request body: %v", err)
                return
        }

        modelName := req.Model
        slog.Info("chat completion request",
                "model", modelName,
                "stream", req.Stream,
                "messages", len(req.Messages),
        )

        // Find a provider for this model
        provider, realModel, release, err := h.router.SelectProvider(modelName)
        if err != nil {
                slog.Warn("no provider available", "model", modelName, "error", err)
                writeError(w, http.StatusServiceUnavailable, "no available provider: %v", err)
                return
        }
        defer release()

        // Override model name with the real model name on this provider
        req.Model = realModel

        if req.Stream {
                h.handleStreaming(w, r, provider, &req)
        } else {
                h.handleNonStreaming(w, r, provider, &req)
        }
}

// handleNonStreaming proxies a non-streaming request.
func (h *Handler) handleNonStreaming(w http.ResponseWriter, r *http.Request, provider providers.Provider, req *providers.ChatRequest) {
        ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
        defer cancel()

        start := time.Now()
        respBody, usage, err := provider.SendRequest(ctx, req)
        duration := time.Since(start)

        if err != nil {
                slog.Error("provider error",
                        "provider", provider.Name(),
                        "model", req.Model,
                        "duration", duration,
                        "error", err,
                )
                writeError(w, http.StatusBadGateway, "provider error: %v", err)
                return
        }

        slog.Info("chat completion response",
                "provider", provider.Name(),
                "model", req.Model,
                "duration", duration,
                "usage", fmt.Sprintf("in=%d out=%d", usage.InputTokens, usage.OutputTokens),
        )

        // TODO: billing deduction here

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        w.Write(respBody)
}

// handleStreaming proxies a streaming request with SSE.
func (h *Handler) handleStreaming(w http.ResponseWriter, r *http.Request, provider providers.Provider, req *providers.ChatRequest) {
        ctx, cancel := context.WithTimeout(r.Context(), 300*time.Second)

        stream, err := provider.SendStream(ctx, req)
        if err != nil {
                cancel()
                slog.Error("stream error", "provider", provider.Name(), "error", err)
                writeError(w, http.StatusBadGateway, "stream error: %v", err)
                return
        }
        defer stream.Close()
        defer cancel()

        // Set SSE headers
        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-cache")
        w.Header().Set("Connection", "keep-alive")
        w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

        flusher, canFlush := w.(http.Flusher)

        start := time.Now()
        totalOutput := 0

        // Read line by line to detect [DONE] and stop — many providers
        // (llama.cpp, OpenRouter) keep the connection open after sending
        // "data: [DONE]", which would cause blocking Read() on the buffer.
        scanner := bufio.NewScanner(stream)
        for scanner.Scan() {
                line := scanner.Text()
                w.Write([]byte(line + "\n"))
                if canFlush {
                        flusher.Flush()
                }
                totalOutput += len(line) + 1

                // Detect SSE stream termination
                if strings.Contains(line, "[DONE]") {
                        slog.Debug("stream [DONE] received", "provider", provider.Name())
                        break
                }
        }
        if err := scanner.Err(); err != nil {
                slog.Warn("stream read error", "provider", provider.Name(), "error", err)
        }

        duration := time.Since(start)
        slog.Info("stream completed",
                "provider", provider.Name(),
                "model", req.Model,
                "duration", duration,
                "bytes", totalOutput,
        )
}

// handleModels returns available models.
func (h *Handler) handleModels(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet {
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
                return
        }

        models := h.cfg.AvailableModels()
        resp := struct {
                Object string                `json:"object"`
                Data   []config.ListModelEntry `json:"data"`
        }{
                Object: "list",
                Data:   models,
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp)
}

// handleHealth returns server health status.
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
        status := struct {
                Status    string                  `json:"status"`
                Providers []proxy.ProviderStatus `json:"providers"`
        }{
                Status:    "ok",
                Providers: h.router.AllProviderStatuses(),
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(status)
}

// handleAdminProviders returns provider statuses.
func (h *Handler) handleAdminProviders(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet {
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
                return
        }
        statuses := h.router.AllProviderStatuses()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(statuses)
}

// handleAdminProxies returns proxy statuses.
// GET /api/admin/proxies — list all proxies
func (h *Handler) handleAdminProxies(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet {
                http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
                return
        }

        if h.proxyMgr == nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]interface{}{})
                return
        }

        statuses := h.proxyMgr.Statuses()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(statuses)
}

// handleAdminProxyAction handles actions on specific proxies.
// POST /api/admin/proxies/<id>/restart — restart a proxy
func (h *Handler) handleAdminProxyAction(w http.ResponseWriter, r *http.Request) {
        // Extract action and proxy ID from path: /api/admin/proxies/{id}/{action}
        path := strings.TrimPrefix(r.URL.Path, "/api/admin/proxies/")
        parts := strings.SplitN(path, "/", 2)
        if len(parts) < 2 {
                http.Error(w, "usage: /api/admin/proxies/{id}/restart", http.StatusBadRequest)
                return
        }

        proxyID := parts[0]
        action := parts[1]

        switch action {
        case "restart":
                if r.Method != http.MethodPost {
                        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
                        return
                }
                if h.proxyMgr == nil {
                        writeError(w, http.StatusServiceUnavailable, "proxy manager not configured")
                        return
                }
                if err := h.proxyMgr.RestartProxy(proxyID); err != nil {
                        writeError(w, http.StatusNotFound, "%v", err)
                        return
                }
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]string{
                        "status":  "ok",
                        "message": fmt.Sprintf("proxy %s restart initiated", proxyID),
                })
        default:
                http.Error(w, fmt.Sprintf("unknown action: %s", action), http.StatusBadRequest)
        }
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, code int, format string, args ...interface{}) {
        msg := fmt.Sprintf(format, args...)
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(code)
        json.NewEncoder(w).Encode(map[string]string{
                "error": msg,
        })
}

// isSSERequest checks if the request asks for SSE streaming.
func isSSERequest(r *http.Request) bool {
        // Check query parameter or Accept header
        if strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
                return true
        }
        return false
}

// copyStream copies data from reader to writer with flushing for SSE.
func copyStream(dst io.Writer, src io.ReadCloser, flusher http.Flusher) error {
        defer src.Close()
        buf := make([]byte, 4096)
        for {
                n, err := src.Read(buf)
                if n > 0 {
                        if _, err2 := dst.Write(buf[:n]); err2 != nil {
                                return err2
                        }
                        flusher.Flush()
                }
                if err != nil {
                        if err == io.EOF {
                                return nil
                        }
                        return err
                }
        }
}
