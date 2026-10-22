import { NextRequest } from 'next/server';

/**
 * CORS-bypass proxy for LLM API requests.
 *
 * Browser (PWA) mode cannot make cross-origin fetch() calls to external
 * LLM endpoints (OpenRouter, OpenAI, etc.) due to CORS. This server-side
 * route proxies those requests, eliminating CORS restrictions.
 *
 * On Capacitor Android, native Java HTTP bypasses CORS directly, so this
 * proxy is only used in browser/PWA mode.
 *
 * NOTE: This route works during `next dev`. With `output: "export"` in
 * next.config.ts, it is excluded from the static build — the client will
 * detect this and fall back to direct fetch() (which may have CORS issues
 * for some providers; users should use CORS-friendly providers or the
 * Android APK in that case).
 *
 * Headers:
 *   X-Target-Url       — the real LLM endpoint URL
 *   X-Forwarded-Auth   — the Authorization header value (e.g. "Bearer sk-...")
 *   X-Forwarded-Headers — JSON object of additional custom headers
 *
 * Body: standard OpenAI-compatible request payload (forwarded as-is).
 * Response: transparently proxied, including SSE streaming.
 * All responses include X-Proxied: true header for client detection.
 */
export async function POST(req: NextRequest) {
  const targetUrl = req.headers.get('X-Target-Url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing X-Target-Url header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'X-Proxied': 'true' },
    });
  }

  const authHeader = req.headers.get('X-Forwarded-Auth') || '';
  const customHeadersStr = req.headers.get('X-Forwarded-Headers') || '{}';
  let customHeaders: Record<string, string> = {};
  try {
    customHeaders = JSON.parse(customHeadersStr);
  } catch {
    // Ignore malformed headers JSON
  }

  // Build target request headers
  const targetHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (authHeader) {
    targetHeaders['Authorization'] = authHeader;
  }

  // Read request body
  const body = await req.text();
  const isStream = body.includes('"stream"') && body.includes('true');

  // Server-side fetch — no CORS restrictions
  let targetRes: Response;
  try {
    targetRes = await fetch(targetUrl, {
      method: 'POST',
      headers: targetHeaders,
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upstream error';
    return new Response(JSON.stringify({ error: `Upstream fetch failed: ${message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'X-Proxied': 'true' },
    });
  }

  if (!targetRes.ok) {
    const errText = await targetRes.text();
    return new Response(errText, {
      status: targetRes.status,
      headers: { 'Content-Type': 'application/json', 'X-Proxied': 'true' },
    });
  }

  // Streaming: pipe SSE response directly
  if (isStream && targetRes.body) {
    return new Response(targetRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Proxied': 'true',
      },
    });
  }

  // Non-streaming: return JSON response
  const data = await targetRes.text();
  return new Response(data, {
    headers: { 'Content-Type': 'application/json', 'X-Proxied': 'true' },
  });
}
