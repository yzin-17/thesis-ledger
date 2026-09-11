import { z } from 'zod';
import type { AppConfig } from '../platform/config.js';
import type { AiProvider } from './contracts.js';

type CompletionInput = {
  model: string;
  messages: unknown[];
  tools: string[];
};

const providerConfigSchema = z
  .array(
    z
      .object({
        id: z.string().trim().min(1).max(120),
        baseUrl: z.url(),
        apiKey: z.string().trim().min(1),
        models: z.array(z.string().trim().min(1).max(200)).min(1),
        timeoutMs: z.number().int().positive().optional(),
      })
      .strict(),
  )
  .max(12)
  .superRefine((providers, context) => {
    const ids = providers.map((provider) => provider.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'AI Provider id 必须唯一' });
    providers.forEach((provider, index) => {
      if (new Set(provider.models).size !== provider.models.length)
        context.addIssue({
          code: 'custom',
          path: [index, 'models'],
          message: '同一 Provider 的模型不得重复',
        });
    });
  });

export type ConfiguredAiProviderInput = z.infer<typeof providerConfigSchema>[number];

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

const parseMarker = (messages: unknown[], marker: string) => {
  const user = messages.find((message) => {
    const record = asRecord(message);
    return record?.role === 'user' && typeof record.content === 'string' && record.content.includes(marker);
  });
  const text = asRecord(user)?.content;
  if (typeof text !== 'string') return null;
  const index = text.indexOf(marker);
  if (index < 0) return null;
  try {
    return asRecord(JSON.parse(text.slice(index + marker.length)));
  } catch {
    return null;
  }
};

const parseResearchMarker = (messages: unknown[]) => parseMarker(messages, 'RESEARCH_REQUEST_JSON:');
const parseOptimizationMarker = (messages: unknown[]) =>
  parseMarker(messages, 'OPTIMIZATION_REQUEST_JSON:');

const fixtureOptimizationProposal = (marker: Record<string, unknown>) => {
  const authorized = Array.isArray(marker.authorizedParameters) ? marker.authorizedParameters : [];
  const first = authorized.map(asRecord).find((item): item is Record<string, unknown> => item !== null);
  if (!first || typeof first.parameterId !== 'string') throw new Error('Fixture 优化请求缺少授权参数');
  const range = asRecord(first.optimizationRange) ?? asRecord(first.schemaRange);
  const candidateValue = range?.min ?? first.currentValue;
  if (typeof candidateValue !== 'string' && typeof candidateValue !== 'number')
    throw new Error('Fixture 优化参数缺少可用取值');
  return {
    changes: [{ parameterId: first.parameterId, value: candidateValue }],
    reason: 'Fixture Provider 选择授权范围内的确定性候选值，用于验证优化编排闭环。',
    evidenceRefs: [],
  };
};

export class FixtureAiProvider implements AiProvider {
  readonly metadata = { health: 'healthy' as const, priority: 0 };

  constructor(
    readonly id = 'fixture',
    readonly models = ['research-fixture'],
  ) {}

  complete(input: CompletionInput) {
    const optimization = parseOptimizationMarker(input.messages);
    if (optimization) {
      return Promise.resolve({
        content: fixtureOptimizationProposal(optimization),
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      });
    }
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

export const parseConfiguredAiProviderInputs = (raw: string | undefined) => {
  if (!raw) return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('AI_PROVIDER_CONFIGS_JSON 不是合法 JSON');
  }
  const parsed = providerConfigSchema.safeParse(decoded);
  if (!parsed.success) throw new Error('AI_PROVIDER_CONFIGS_JSON 配置无效');
  return parsed.data;
};

const providerFromInput = (input: ConfiguredAiProviderInput, defaultTimeoutMs: number) =>
  new OpenAiCompatibleProvider(
    input.id,
    input.models,
    input.baseUrl,
    input.apiKey,
    input.timeoutMs ?? defaultTimeoutMs,
  );

export const createConfiguredAiProviders = (config: AppConfig): AiProvider[] => {
  const providers: AiProvider[] = parseConfiguredAiProviderInputs(config.aiProviderConfigsJson).map(
    (input) => providerFromInput(input, config.aiTimeoutMs),
  );
  const configuredIds = new Set(providers.map((provider) => provider.id));
  if (config.aiBaseUrl && config.aiApiKey && config.aiModel) {
    const id = config.aiProviderId ?? 'openai-compatible';
    if (!configuredIds.has(id)) {
      providers.push(
        new OpenAiCompatibleProvider(
          id,
          [config.aiModel],
          config.aiBaseUrl,
          config.aiApiKey,
          config.aiTimeoutMs,
        ),
      );
    }
  }
  if (config.aiFixtureEnabled || config.environment === 'test') {
    const fixture = new FixtureAiProvider();
    if (!configuredIds.has(fixture.id) && !providers.some((provider) => provider.id === fixture.id))
      providers.push(fixture);
  }
  return providers;
};
