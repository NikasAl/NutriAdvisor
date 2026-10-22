/**
 * Native HTTP plugin — makes requests through Java HttpURLConnection,
 * bypassing Android WebView CORS and mixed content restrictions.
 * Only available in Capacitor (Android APK). Falls back to fetch() in browser.
 *
 * In browser (PWA) mode, tries to route requests through /api/llm CORS proxy
 * to avoid cross-origin restrictions on external LLM endpoints. If the proxy
 * is unavailable (e.g. static export without API routes), falls back to
 * direct fetch() which may have CORS issues with some providers.
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

// ── CORS proxy helpers ──────────────────────────────────────────────

/**
 * Cached proxy availability: null = unknown, true = available, false = unavailable.
 * After first probe, all subsequent requests skip the unavailable proxy.
 */
let _proxyAvailable: boolean | null = null;

/**
 * Build fetch init for the /api/llm CORS proxy.
 * Moves the original URL and auth into proxy headers so the server-side
 * route can forward the request without browser CORS restrictions.
 * Exported for use in llm-client.ts browser streaming path.
 */
export function buildProxyInit(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {}
): { url: string; init: RequestInit } {
  const hdrs = options.headers || {};
  const auth = hdrs['Authorization'] || hdrs['authorization'] || '';
  const customHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(hdrs)) {
    const lk = k.toLowerCase();
    if (lk !== 'content-type' && lk !== 'authorization') {
      customHeaders[k] = v;
    }
  }
  return {
    url: '/api/llm',
    init: {
      method: options.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Target-Url': url,
        'X-Forwarded-Auth': auth,
        'X-Forwarded-Headers': JSON.stringify(customHeaders),
      },
      body: options.body,
      signal: options.signal,
    },
  };
}

/**
 * Check if a response came from our proxy (has X-Proxied header)
 * or from the static file server (404 = proxy route not available).
 */
function isFromProxy(res: Response): boolean {
  return res.headers.get('X-Proxied') === 'true';
}

/**
 * Should we attempt the CORS proxy?
 * Returns false if we already know it's unavailable.
 */
export function shouldTryProxy(): boolean {
  return !isNativePlatform() && _proxyAvailable !== false;
}

/**
 * Mark proxy as available or unavailable after a probe.
 */
export function markProxyAvailability(available: boolean) {
  _proxyAvailable = available;
}

/**
 * Attempt a fetch through the CORS proxy, falling back to direct fetch
 * if the proxy is unavailable (404 without X-Proxied header) or fails.
 */
export async function proxyFetchWithFallback(
  url: string,
  directInit: RequestInit,
  timeoutMs: number = 300_000
): Promise<Response> {
  // If proxy is known unavailable, go direct
  if (_proxyAvailable === false) {
    return fetch(url, { ...directInit, signal: AbortSignal.timeout(timeoutMs) });
  }

  try {
    const { url: proxyUrl, init: proxyInit } = buildProxyInit(url, {
      method: directInit.method as string | undefined,
      headers: directInit.headers as Record<string, string> | undefined,
      body: directInit.body as string | undefined,
    });
    const res = await fetch(proxyUrl, { ...proxyInit, signal: AbortSignal.timeout(timeoutMs) });

    // If 404 without X-Proxied → proxy route doesn't exist (static export)
    if (res.status === 404 && !isFromProxy(res)) {
      _proxyAvailable = false;
      // Retry with direct fetch
      return fetch(url, { ...directInit, signal: AbortSignal.timeout(timeoutMs) });
    }

    // Proxy responded (even with error status from upstream)
    _proxyAvailable = true;
    return res;
  } catch {
    // Network error reaching proxy → it's unavailable
    _proxyAvailable = false;
    // Fall back to direct fetch
    return fetch(url, { ...directInit, signal: AbortSignal.timeout(timeoutMs) });
  }
}

// ── Request functions ────────────────────────────────────────────────

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

  // Browser: try CORS proxy, fall back to direct fetch
  const res = await proxyFetchWithFallback(url, {
    method: options.method ?? 'POST',
    headers: options.headers ?? {},
    body: options.body,
  });

  const responseBody = await res.text();
  return { status: res.status, body: responseBody };
}

/**
 * Streaming HTTP request via native plugin events.
 * On native: uses requestStream() with notifyListeners for true chunk-by-chunk delivery.
 * On browser: uses fetch() with ReadableStream, through CORS proxy with fallback.
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
    signal?: AbortSignal;
    onLine: (line: string) => void;
    onDone: (status: number) => void;
    onError: (message: string) => void;
  }
): Promise<() => void> {
  const { method, headers, body, signal, onLine, onDone, onError } = options;

  if (isNativePlatform()) {
    // Set up listeners before starting the request
    let cleanup = async () => {
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

    // If an external signal is provided, abort native stream when it fires
    if (signal) {
      if (signal.aborted) {
        cleanup();
        return cleanup;
      }
      const onAbort = () => { cleanup(); };
      signal.addEventListener('abort', onAbort, { once: true });
      const origCleanup = cleanup;
      cleanup = async () => {
        signal.removeEventListener('abort', onAbort);
        await origCleanup();
      };
    }

    return cleanup;
  }

  // Browser: try CORS proxy with fallback to direct fetch
  const controller = new AbortController();

  // If external signal provided, bridge its abort to our controller
  let externalAbortHandler: (() => void) | undefined;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      externalAbortHandler = () => controller.abort();
      signal.addEventListener('abort', externalAbortHandler, { once: true });
    }
  }

  (async () => {
    try {
      let res: Response;

      if (shouldTryProxy()) {
        // Try CORS proxy first
        const { url: proxyUrl, init: proxyInit } = buildProxyInit(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        res = await fetch(proxyUrl, proxyInit);

        // If 404 without X-Proxied → proxy unavailable, retry direct
        if (res.status === 404 && !isFromProxy(res)) {
          markProxyAvailability(false);
          res = await fetch(url, {
            method: method ?? 'POST',
            headers: headers ?? {},
            body,
            signal: controller.signal,
          });
        } else {
          markProxyAvailability(true);
        }
      } else {
        // Proxy known unavailable, go direct
        res = await fetch(url, {
          method: method ?? 'POST',
          headers: headers ?? {},
          body,
          signal: controller.signal,
        });
      }

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
      if (controller.signal.aborted) return;
      onError(err instanceof Error ? err.message : 'Stream error');
    }
  })();

  return () => {
    if (externalAbortHandler && signal) {
      signal.removeEventListener('abort', externalAbortHandler);
    }
    controller.abort();
  };
}
