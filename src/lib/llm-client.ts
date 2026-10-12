import type { LLMProvider } from './types';
import { nativeRequest, nativeStreamRequest, isNativePlatform } from './nativeHttp';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export function buildVisionMessages(imageBase64: string): LLMMessage[] {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Опиши подробно что ты видишь на этом изображении. Особое внимание удели еде и продуктам питания. Укажи названия блюд, ингредиенты, примерные порции. Будь максимально детальным в описании еды.',
        },
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:')
              ? imageBase64
              : `data:image/jpeg;base64,${imageBase64}`,
          },
        },
      ],
    },
  ];
}

export function buildChatMessages(
  systemPrompt: string,
  history: LLMMessage[],
  userMessage: string
): LLMMessage[] {
  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];
  messages.push(...history);
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

function buildHeaders(provider: LLMProvider): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }
  if (provider.headers) {
    Object.assign(headers, provider.headers);
  }
  return headers;
}

export async function testProvider(provider: LLMProvider): Promise<{ ok: boolean; message: string }> {
  const headers = buildHeaders(provider);

  try {
    const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const res = await nativeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    });

    if (res.status < 200 || res.status >= 300) {
      return { ok: false, message: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    }

    const data = JSON.parse(res.body);
    const content = data.choices?.[0]?.message?.content ?? '';
    let message = `Провайдер работает. Модель: ${data.model ?? provider.model}. Ответ: "${content.slice(0, 50)}"`;

    // Test Vision if enabled
    if (provider.supportsVision) {
      try {
        const visionRes = await nativeRequest(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: provider.model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'What do you see?' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' } },
              ],
            }],
            max_tokens: 5,
          }),
        });

        if (visionRes.status < 200 || visionRes.status >= 300) {
          message += ' ⚠️ Vision не поддерживается этой моделью';
        } else {
          const visionData = JSON.parse(visionRes.body);
          if (visionData.choices?.[0]?.message?.content) {
            message += ' ✅ Vision работает';
          } else {
            message += ' ⚠️ Vision: пустой ответ';
          }
        }
      } catch {
        message += ' ⚠️ Vision: ошибка запроса';
      }
    }

    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: `Ошибка соединения: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}` };
  }
}

/**
 * Creates a throttled, visibility-aware wrapper around an onChunk callback.
 *
 * Problem: When the phone screen turns off during streaming, the Android WebView
 * JS thread is throttled but Capacitor bridge events queue up. When the screen
 * turns back on, all queued events fire in rapid succession — each triggering
 * a full Zustand state update → React re-render → markdown parse → DOM rebuild.
 * This causes a multi-second white screen freeze.
 *
 * Solution:
 * - Throttle updates to at most every ~50ms (even in foreground)
 * - When document.hidden (screen off), buffer the latest content without updating
 * - When document becomes visible, immediately flush the buffered content
 * - Always flush final content on cleanup
 */
function createThrottledChunkHandler(
  onChunk: (text: string) => void
): { handler: (text: string) => void; flushFinal: () => void } {
  let latestContent: string | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastUpdateTime = 0;
  let isVisible = typeof document !== 'undefined' ? !document.hidden : true;
  const THROTTLE_MS = 50;

  const flush = () => {
    timerId = null;
    if (latestContent !== null) {
      const content = latestContent;
      latestContent = null;
      lastUpdateTime = Date.now();
      onChunk(content);
    }
  };

  const scheduleFlush = () => {
    if (timerId !== null) return; // Already scheduled
    const elapsed = Date.now() - lastUpdateTime;
    if (elapsed >= THROTTLE_MS) {
      // Enough time passed — flush synchronously on next microtask
      timerId = setTimeout(flush, 0);
    } else {
      timerId = setTimeout(flush, THROTTLE_MS - elapsed);
    }
  };

  const handler = (text: string) => {
    latestContent = text;
    if (!isVisible) return; // Buffer only, don't schedule updates
    scheduleFlush();
  };

  // Visibility change listener — flush immediately when becoming visible
  const onVisChange = () => {
    const nowVisible = typeof document !== 'undefined' ? !document.hidden : true;
    if (nowVisible && !isVisible) {
      // Becoming visible — cancel any pending timer and flush immediately
      isVisible = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (latestContent !== null) {
        flush(); // Immediate single update with latest buffered content
      }
    } else {
      isVisible = nowVisible;
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisChange);
  }

  // flushFinal: call when stream is done to deliver the last content
  // and clean up the visibility listener
  const flushFinal = () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisChange);
    }
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    // Always deliver final content
    if (latestContent !== null) {
      const content = latestContent;
      latestContent = null;
      onChunk(content);
    }
  };

  return { handler, flushFinal };
}

/**
 * Parse SSE data lines from a stream and extract content chunks.
 * Accumulates content and calls onChunk with the full content so far.
 */
function parseSSELines(
  lines: string[],
  state: { totalContent: string; model: string; usage: LLMResponse['usage'] },
  provider: LLMProvider,
  onChunk: (text: string) => void
) {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') continue;

    if (trimmed.startsWith('data: ')) {
      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          state.totalContent += delta.content;
          onChunk(state.totalContent);
        }
        if (json.model) state.model = json.model;
        if (json.usage) state.usage = json.usage;
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

/**
 * Options for callLLMStream.
 */
export interface LLMStreamOptions {
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Streaming call to LLM using SSE (OpenAI-compatible).
 * True streaming on both native (via Java InputStream + notifyListeners)
 * and browser (via fetch ReadableStream).
 */
export async function callLLMStream(
  provider: LLMProvider,
  messages: LLMMessage[],
  onChunk: (text: string) => void,
  temperature: number = 0.7,
  options?: LLMStreamOptions
): Promise<Pick<LLMResponse, 'model' | 'provider' | 'usage'>> {
  const { maxTokens, signal } = options ?? {};
  const headers = buildHeaders(provider);

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature,
    stream: true,
  };
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;

  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  // Wrap onChunk with throttled + visibility-aware handler to prevent
  // UI freeze when phone screen turns off during streaming
  const { handler: throttledOnChunk, flushFinal } = createThrottledChunkHandler(onChunk);

  try {
    if (isNativePlatform()) {
      // Native path: true streaming via requestStream + notifyListeners
      return await new Promise<Pick<LLMResponse, 'model' | 'provider' | 'usage'>>((resolve, reject) => {
        const state = { totalContent: '', model: provider.model, usage: undefined as LLMResponse['usage'] };
        let settled = false;
        let cleanupFn: (() => void) | null = null;

        const finish = (result: 'resolve' | 'reject', value: any) => {
          if (settled) return;
          settled = true;
          if (signal) signal.removeEventListener('abort', onAbort);
          if (result === 'resolve') resolve(value);
          else reject(value);
        };

        const onAbort = () => {
          if (cleanupFn) { cleanupFn(); cleanupFn = null; }
          finish('reject', new DOMException('Aborted', 'AbortError'));
        };

        if (signal) {
          if (signal.aborted) { finish('reject', new DOMException('Aborted', 'AbortError')); return; }
          signal.addEventListener('abort', onAbort, { once: true });
        }

        nativeStreamRequest(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal,
          onLine: (line: string) => {
            if (settled) return;
            // Parse line-by-line as they arrive from Java
            // Use throttledOnChunk instead of raw onChunk
            parseSSELines([line], state, provider, throttledOnChunk);
          },
          onDone: (_status: number) => {
            flushFinal(); // Deliver any buffered final content
            finish('resolve', { model: state.model, provider: provider.name, usage: state.usage });
          },
          onError: (message: string) => {
            finish('reject', new Error(`LLM stream error: ${message}`));
          },
        }).then((cleanup) => { cleanupFn = cleanup; });
      });
    }

    // Browser path: fetch() with ReadableStream for true streaming
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!fetchRes.ok) {
      const errText = await fetchRes.text().catch(() => 'Unknown error');
      throw new Error(`LLM API error (${fetchRes.status}): ${errText}`);
    }

    const reader = fetchRes.body?.getReader();
    if (!reader) throw new Error('Streaming не поддерживается: тело ответа пустое');

    const decoder = new TextDecoder();
    let buffer = '';
    const state = { totalContent: '', model: provider.model, usage: undefined as LLMResponse['usage'] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      parseSSELines(lines, state, provider, throttledOnChunk);
    }

    // Process remaining buffer
    if (buffer) {
      parseSSELines([buffer], state, provider, throttledOnChunk);
    }

    flushFinal(); // Deliver any buffered final content
    return { model: state.model, provider: provider.name, usage: state.usage };
  } catch (err) {
    flushFinal(); // Clean up even on error
    throw err;
  }
}

export async function callLLM(
  provider: LLMProvider,
  messages: LLMMessage[],
  temperature: number = 0.7,
  maxTokens?: number
): Promise<LLMResponse> {
  const headers = buildHeaders(provider);

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature,
  };
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;

  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await nativeRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`LLM API error (${res.status}): ${res.body}`);
  }

  const data = JSON.parse(res.body);
  const content = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage ?? undefined;

  return {
    content,
    model: data.model ?? provider.model,
    provider: provider.name,
    usage,
  };
}
