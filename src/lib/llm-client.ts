import type { LLMProvider } from './types';
import { nativeRequest, isNativePlatform } from './nativeHttp';

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

/**
 * Build common headers for LLM API requests
 */
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
    return { ok: true, message: `Провайдер работает. Модель: ${data.model ?? provider.model}. Ответ: "${content.slice(0, 50)}"` };
  } catch (err) {
    return { ok: false, message: `Ошибка соединения: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}` };
  }
}

/**
 * Streaming call to LLM using SSE (OpenAI-compatible).
 * Yields content chunks as they arrive. Returns final usage stats.
 *
 * On native Android: uses nativeRequest to get the full response, then
 * simulates streaming by parsing SSE data lines and calling onChunk progressively.
 * This is necessary because WebView fetch is blocked by CORS/mixed content.
 */
export async function callLLMStream(
  provider: LLMProvider,
  messages: LLMMessage[],
  temperature: number = 0.7,
  maxTokens?: number,
  onChunk: (text: string) => void
): Promise<Pick<LLMResponse, 'model' | 'provider' | 'usage'>> {
  const headers = buildHeaders(provider);

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature,
    stream: true,
  };
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;

  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  if (isNativePlatform()) {
    // Native path: get full response, parse SSE lines
    const res = await nativeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`LLM API error (${res.status}): ${res.body}`);
    }

    // Parse SSE lines from response body
    let totalContent = '';
    let model = provider.model;
    let usage: LLMResponse['usage'];

    for (const line of res.body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            totalContent += delta.content;
            onChunk(totalContent);
          }
          if (json.model) model = json.model;
          if (json.usage) usage = json.usage;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    return { model, provider: provider.name, usage };
  }

  // Browser path: use fetch() with ReadableStream for true streaming
  const fetchRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!fetchRes.ok) {
    const errText = await fetchRes.text().catch(() => 'Unknown error');
    throw new Error(`LLM API error (${fetchRes.status}): ${errText}`);
  }

  const reader = fetchRes.body?.getReader();
  if (!reader) throw new Error('Streaming не поддерживается: тело ответа пустое');

  const decoder = new TextDecoder();
  let buffer = '';
  let totalContent = '';
  let model = provider.model;
  let usage: LLMResponse['usage'];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') continue;

      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            totalContent += delta.content;
            onChunk(totalContent);
          }
          if (json.model) model = json.model;
          if (json.usage) usage = json.usage;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  }

  return { model, provider: provider.name, usage };
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
