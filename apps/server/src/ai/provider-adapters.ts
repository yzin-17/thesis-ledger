import { DEFAULT_AI_TIMEOUT_MS } from '../platform/config.js';
import type {
  AiProvider,
  AiProviderHealth,
  AiProviderModelReasoningMetadata,
} from './contracts.js';
import type {
  AiProviderExecutionRouteInput,
  AiProviderModelPricingView,
  AiProviderModelDefaultConfig,
} from './ai-provider.contracts.js';
import type {
  AiAdapter,
  AiAuthMode,
  AiChatImplementation,
  AiUpstreamFormat,
} from '@thesis-ledger/schemas';
import type { AiCompatibilityExtensionProfile } from './ai-provider-upstream.js';

type CompletionInput = {
  model: string;
  messages: unknown[];
  tools: string[];
  maxOutputTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
};

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
      source?: 'database';
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
      modelDefaults?: Readonly<Record<string, AiProviderModelDefaultConfig>>;
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
      ...(options?.modelDefaults ? { modelDefaults: options.modelDefaults } : {}),
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
