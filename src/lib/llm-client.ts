import type { LLMProvider } from './types';

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

export async function testProvider(provider: LLMProvider): Promise<{ ok: boolean; message: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      return { ok: false, message: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return { ok: true, message: `Провайдер работает. Модель: ${data.model ?? provider.model}. Ответ: "${content.slice(0, 50)}"` };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: 'Таймаут (10 сек) — сервер не отвечает' };
    }
    return { ok: false, message: `Ошибка соединения: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}` };
  }
}

export async function callLLM(
  provider: LLMProvider,
  messages: LLMMessage[],
  temperature: number = 0.7,
  maxTokens?: number
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add Authorization header if API key is present
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  if (provider.headers) {
    Object.assign(headers, provider.headers);
  }

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature,
  };
  if (maxTokens !== undefined) payload.max_tokens = maxTokens;

  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`LLM API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage ?? undefined;

  return {
    content,
    model: data.model ?? provider.model,
    provider: provider.name,
    usage,
  };
}
