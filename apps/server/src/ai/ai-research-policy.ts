import {
  aiGenerationContracts,
  aiResearchPolicyV1Schema,
  DEFAULT_AI_RESEARCH_POLICY_V1,
  type AiResearchPolicyV1,
  type AiGenerationContractRef,
} from '@thesis-ledger/schemas';
import type { AiProviderRegistry } from './provider-registry.js';
import { aiProviderPricingForModel } from './ai-provider-pricing.js';
import { researchReasoningFields } from './ai-research-reasoning-options.js';

export const parseAiResearchPolicy = (value: string | undefined): AiResearchPolicyV1 => {
  if (!value) return DEFAULT_AI_RESEARCH_POLICY_V1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('AI_RESEARCH_POLICY_JSON 必须是合法 JSON');
  }
  return aiResearchPolicyV1Schema.parse(parsed);
};

export const loadAiResearchPolicy = () =>
  parseAiResearchPolicy(process.env.AI_RESEARCH_POLICY_JSON);

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
