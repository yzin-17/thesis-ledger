import type { AppConfig } from '../platform/config.js';
import type { AiProvider } from './contracts.js';

type CompletionInput = {
  model: string;
  messages: unknown[];
  tools: string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const parseContent = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Provider 返回空内容');
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
};

const completionUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

export class OpenAiCompatibleProvider implements AiProvider {
  readonly metadata;

  constructor(
    readonly id: string,
    readonly models: readonly string[],
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 30_000,
  ) {
    this.metadata = { baseURL: baseUrl, health: 'unknown' as const, priority: 100 };
  }

  async complete(input: CompletionInput, signal: AbortSignal) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(completionUrl(this.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: input.tools.map((name) => ({ type: 'function', function: { name } })),
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.any([signal, timeout]),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const error = asRecord(payload)?.error;
      const message = asRecord(error)?.message;
      throw new Error(typeof message === 'string' ? message : `Provider HTTP ${response.status}`);
    }
    const root = asRecord(payload);
    const choice = Array.isArray(root?.choices) ? asRecord(root.choices[0]) : null;
    const message = asRecord(choice?.message);
    const usage = asRecord(root?.usage);
    if (!message || !('content' in message))
      throw new Error('Provider 响应缺少 choices[0].message.content');
    return {
      content: parseContent(message.content),
      inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
      outputTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : 0,
      cost: 0,
    };
  }
}

const parseResearchMarker = (messages: unknown[]) => {
  const user = messages.find((message) => {
    const record = asRecord(message);
    return record?.role === 'user' && typeof record.content === 'string';
  });
  const text = asRecord(user)?.content;
  if (typeof text !== 'string') return null;
  const marker = 'RESEARCH_REQUEST_JSON:';
  const index = text.indexOf(marker);
  if (index < 0) return null;
  try {
    return asRecord(JSON.parse(text.slice(index + marker.length)));
  } catch {
    return null;
  }
};

export class FixtureAiProvider implements AiProvider {
  readonly metadata = { health: 'healthy' as const, priority: 0 };

  constructor(
    readonly id = 'fixture',
    readonly models = ['research-fixture'],
  ) {}

  complete(input: CompletionInput) {
    const marker = parseResearchMarker(input.messages);
    const evidence = Array.isArray(marker?.evidence) ? marker.evidence : [];
    const citations = evidence.flatMap((entry) => {
      const record = asRecord(entry);
      return Array.isArray(record?.citations) ? (record.citations as unknown[]) : [];
    });
    const result = {
      version: 1,
      provider: this.id,
      conclusion: '已完成基于当前可用证据的研究，建议结合未知项继续核验。',
      evidence:
        evidence.length > 0
          ? evidence
          : [
              {
                claim: '当前没有可用的服务端证据，无法形成可靠结论。',
                citations,
              },
            ],
      risks: ['证据覆盖范围受当前 Tool 可用性限制。'],
      unknowns: ['Provider 未提供额外的反方证据。'],
      signals: [],
      disclaimer: '这是演示 Provider 的结构化结果，不构成投资建议。',
      ...(marker?.context ? { context: marker.context } : {}),
      createdAt: new Date().toISOString(),
    };
    return Promise.resolve({ content: result, inputTokens: 0, outputTokens: 0, cost: 0 });
  }
}

export const createConfiguredAiProviders = (config: AppConfig): AiProvider[] => {
  const providers: AiProvider[] = [];
  if (config.aiBaseUrl && config.aiApiKey && config.aiModel) {
    providers.push(
      new OpenAiCompatibleProvider(
        config.aiProviderId ?? 'openai-compatible',
        [config.aiModel],
        config.aiBaseUrl,
        config.aiApiKey,
        config.aiTimeoutMs,
      ),
    );
  }
  if (config.aiFixtureEnabled || config.environment === 'test')
    providers.push(new FixtureAiProvider());
  return providers;
};
