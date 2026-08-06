package handlers

import (
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
	cfg    *config.Config
	router *proxy.Router
}

// NewHandler creates a new handler group.
func NewHandler(cfg *config.Config, router *proxy.Router) *Handler {
	return &Handler{cfg: cfg, router: router}
}

// RegisterRoutes registers all HTTP routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/v1/chat/completions", h.handleChatCompletions)
	mux.HandleFunc("/v1/models", h.handleModels)
	mux.HandleFunc("/health", h.handleHealth)
	mux.HandleFunc("/api/admin/providers", h.handleAdminProviders)
	mux.HandleFunc("/api/admin/proxies", h.handleAdminProxies)
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

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering

	flusher, canFlush := w.(http.Flusher)

	start := time.Now()
	totalOutput := 0

	// Stream data to client
	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			if canFlush {
				flusher.Flush()
			}
			totalOutput += n
		}
		if err != nil {
			break
		}
	}

	stream.Close()
	cancel()

	duration := time.Since(start)
	slog.Info("stream completed",
		"provider", provider.Name(),
		"model", req.Model,
		"duration", duration,
		"bytes", totalOutput,
	)
	// Note: usage is extracted from the final SSE chunk by the client,
	// so we don't have accurate token counts on the server side for streaming.
	// TODO: consider parsing the final [DONE] chunk for usage.
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

// handleAdminProxies returns proxy statuses (placeholder for now).
func (h *Handler) handleAdminProxies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// TODO: integrate with proxyctl
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]interface{}{})
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
