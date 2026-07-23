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

export async function callLLM(
  provider: LLMProvider,
  messages: LLMMessage[],
  temperature: number = 0.7,
  maxTokens?: number
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  };

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
