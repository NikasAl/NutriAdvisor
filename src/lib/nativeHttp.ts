/**
 * Native HTTP plugin — makes requests through Java HttpURLConnection,
 * bypassing Android WebView CORS and mixed content restrictions.
 * Only available in Capacitor (Android APK). Falls back to fetch() in browser.
 */

import { registerPlugin } from '@capacitor/core';

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
}

/** Check if we're running inside Capacitor native shell */
export function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
}

const NativeHttp = registerPlugin<NativeHttpPlugin>('NativeHttp');

/**
 * Make an HTTP request. Uses native plugin on Android (bypasses CORS/mixed content),
 * regular fetch() in browser.
 */
export async function nativeRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<NativeHttpResponse> {
  // On native Android, use the Capacitor plugin (bypasses WebView restrictions)
  if (isNativePlatform()) {
    return NativeHttp.request({
      url,
      method: options.method ?? 'POST',
      headers: options.headers ?? {},
      body: options.body,
    });
  }

  // In browser, use regular fetch()
  const res = await fetch(url, {
    method: options.method ?? 'POST',
    headers: options.headers ?? {},
    body: options.body,
  });

  const responseBody = await res.text();
  return { status: res.status, body: responseBody };
}
