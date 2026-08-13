/**
 * Native HTTP plugin — makes requests through Java HttpURLConnection,
 * bypassing Android WebView CORS and mixed content restrictions.
 * Only available in Capacitor (Android APK). Falls back to fetch() in browser.
 *
 * Supports two modes:
 * - nativeRequest(): full response at once (for non-streaming calls)
 * - nativeStreamRequest(): true streaming via Capacitor events (for LLM SSE)
 */

import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface NativeHttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface NativeHttpResponse {
  status: number;
  body: string;
}

interface NativeHttpPlugin {
  request(options: NativeHttpRequest): Promise<NativeHttpResponse>;
  requestStream(options: NativeHttpRequest): Promise<void>;
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/** Check if we're running inside Capacitor native shell */
export function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

const NativeHttp = registerPlugin<NativeHttpPlugin>('NativeHttp');

/**
 * Make a non-streaming HTTP request.
 */
export async function nativeRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<NativeHttpResponse> {
  if (isNativePlatform()) {
    return NativeHttp.request({
      url,
      method: options.method ?? 'POST',
      headers: options.headers ?? {},
      body: options.body,
    });
  }

  const res = await fetch(url, {
    method: options.method ?? 'POST',
    headers: options.headers ?? {},
    body: options.body,
    signal: AbortSignal.timeout(300_000),
  });

  const responseBody = await res.text();
  return { status: res.status, body: responseBody };
}

/**
 * Streaming HTTP request via native plugin events.
 * On native: uses requestStream() with notifyListeners for true chunk-by-chunk delivery.
 * On browser: uses fetch() with ReadableStream.
 *
 * Callbacks:
 * - onLine(line: string) — called for each line from the response
 * - onDone(status: number) — called when stream is complete
 * - onError(message: string) — called on error
 *
 * Returns a cleanup function to remove listeners and optionally abort.
 */
export async function nativeStreamRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    onLine: (line: string) => void;
    onDone: (status: number) => void;
    onError: (message: string) => void;
  }
): Promise<() => void> {
  const { method, headers, body, onLine, onDone, onError } = options;

  if (isNativePlatform()) {
    // Set up listeners before starting the request
    const cleanup = async () => {
      try { await NativeHttp.removeAllListeners(); } catch {}
    };

    await NativeHttp.addListener('streamChunk', (data: { line: string }) => {
      onLine(data.line);
    });

    await NativeHttp.addListener('streamDone', (data: { status: number }) => {
      onDone(data.status);
      cleanup();
    });

    await NativeHttp.addListener('streamError', (data: { status?: number; message: string }) => {
      onError(data.message);
      cleanup();
    });

    // Start the streaming request
    await NativeHttp.requestStream({
      url,
      method: method ?? 'POST',
      headers: headers ?? {},
      body,
    });

    return cleanup;
  }

  // Browser: use fetch with ReadableStream
  const controller = new AbortController();
  const signal = controller.signal;

  (async () => {
    try {
      const res = await fetch(url, {
        method: method ?? 'POST',
        headers: headers ?? {},
        body,
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        onError(`HTTP ${res.status}: ${errText}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError('ReadableStream not supported');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          onLine(line);
        }
      }

      // Process remaining buffer
      if (buffer) {
        onLine(buffer);
      }

      onDone(res.status);
    } catch (err) {
      if (signal.aborted) return;
      onError(err instanceof Error ? err.message : 'Stream error');
    }
  })();

  return () => controller.abort();
}
