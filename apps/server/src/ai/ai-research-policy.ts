import {
  aiGenerationContracts,
  aiResearchPolicyV1Schema,
  DEFAULT_AI_RESEARCH_POLICY_V1,
  type AiResearchPolicyV1,
} from '@thesis-ledger/schemas';
import type { AiProviderRegistry } from './provider-registry.js';

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

export const loadAiResearchPolicy = () => parseAiResearchPolicy(process.env.AI_RESEARCH_POLICY_JSON);

export const researchRoutePaidAuthorized = (
  policy: AiResearchPolicyV1,
  provider: string,
  model: string,
) =>
  Number(policy.maxCost) > 0 &&
  policy.paidRoutes.some(
    (route) => route.provider === provider && route.models.includes(model),
  );

export const freezeAiResearchRoutes = (
  registry: AiProviderRegistry | undefined,
  policy: AiResearchPolicyV1,
) => {
  const model = registry?.defaultModel();
  const candidates = model
    ? (registry?.readyContractCandidates({
        model,
        contract: aiGenerationContracts.research.ref,
        budgetAuthorized: (providerId, candidateModel) =>
          researchRoutePaidAuthorized(policy, providerId, candidateModel),
      }) ?? []).slice(0, policy.maxAiCalls)
    : [];
  return {
    provider: candidates[0]?.provider.id ?? 'pending',
    model: model ?? 'pending',
    routes: candidates.map((candidate) => ({
      provider: candidate.provider.id,
      model,
      adapter: candidate.execution.adapter,
      mode: candidate.execution.mode,
      configurationFingerprint: candidate.execution.readiness.configurationFingerprint,
    })),
  };
};
