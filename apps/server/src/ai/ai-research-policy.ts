import { aiRequestOptionsFields, readFrozenRequestOptions } from './ai-model-request-options.js';
import {
  aiGenerationContracts,
  aiResearchPolicyV1Schema,
  DEFAULT_AI_RESEARCH_POLICY_V1,
  AI_TIMEOUT_BASELINES,
  type AiTimeoutProfile,
  type AiResearchPolicyV1,
  type AiGenerationContractRef,
  type AiModelRequestOptions,
} from '@thesis-ledger/schemas';
import type { AiProviderRegistry } from './provider-registry.js';
import { aiProviderPricingForModel, type AiProviderPricing } from './ai-provider-pricing.js';
import {
  readFrozenResearchReasoning,
  researchReasoningFields,
} from './ai-research-reasoning-options.js';

export const parseAiResearchPolicy = (
  value: string | undefined,
  profile: AiTimeoutProfile = 'research',
): AiResearchPolicyV1 => {
  const maxDurationSeconds = AI_TIMEOUT_BASELINES[profile].taskBudgetMs / 1_000;
  if (!value) return { ...DEFAULT_AI_RESEARCH_POLICY_V1, maxDurationSeconds };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('AI_RESEARCH_POLICY_JSON 必须是合法 JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return aiResearchPolicyV1Schema.parse(parsed);
  return aiResearchPolicyV1Schema.parse({ maxDurationSeconds, ...parsed });
};

export const loadAiResearchPolicy = (profile?: AiTimeoutProfile) =>
  parseAiResearchPolicy(process.env.AI_RESEARCH_POLICY_JSON, profile);

export const researchRoutePaidAuthorized = (
  policy: AiResearchPolicyV1,
  provider: string,
  model: string,
) =>
  Number(policy.maxCost) > 0 &&
  policy.paidRoutes.some((route) => route.provider === provider && route.models.includes(model));

type ResearchContract = Extract<AiGenerationContractRef, { id: 'research' }>;
function researchCandidates(
  registry: AiProviderRegistry | undefined,
  model: string | undefined,
  policy: AiResearchPolicyV1,
  researchDefault: { providerId: string; model: string } | null | undefined,
  contract: ResearchContract,
) {
  if (!registry || !model) return [];
  if (!researchDefault)
    return registry
      .readyContractCandidates({
        model,
        contract,
        budgetAuthorized: (providerId, candidateModel) =>
          researchRoutePaidAuthorized(policy, providerId, candidateModel),
      })
      .slice(0, policy.maxAiCalls);
  try {
    return [
      registry.strictReadyContract({
        providerId: researchDefault.providerId,
        model,
        contract,
        budgetAuthorized: researchRoutePaidAuthorized(policy, researchDefault.providerId, model),
      }),
    ];
  } catch {
    return [];
  }
}

export const freezeAiResearchRoutes = (
  registry: AiProviderRegistry | undefined,
  policy: AiResearchPolicyV1,
  researchDefault?: { providerId: string; model: string } | null,
  contract: ResearchContract = aiGenerationContracts.research.ref,
) => {
  const model = researchDefault?.model ?? registry?.defaultModel();
  const candidates = researchCandidates(registry, model, policy, researchDefault, contract);
  return {
    provider: candidates[0]?.provider.id ?? 'pending',
    model: model ?? 'pending',
    routes: candidates.map((candidate) => {
      const pricing = aiProviderPricingForModel(candidate.provider, model!);
      return {
        provider: candidate.provider.id,
        model,
        adapter: candidate.execution.adapter,
        mode: candidate.execution.mode,
        configurationFingerprint: candidate.execution.readiness.configurationFingerprint,
        ...researchReasoningFields(candidate.execution),
        ...aiRequestOptionsFields(candidate.execution),
        pricing: {
          ...(pricing.costPer1kInput === undefined
            ? {}
            : { costPer1kInput: pricing.costPer1kInput }),
          ...(pricing.costPer1kOutput === undefined
            ? {}
            : { costPer1kOutput: pricing.costPer1kOutput }),
          ...(pricing.costCurrency === undefined ? {} : { costCurrency: pricing.costCurrency }),
          ...(pricing.pricingVersion === undefined
            ? {}
            : { pricingVersion: pricing.pricingVersion }),
        },
      };
    }),
  };
};

export type FrozenAiResearchRoute = {
  provider: string;
  model: string;
  configurationFingerprint: string;
  adapter?: string;
  mode?: string;
  pricing?: AiProviderPricing;
  reasoningEnabled?: boolean;
  requestOptions?: AiModelRequestOptions;
};

const frozenRouteRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const pricingSnapshot = (value: unknown): AiProviderPricing | undefined => {
  const pricing = frozenRouteRecord(value);
  if (!pricing) return undefined;
  return {
    ...(typeof pricing.costPer1kInput === 'number'
      ? { costPer1kInput: pricing.costPer1kInput }
      : {}),
    ...(typeof pricing.costPer1kOutput === 'number'
      ? { costPer1kOutput: pricing.costPer1kOutput }
      : {}),
    ...(typeof pricing.costCurrency === 'string' ? { costCurrency: pricing.costCurrency } : {}),
    ...(typeof pricing.pricingVersion === 'string'
      ? { pricingVersion: pricing.pricingVersion }
      : {}),
  };
};

export const readFrozenAiResearchRoutes = (metadata: unknown): FrozenAiResearchRoute[] => {
  const value = frozenRouteRecord(metadata)?.researchRoutes;
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const route = frozenRouteRecord(candidate);
    const pricing = pricingSnapshot(route?.pricing);
    return typeof route?.provider === 'string' &&
      typeof route.model === 'string' &&
      typeof route.configurationFingerprint === 'string'
      ? [
          {
            provider: route.provider,
            model: route.model,
            configurationFingerprint: route.configurationFingerprint,
            ...readFrozenResearchReasoning(route),
            ...readFrozenRequestOptions(route),
            ...(typeof route.adapter === 'string' ? { adapter: route.adapter } : {}),
            ...(typeof route.mode === 'string' ? { mode: route.mode } : {}),
            ...(pricing === undefined ? {} : { pricing }),
          },
        ]
      : [];
  });
};
