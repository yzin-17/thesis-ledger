import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  aiInvocationFactSchema,
  aiCostFactsSchema,
  type AiInvocationFact,
  type AiCostFacts,
  type AiUsageFacts,
} from '@thesis-ledger/schemas';
import type { AiSdkGenerationResult } from './ai-sdk-generation.adapter.js';
import { researchRouteCost } from './ai-research-sdk-reservation.js';
import type {
  ResearchExperimentProtocol,
  ResearchExperimentStage,
} from './research-experiment-protocol.js';

export const experimentUnknownCost = (): AiCostFacts => ({
  status: 'unknown',
  amount: null,
  currency: null,
  source: null,
  pricingVersion: null,
});
export interface ExperimentRequestAudit {
  requestId: string;
  stage: ResearchExperimentStage;
  inputFingerprint: string;
  preparedAt: string;
  completedAt: string | null;
  reservation: { inputTokens: number; outputTokens: number; cost: AiCostFacts };
  facts: AiInvocationFact[];
}
export function experimentResultCost(
  protocol: ResearchExperimentProtocol,
  value: Pick<AiSdkGenerationResult<unknown>, 'usage' | 'providerCost' | 'providerCostCurrency'>,
): AiCostFacts {
  if (value.providerCost !== null && value.providerCostCurrency !== null) {
    const parsed = aiCostFactsSchema.safeParse({
      status: 'known',
      amount: value.providerCost,
      currency: value.providerCostCurrency,
      source: 'provider_usage',
      pricingVersion: null,
    });
    return parsed.success ? parsed.data : experimentUnknownCost();
  }
  if (value.usage.inputTokens === null || value.usage.outputTokens === null)
    return experimentUnknownCost();
  return (
    researchRouteCost(
      { costCurrency: protocol.budget.currency },
      protocol.pricing,
      value.usage.inputTokens,
      value.usage.outputTokens,
    ) ?? experimentUnknownCost()
  );
}
export function experimentFact(
  kind: AiInvocationFact['kind'],
  input: {
    usage?: AiUsageFacts | null;
    cost?: AiCostFacts;
    actualModel?: string | null;
    errorCode?: string | null;
    outputFingerprint?: string | null;
  } = {},
) {
  return aiInvocationFactSchema.parse({
    eventKey: randomUUID(),
    kind,
    usage: input.usage ?? null,
    cost: input.cost ?? experimentUnknownCost(),
    actualModel: input.actualModel ?? null,
    errorCode: input.errorCode ?? null,
    outputFingerprint: input.outputFingerprint ?? null,
  });
}
/** 派发事实不重复计费；只汇总每个请求最后一份计量事实，未知项单列。 */
export function experimentAuditTotals(requests: readonly ExperimentRequestAudit[]) {
  let knownInput = 0,
    knownOutput = 0,
    unknownInput = 0,
    unknownOutput = 0,
    unknownCost = 0,
    estimatedCostRequests = 0,
    knownCostRequests = 0;
  const costs = new Map<string, { known: Prisma.Decimal; estimated: Prisma.Decimal }>();
  for (const request of requests) {
    const fact = request.facts.at(-1)!;
    if (fact.usage?.inputTokens == null) unknownInput++;
    else knownInput += fact.usage.inputTokens;
    if (fact.usage?.outputTokens == null) unknownOutput++;
    else knownOutput += fact.usage.outputTokens;
    if (
      fact.cost.status === 'unknown' ||
      fact.cost.amount === null ||
      fact.cost.currency === null
    ) {
      unknownCost++;
      continue;
    }
    if (fact.cost.status === 'estimated') estimatedCostRequests++;
    else knownCostRequests++;
    const bucket = costs.get(fact.cost.currency) ?? {
      known: new Prisma.Decimal(0),
      estimated: new Prisma.Decimal(0),
    };
    bucket[fact.cost.status] = bucket[fact.cost.status].plus(fact.cost.amount);
    costs.set(fact.cost.currency, bucket);
  }
  const actualCostComplete = unknownCost === 0 && estimatedCostRequests === 0;
  return {
    requests: requests.length,
    knownInput,
    knownOutput,
    unknownInput,
    unknownOutput,
    unknownCost,
    estimatedCostRequests,
    knownCostRequests,
    actualCostComplete,
    actualTotals: actualCostComplete
      ? [...costs].map(([currency, value]) => ({ currency, amount: value.known.toFixed() }))
      : null,
    costs: [...costs].map(([currency, value]) => ({
      currency,
      known: value.known.toFixed(),
      estimated: value.estimated.toFixed(),
    })),
  };
}
