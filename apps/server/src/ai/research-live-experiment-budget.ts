import { Prisma } from '@prisma/client';
import type { AiUsageFacts } from '@thesis-ledger/schemas';
import type { AiSdkGenerationResult } from './ai-sdk-generation.adapter.js';
import { researchInputTokenEstimate, researchRouteCost } from './ai-research-sdk-reservation.js';
import { experimentFact, experimentUnknownCost } from './research-experiment-audit.js';
import {
  matchesLiveExperimentModel,
  type LiveExperimentProtocol,
} from './research-live-experiment-protocol.js';

export function createLiveExperimentBudget(
  protocol: LiveExperimentProtocol,
  initial = { amount: '0', reservedUnknown: '0', requests: 0 },
) {
  let spent = new Prisma.Decimal(initial.amount);
  let reservedUnknown = new Prisma.Decimal(initial.reservedUnknown);
  let stopped: string | null = null;
  const iterative =
    protocol.version === 'research-live-experiment-v5' ||
    protocol.version === 'research-live-experiment-v6';
  const reservationInput = iterative
    ? protocol.budget.modelContextTokens
    : protocol.budget.maxInputTokensPerArm;
  const reservationOutput = iterative
    ? protocol.budget.modelContextTokens
    : protocol.budget.maxOutputTokensPerArm;
  const unknownReservation = new Prisma.Decimal(reservationInput)
    .mul(protocol.pricing.costPer1kInput)
    .plus(new Prisma.Decimal(reservationOutput).mul(protocol.pricing.costPer1kOutput))
    .div(1000);
  const reserveUnknown = () => {
    if (protocol.version !== 'research-live-experiment-v4' && !iterative) return;
    reservedUnknown = reservedUnknown.plus(unknownReservation);
    spent = spent.plus(unknownReservation);
    if (spent.gt(protocol.budget.maxCost)) stopped = 'cost_budget_exceeded';
  };
  if (
    !spent.isFinite() ||
    spent.lt(0) ||
    spent.gt(protocol.budget.maxCost) ||
    !reservedUnknown.isFinite() ||
    reservedUnknown.lt(0) ||
    reservedUnknown.gt(spent) ||
    !Number.isInteger(initial.requests) ||
    initial.requests < 0
  )
    throw new Error('接续预算无效');
  let requests = initial.requests;
  return {
    snapshot: () => ({
      spent: spent.minus(reservedUnknown).toFixed(),
      committed: spent.toFixed(),
      reservedUnknown: reservedUnknown.toFixed(),
      stopped,
      requests,
    }),
    stop: (reason: string) => {
      stopped = reason;
    },
    reserve: (
      messages: unknown[],
      usedInput: number,
      usedOutput: number,
      remainingStages: number,
    ) => {
      if (stopped) return null;
      if (protocol.budget.authorizedCalls !== null && requests >= protocol.budget.authorizedCalls) {
        stopped = 'request_budget_exhausted';
        return null;
      }
      const inputTokens = researchInputTokenEstimate(messages);
      const outputTokens = iterative
        ? protocol.budget.modelContextTokens - inputTokens
        : Math.floor((protocol.budget.maxOutputTokensPerArm - usedOutput) / remainingStages);
      if (usedInput + inputTokens > protocol.budget.maxInputTokensPerArm || outputTokens <= 0)
        return null;
      const cost = researchRouteCost(
        { costCurrency: 'USD' },
        protocol.pricing,
        inputTokens,
        outputTokens,
      );
      if (!cost?.amount) return null;
      const required =
        protocol.version === 'research-live-experiment-v4' || iterative
          ? Prisma.Decimal.max(cost.amount, unknownReservation)
          : new Prisma.Decimal(cost.amount);
      if (spent.plus(required).gt(protocol.budget.maxCost)) {
        if (iterative) stopped = 'cost_budget_exhausted';
        return null;
      }
      requests++;
      return { inputTokens, outputTokens, cost };
    },
    settle: (
      value: Pick<
        AiSdkGenerationResult<unknown>,
        'usage' | 'providerCost' | 'providerCostCurrency'
      >,
      actualModel: string | null,
    ) => {
      if (!matchesLiveExperimentModel(protocol, actualModel)) stopped = 'model_unqualified';
      const usage = value.usage;
      let incomplete: string | null = null;
      if (usage.inputTokens === null || usage.outputTokens === null) {
        incomplete = 'usage_unknown';
        if (!iterative) stopped = incomplete;
      }
      const estimate =
        usage.inputTokens === null || usage.outputTokens === null
          ? null
          : researchRouteCost(
              { costCurrency: 'USD' },
              protocol.pricing,
              usage.inputTokens,
              usage.outputTokens,
            );
      const parsedCost = parseReportedLiveCost(value);
      const reported = parsedCost.reported;
      if (parsedCost.invalid) stopped = 'cost_currency_or_value_invalid';
      const amount = reported ?? (estimate?.amount ? new Prisma.Decimal(estimate.amount) : null);
      if (amount === null) {
        incomplete = 'cost_unknown';
        if (!iterative) stopped = incomplete;
        reserveUnknown();
      } else spent = spent.plus(amount);
      if (spent.gt(protocol.budget.maxCost)) stopped = 'cost_budget_exceeded';
      const cost =
        reported !== null
          ? {
              status: 'known' as const,
              amount: reported.toFixed(),
              currency: 'USD',
              source: 'provider_usage' as const,
              pricingVersion: null,
            }
          : (estimate ?? experimentUnknownCost());
      return {
        usage,
        cost,
        actualCost: reported?.toNumber() ?? null,
        estimatedCost: estimate?.amount ? Number(estimate.amount) : 0,
        stopped,
        incomplete,
      };
    },
    unknownFailure: (usage: AiUsageFacts | null, errorCode: string) => {
      if (usage?.inputTokens === null || usage?.outputTokens === null || usage === null) {
        if (!iterative) stopped = 'unknown_outcome';
        reserveUnknown();
        return experimentFact('unknown', { usage, errorCode });
      }
      const cost = researchRouteCost(
        { costCurrency: 'USD' },
        protocol.pricing,
        usage.inputTokens,
        usage.outputTokens,
      );
      if (!cost?.amount) stopped = 'cost_unknown';
      else spent = spent.plus(cost.amount);
      if (spent.gt(protocol.budget.maxCost)) stopped = 'cost_budget_exceeded';
      return experimentFact('received', {
        usage,
        cost: cost ?? experimentUnknownCost(),
        errorCode,
      });
    },
  };
}

function parseReportedLiveCost(
  value: Pick<AiSdkGenerationResult<unknown>, 'providerCost' | 'providerCostCurrency'>,
) {
  let invalid = false;
  let reported: Prisma.Decimal | null = null;
  if (value.providerCost !== null) {
    try {
      const parsed = new Prisma.Decimal(value.providerCost);
      if (value.providerCostCurrency === 'USD' && parsed.isFinite() && parsed.gte(0))
        reported = parsed;
      else invalid = true;
    } catch {
      invalid = true;
    }
  }
  return { reported, invalid };
}
