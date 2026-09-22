import { z } from 'zod';
import { createHash } from 'node:crypto';
import { DEFAULT_AI_TIMEOUT_MS, type AppConfig } from '../platform/config.js';
import type {
  AiProvider,
  AiProviderHealth,
  AiProviderModelReasoningMetadata,
} from './contracts.js';
import {
  aiProviderExecutionRouteInputSchema,
  aiProviderModelReasoningSchema,
  aiProviderModelPricingViewSchema,
  type AiProviderExecutionRouteInput,
  type AiProviderModelPricingView,
} from './ai-provider.contracts.js';
import {
  aiLegacyAdapterSchema,
  aiAuthModeSchema as sharedAiAuthModeSchema,
  aiChatImplementationSchema,
  aiUpstreamFormatSchema,
  aiUpstreamSelectionSchema,
  type AiAdapter,
  type AiAuthMode,
  type AiChatImplementation,
  type AiUpstreamFormat,
} from '@thesis-ledger/schemas';
import {
  AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1,
  runtimeAdapterForSelection,
  selectionFromLegacyAdapter,
  type AiCompatibilityExtensionProfile,
} from './ai-provider-upstream.js';

type CompletionInput = {
  model: string;
  messages: unknown[];
  tools: string[];
  maxOutputTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
};

const providerConfigSchema = z
  .array(
    z
      .object({
        id: z.string().trim().min(1).max(120),
        baseUrl: z.url(),
        authMode: sharedAiAuthModeSchema.default('api_key'),
        apiKey: z.string().trim().min(1).optional(),
        models: z.array(z.string().trim().min(1).max(200)).min(1),
        upstreamFormat: aiUpstreamFormatSchema.optional(),
        chatImplementation: aiChatImplementationSchema.optional(),
        adapter: aiLegacyAdapterSchema.optional(),
        executionRoutes: z.array(aiProviderExecutionRouteInputSchema).max(96).optional(),
        timeoutMs: z.number().int().positive().optional(),
        firstOutputTimeoutMs: z.number().int().positive().max(120_000).optional(),
        outputIdleTimeoutMs: z.number().int().positive().max(120_000).optional(),
        costPer1kInput: z.number().nonnegative().optional(),
        costPer1kOutput: z.number().nonnegative().optional(),
        costCurrency: z.string().trim().min(1).max(16).optional(),
        pricingVersion: z.string().trim().min(1).max(120).optional(),
        modelPricing: z
          .record(z.string().trim().min(1).max(200), aiProviderModelPricingViewSchema)
          .optional(),
        modelReasoning: z
          .record(z.string().trim().min(1).max(200), aiProviderModelReasoningSchema)
          .optional(),
      })
      .strict(),
  )
  .max(12)
  .superRefine((providers, context) => {
    const ids = providers.map((provider) => provider.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'AI Provider id 必须唯一' });
    providers.forEach((provider, index) => {
      const selection = aiUpstreamSelectionSchema.safeParse({
        upstreamFormat: provider.upstreamFormat ?? 'chat-completions',
        ...(provider.chatImplementation === undefined
          ? {}
          : { chatImplementation: provider.chatImplementation }),
      });
      if (!selection.success)
        context.addIssue({
          code: 'custom',
          path: [index, 'chatImplementation'],
          message: '只有 Chat Completions 可以选择 Chat 实现',
        });
      if (new Set(provider.models).size !== provider.models.length)
        context.addIssue({
          code: 'custom',
          path: [index, 'models'],
          message: '同一 Provider 的模型不得重复',
        });
      const selectedModels = new Set(provider.models);
      if (provider.executionRoutes?.some((route) => !selectedModels.has(route.model)))
        context.addIssue({
          code: 'custom',
          path: [index, 'executionRoutes'],
          message: '执行路由只能配置同一 Provider 已选择的模型',
        });
      if (provider.authMode === 'api_key' && !provider.apiKey)
        context.addIssue({
          code: 'custom',
          path: [index, 'apiKey'],
          message: 'API Key 模式必须配置 API Key',
        });
      if (provider.authMode === 'none' && provider.apiKey)
        context.addIssue({
          code: 'custom',
          path: [index, 'authMode'],
          message: '无需认证模式不能配置 API Key',
        });
    });
  });

export type ConfiguredAiProviderInput = z.infer<typeof providerConfigSchema>[number];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export class OpenAiCompatibleProvider implements AiProvider {
  readonly metadata;

  constructor(
    readonly id: string,
    readonly models: readonly string[],
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = DEFAULT_AI_TIMEOUT_MS,
    pricing?: {
      costPer1kInput?: number;
      costPer1kOutput?: number;
      costCurrency?: string;
      pricingVersion?: string;
    },
    options?: {
      priority?: number;
      capabilities?: readonly string[];
      health?: AiProviderHealth;
      source?: 'database' | 'environment';
      modelReasoning?: Readonly<Record<string, AiProviderModelReasoningMetadata>>;
      upstreamFormat?: AiUpstreamFormat;
      chatImplementation?: AiChatImplementation;
      compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
      adapter?: AiAdapter;
      authMode?: AiAuthMode;
      executionRoutes?: readonly AiProviderExecutionRouteInput[];
      firstOutputTimeoutMs?: number;
      outputIdleTimeoutMs?: number;
      modelPricing?: Readonly<Record<string, AiProviderModelPricingView>>;
      credentialFingerprint?: string;
    },
  ) {
    this.metadata = {
      baseURL: baseUrl,
      timeoutMs: this.timeoutMs,
      health: options?.health ?? ('unknown' as const),
      priority: options?.priority ?? 100,
      ...(options?.capabilities ? { capabilities: [...options.capabilities] } : {}),
      ...(options?.source ? { source: options.source } : {}),
      ...(options?.modelReasoning ? { modelReasoning: options.modelReasoning } : {}),
      ...(options?.upstreamFormat ? { upstreamFormat: options.upstreamFormat } : {}),
      ...(options?.chatImplementation ? { chatImplementation: options.chatImplementation } : {}),
      ...(options?.compatibilityExtensionProfile
        ? { compatibilityExtensionProfile: options.compatibilityExtensionProfile }
        : {}),
      ...(options?.adapter ? { adapter: options.adapter } : {}),
      authMode: options?.authMode ?? 'api_key',
      ...(options?.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: options.firstOutputTimeoutMs }),
      ...(options?.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: options.outputIdleTimeoutMs }),
      ...(options?.executionRoutes ? { executionRoutes: options.executionRoutes } : {}),
      ...(options?.modelPricing ? { modelPricing: options.modelPricing } : {}),
      ...(options?.credentialFingerprint
        ? { credentialFingerprint: options.credentialFingerprint }
        : {}),
      ...(pricing?.costPer1kInput === undefined ? {} : { costPer1kInput: pricing.costPer1kInput }),
      ...(pricing?.costPer1kOutput === undefined
        ? {}
        : { costPer1kOutput: pricing.costPer1kOutput }),
      ...(pricing?.costCurrency ? { costCurrency: pricing.costCurrency } : {}),
      ...(pricing?.pricingVersion ? { pricingVersion: pricing.pricingVersion } : {}),
    };
  }

  sdkRuntime() {
    return {
      baseURL: this.baseUrl,
      apiKey: this.apiKey,
      authMode: this.metadata.authMode,
      timeoutMs: this.timeoutMs,
      ...(this.metadata.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: this.metadata.firstOutputTimeoutMs }),
      ...(this.metadata.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: this.metadata.outputIdleTimeoutMs }),
    };
  }
}

const parseMarker = (messages: unknown[], marker: string) => {
  const user = messages.find((message) => {
    const record = asRecord(message);
    return (
      record?.role === 'user' &&
      typeof record.content === 'string' &&
      record.content.includes(marker)
    );
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

const parseResearchMarker = (messages: unknown[]) =>
  parseMarker(messages, 'RESEARCH_REQUEST_JSON:');
const parseOptimizationMarker = (messages: unknown[]) =>
  parseMarker(messages, 'OPTIMIZATION_REQUEST_JSON:');
const parseDiscoveryMarker = (messages: unknown[]) =>
  parseMarker(messages, 'DISCOVERY_REQUEST_JSON:');

const fixtureOptimizationProposal = (marker: Record<string, unknown>) => {
  const authorized = Array.isArray(marker.authorizedParameters) ? marker.authorizedParameters : [];
  const first = authorized
    .map(asRecord)
    .find((item): item is Record<string, unknown> => item !== null);
  if (!first || typeof first.parameterId !== 'string')
    throw new Error('Fixture 优化请求缺少授权参数');
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

const fixtureDiscoveryProposal = (marker: Record<string, unknown>) => {
  const seed = asRecord(marker.seedStrategy);
  if (!seed || typeof seed.schemaVersion !== 'string')
    throw new Error('Fixture 探索请求缺少有效 seedStrategy');
  return {
    strategy: {
      ...seed,
      name: 'Fixture 探索策略',
      description: 'Fixture Provider 在固定 strategy-space-v1 内生成的确定性候选。',
    },
    reason: 'Fixture Provider 复用请求中的合法 v0 seed，验证完整策略候选编排闭环。',
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
    const discovery = parseDiscoveryMarker(input.messages);
    if (discovery) {
      return Promise.resolve({
        content: fixtureDiscoveryProposal(discovery),
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        costKnown: true,
        costCurrency: 'FIXTURE',
        pricingVersion: 'fixture-v1',
        actualModel: input.model,
      });
    }
    const optimization = parseOptimizationMarker(input.messages);
    if (optimization) {
      return Promise.resolve({
        content: fixtureOptimizationProposal(optimization),
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        costKnown: true,
        costCurrency: 'FIXTURE',
        pricingVersion: 'fixture-v1',
        actualModel: input.model,
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
    return Promise.resolve({
      content: result,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      costKnown: true,
      costCurrency: 'FIXTURE',
      pricingVersion: 'fixture-v1',
      actualModel: input.model,
    });
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

const providerFromInput = (input: ConfiguredAiProviderInput, defaultTimeoutMs: number) => {
  const selection =
    input.adapter && input.upstreamFormat === undefined && input.chatImplementation === undefined
      ? selectionFromLegacyAdapter(input.adapter)
      : aiUpstreamSelectionSchema.parse({
          upstreamFormat: input.upstreamFormat ?? 'chat-completions',
          ...(input.chatImplementation === undefined
            ? {}
            : { chatImplementation: input.chatImplementation }),
        });
  const compatibilityExtensionProfile =
    input.adapter === 'openrouter' && Boolean(input.executionRoutes?.length)
      ? AI_COMPATIBILITY_EXTENSION_PROFILE_OPENROUTER_V1
      : undefined;
  const adapter = runtimeAdapterForSelection(selection, compatibilityExtensionProfile);
  return new OpenAiCompatibleProvider(
    input.id,
    input.models,
    input.baseUrl,
    input.authMode === 'none' ? '' : (input.apiKey ?? ''),
    input.timeoutMs ?? defaultTimeoutMs,
    {
      ...(input.costPer1kInput === undefined ? {} : { costPer1kInput: input.costPer1kInput }),
      ...(input.costPer1kOutput === undefined ? {} : { costPer1kOutput: input.costPer1kOutput }),
      ...(input.costCurrency ? { costCurrency: input.costCurrency } : {}),
      ...(input.pricingVersion ? { pricingVersion: input.pricingVersion } : {}),
    },
    {
      authMode: input.authMode,
      ...(input.modelReasoning ? { modelReasoning: input.modelReasoning } : {}),
      upstreamFormat: selection.upstreamFormat,
      ...(selection.upstreamFormat === 'chat-completions'
        ? { chatImplementation: selection.chatImplementation }
        : {}),
      ...(compatibilityExtensionProfile ? { compatibilityExtensionProfile } : {}),
      ...(adapter ? { adapter } : {}),
      ...(input.executionRoutes ? { executionRoutes: input.executionRoutes } : {}),
      ...(input.firstOutputTimeoutMs === undefined
        ? {}
        : { firstOutputTimeoutMs: input.firstOutputTimeoutMs }),
      ...(input.outputIdleTimeoutMs === undefined
        ? {}
        : { outputIdleTimeoutMs: input.outputIdleTimeoutMs }),
      ...(input.modelPricing ? { modelPricing: input.modelPricing } : {}),
      ...(input.apiKey
        ? { credentialFingerprint: createHash('sha256').update(input.apiKey, 'utf8').digest('hex') }
        : {}),
    },
  );
};

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
          undefined,
          {
            upstreamFormat: 'chat-completions',
            chatImplementation: 'compatible',
            adapter: 'openai-compatible-chat',
            authMode: 'api_key',
          },
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
