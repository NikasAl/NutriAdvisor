package providers

import (
        "context"
        "io"
        "net/http"
)

// ResponseUsage holds token usage data returned by a provider.
type ResponseUsage struct {
        InputTokens  int `json:"prompt_tokens"`
        OutputTokens int `json:"completion_tokens"`
        TotalTokens  int `json:"total_tokens"`
}

// ChatRequest is the standard OpenAI-compatible chat completion request.
type ChatRequest struct {
        Model       string          `json:"model"`
        Messages    []Message       `json:"messages"`
        MaxTokens   int             `json:"max_tokens,omitempty"`
        Temperature float64         `json:"temperature,omitempty"`
        TopP        float64         `json:"top_p,omitempty"`
        Stream      bool            `json:"stream,omitempty"`
        Reasoning   *ReasoningParams `json:"reasoning,omitempty"`
        // Vision: one message can have image_url content parts
}

// ReasoningParams enables reasoning/thinking mode (e.g. GLM-5.3-Flash on modal.com).
type ReasoningParams struct {
        Enabled bool `json:"enabled"`
}

// Message represents a single chat message.
type Message struct {
        Role    string   `json:"role"`
        Content any      `json:"content"` // string or []ContentPart
}

// ContentPart is used for multimodal (vision) messages.
type ContentPart struct {
        Type     string    `json:"type"`
        Text     string    `json:"text,omitempty"`
        ImageURL *ImageURL `json:"image_url,omitempty"`
}

// ImageURL holds a base64-encoded or URL image.
type ImageURL struct {
        URL string `json:"url"`
}

// ChatResponseChunk represents one SSE chunk from a streaming response.
type ChatResponseChunk struct {
        ID      string `json:"id"`
        Object  string `json:"object"`
        Created int64  `json:"created"`
        Model   string `json:"model"`
        Choices []ChoiceChunk `json:"choices"`
}

// ChoiceChunk holds one delta choice in a streaming chunk.
type ChoiceChunk struct {
        Index        int             `json:"index"`
        Delta        Delta           `json:"delta"`
        FinishReason *string        `json:"finish_reason"`
}

// Delta holds incremental content in a streaming response.
type Delta struct {
        Role    string `json:"role,omitempty"`
        Content string `json:"content,omitempty"`
}

// TransportSetter is an optional interface for providers that support
// replacing their HTTP transport (e.g. to inject a SOCKS5 proxy).
type TransportSetter interface {
        SetTransport(t *http.Transport)
}

// Provider is the interface that all LLM provider adapters must implement.
type Provider interface {
        // Name returns the provider configuration name.
        Name() string

        // SendRequest sends a non-streaming request and returns the full response.
        SendRequest(ctx context.Context, req *ChatRequest) ([]byte, *ResponseUsage, error)

        // SendStream sends a streaming request and returns an SSE reader.
        // The caller must read all data and close the reader.
        SendStream(ctx context.Context, req *ChatRequest) (io.ReadCloser, error)

        // IsActive returns whether the provider is currently available.
        IsActive() bool

        // SetActive marks the provider as active/inactive.
        SetActive(bool)
}
