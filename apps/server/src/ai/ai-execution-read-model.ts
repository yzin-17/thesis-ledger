import { Prisma } from '@prisma/client';
import {
  aiExecutionReadModelSchema,
  aiExecutionSummarySchema,
  aiUsageSummaryReadModelSchema,
  type AiExecutionReadModel,
  type AiExecutionSummary,
  type AiUsageSummaryReadModel,
} from '@thesis-ledger/schemas';

type UsageRow = {
  inputTokens: number;
  outputTokens: number;
  cost: unknown;
  modelMetadata: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const safeDiagnosticSummary = (value: unknown) => {
  if (typeof value !== 'string') return null;
  return value
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .replace(/(authorization|cookie)\s*[:=]\s*\S+/giu, '$1=[REDACTED]')
    .slice(0, 500);
};

export const safeFallbackSummary = (metadata: unknown) => {
  const errors = asRecord(metadata).fallbackErrors;
  if (!Array.isArray(errors)) return null;
  const safeErrors = errors
    .filter((error): error is string => typeof error === 'string')
    .slice(0, 3)
    .map((error) => safeDiagnosticSummary(error)?.slice(0, 160) ?? '')
    .filter(Boolean);
  return safeErrors.length > 0 ? safeErrors.join('；') : null;
};

export const aiRunReadProjection = <
  T extends { modelMetadata: unknown; errorSummary?: string | null },
>(
  row: T,
) => {
  const { modelMetadata, errorSummary, ...run } = row;
  const execution = aiExecutionReadModel(modelMetadata);
  return {
    ...run,
    execution,
    usageCompleteness: execution?.usageCompleteness ?? ('legacy_unknown' as const),
    errorSummary: safeDiagnosticSummary(errorSummary),
  };
};

const executionFrom = (metadata: unknown): AiExecutionSummary | null => {
  const parsed = aiExecutionSummarySchema.safeParse(asRecord(metadata).sdkExecution);
  return parsed.success ? parsed.data : null;
};

export const aiExecutionReadModel = (metadata: unknown): AiExecutionReadModel | null => {
  const execution = executionFrom(metadata);
  if (!execution) return null;
  return aiExecutionReadModelSchema.parse({
    version: execution.version,
    contract: execution.contract,
    frozenPolicy: execution.frozenPolicy,
    deadlineAt: execution.deadlineAt,
    generationStatus: execution.generationStatus,
    usageCompleteness: execution.usageCompleteness,
    requests: execution.requests.map((request) => {
      const latest = request.usageRevisions.at(-1);
      return {
        requestId: request.requestId,
        sequence: request.sequence,
        state: request.state,
        reservation: {
          aiCalls: request.reservation.aiCalls,
          inputTokens: request.reservation.inputTokens,
          outputTokens: request.reservation.outputTokens,
          cost: request.reservation.cost,
          ...(request.reservation.provider === undefined
            ? {}
            : { provider: request.reservation.provider }),
          ...(request.reservation.model === undefined ? {} : { model: request.reservation.model }),
        },
        preparedAt: request.preparedAt,
        dispatchingAt: request.dispatchingAt,
        completedAt: request.completedAt,
        outcome: request.outcome,
        error: request.error
          ? {
              code: request.error.code,
              phase: request.error.phase,
              externalResult: request.error.externalResult,
              requestId: request.error.requestId,
              ...(request.error.retryAfterMs === undefined
                ? {}
                : { retryAfterMs: request.error.retryAfterMs }),
            }
          : null,
        usage: latest?.usage ?? null,
        cost: latest?.cost ?? null,
      };
    }),
    continuationBlockedReason: execution.continuationBlockedReason,
  });
};

type CostBucket = {
  known: Prisma.Decimal;
  estimated: Prisma.Decimal;
  reserved: Prisma.Decimal;
};

const addCost = (
  buckets: Map<string, CostBucket>,
  currency: string | null,
  amount: string | null,
  kind: keyof CostBucket,
) => {
  if (!currency || !amount) return;
  const bucket = buckets.get(currency) ?? {
    known: new Prisma.Decimal(0),
    estimated: new Prisma.Decimal(0),
    reserved: new Prisma.Decimal(0),
  };
  bucket[kind] = bucket[kind].plus(amount);
  buckets.set(currency, bucket);
};

const decimalText = (value: Prisma.Decimal) => value.toFixed();

export const aiUsageSummaryReadModel = (rows: readonly UsageRow[]): AiUsageSummaryReadModel => {
  const costs = new Map<string, CostBucket>();
  let reportedInputTokens = 0;
  let reportedOutputTokens = 0;
  let partialRuns = 0;
  let unknownRuns = 0;
  let legacyUnknownRuns = 0;
  let unknownCostRuns = 0;
  let unconfirmedInputTokenReservation = 0;
  let unconfirmedOutputTokenReservation = 0;

  for (const row of rows) {
    const execution = executionFrom(row.modelMetadata);
    if (!execution) {
      legacyUnknownRuns += 1;
      continue;
    }
    if (execution.usageCompleteness === 'partial') partialRuns += 1;
    else if (execution.usageCompleteness === 'unknown') unknownRuns += 1;
    else if (execution.usageCompleteness === 'legacy_unknown') legacyUnknownRuns += 1;

    let runHasUnknownCost = false;
    for (const request of execution.requests) {
      const latest = request.usageRevisions.at(-1);
      reportedInputTokens += latest?.usage.inputTokens ?? 0;
      reportedOutputTokens += latest?.usage.outputTokens ?? 0;
      if (!latest || latest.usage.inputTokens === null)
        unconfirmedInputTokenReservation += request.reservation.inputTokens;
      if (!latest || latest.usage.outputTokens === null)
        unconfirmedOutputTokenReservation += request.reservation.outputTokens;

      if (latest?.cost.status === 'known')
        addCost(costs, latest.cost.currency, latest.cost.amount, 'known');
      else if (latest?.cost.status === 'estimated')
        addCost(costs, latest.cost.currency, latest.cost.amount, 'estimated');
      else {
        runHasUnknownCost = true;
        addCost(
          costs,
          request.reservation.cost.currency,
          request.reservation.cost.amount,
          'reserved',
        );
      }
    }
    if (runHasUnknownCost) unknownCostRuns += 1;
  }

  return aiUsageSummaryReadModelSchema.parse({
    runs: rows.length,
    reportedInputTokens,
    reportedOutputTokens,
    partialRuns,
    unknownRuns,
    legacyUnknownRuns,
    unknownCostRuns,
    unconfirmedInputTokenReservation,
    unconfirmedOutputTokenReservation,
    costs: [...costs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, bucket]) => ({
        currency,
        knownAmount: decimalText(bucket.known),
        estimatedAmount: decimalText(bucket.estimated),
        unconfirmedReservedAmount: decimalText(bucket.reserved),
      })),
  });
};

export const safeAttemptMetadata = (metadata: unknown) => {
  const value = asRecord(metadata);
  const result: Record<string, unknown> = {};
  if (value.costStatus === 'known' || value.costStatus === 'unknown')
    result.costStatus = value.costStatus;
  if (typeof value.costCurrency === 'string' && /^[A-Z]{3}$/u.test(value.costCurrency))
    result.costCurrency = value.costCurrency;
  if (typeof value.pricingVersion === 'string')
    result.pricingVersion = value.pricingVersion.slice(0, 120);
  return Object.keys(result).length > 0 ? result : null;
};
