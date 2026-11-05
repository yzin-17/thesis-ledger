import type {
  AiCostFacts,
  AiExecutionSummary,
  AiResearchPolicyV1,
  AiUsageFacts,
} from '@thesis-ledger/schemas';
import type { AiProviderPricing } from './ai-provider-pricing.js';
import type { AiSdkGenerationResult } from './ai-sdk-generation.adapter.js';
import { researchRequestTotals, researchRouteCost } from './ai-research-sdk-reservation.js';

const unknownCost = (): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source: 'provider_cost_unavailable',
  pricingVersion: null,
});

export function completedResearchCost(
  policy: AiResearchPolicyV1,
  pricing: AiProviderPricing,
  result: Pick<AiSdkGenerationResult<unknown>, 'providerCost' | 'providerCostCurrency' | 'usage'>,
): AiCostFacts {
  if (
    result.providerCost !== null &&
    result.providerCostCurrency !== null &&
    (policy.costCurrency === null || result.providerCostCurrency === policy.costCurrency)
  )
    return {
      status: 'known',
      amount: result.providerCost,
      currency: result.providerCostCurrency,
      source: 'provider_reported',
      pricingVersion: pricing.pricingVersion ?? null,
    };
  if (result.usage.inputTokens !== null && result.usage.outputTokens !== null) {
    const estimate = researchRouteCost(
      policy,
      pricing,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );
    if (estimate) return estimate;
  }
  return unknownCost();
}

export const researchUsageRevision = (
  usage: AiUsageFacts,
  cost: AiCostFacts,
  now = new Date(),
) => ({ revision: 1, usage, cost, recordedAt: now.toISOString() });

export function researchBlockAfter(
  execution: AiExecutionSummary,
  policy: AiResearchPolicyV1,
  usage: AiUsageFacts,
  cost: AiCostFacts,
  reservation: { inputTokens: number; outputTokens: number; cost: AiCostFacts },
  requestId: string,
): AiExecutionSummary['continuationBlockedReason'] {
  const totals = researchRequestTotals({
    ...execution,
    requests: execution.requests.filter((request) => request.requestId !== requestId),
  });
  if (
    totals.input + (usage.inputTokens ?? reservation.inputTokens) > policy.maxInputTokens ||
    totals.output + (usage.outputTokens ?? reservation.outputTokens) > policy.maxOutputTokens ||
    totals.cost + Number(cost.amount ?? reservation.cost.amount ?? 0) > Number(policy.maxCost)
  )
    return 'budget_exceeded';
  if (cost.status === 'unknown') return 'cost_unknown';
  return execution.continuationBlockedReason;
}
