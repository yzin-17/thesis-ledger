import { BadRequestException } from '@nestjs/common';
import { DecimalValue } from '@thesis-ledger/domain';
import {
  optimizationCostErrorCodeSchema,
  type OptimizationCostErrorCode,
  type OptimizationCostSummary,
} from '@thesis-ledger/schemas';
import {
  optimizationSha256,
  toRecord,
  type AttemptRow,
  type ExperimentRow,
} from './strategy-optimization-common.js';

export type OptimizationCostFacts = {
  costStatus: 'known' | 'unknown';
  costCurrency?: string;
  pricingVersion?: string;
};

type ProviderMetadata = {
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
};

export const normalizeCostCurrency = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(currency) ? currency : null;
};

export const normalizePricingVersion = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const version = value.trim();
  return version.length > 0 ? version : null;
};

export const isKnownCostAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const optimizationCostFacts = (
  metadata: ProviderMetadata | undefined,
): OptimizationCostFacts => {
  const currency = normalizeCostCurrency(metadata?.costCurrency);
  const hasRates =
    typeof metadata?.costPer1kInput === 'number' &&
    Number.isFinite(metadata.costPer1kInput) &&
    metadata.costPer1kInput >= 0 &&
    typeof metadata?.costPer1kOutput === 'number' &&
    Number.isFinite(metadata.costPer1kOutput) &&
    metadata.costPer1kOutput >= 0;
  const pricingVersion = normalizePricingVersion(metadata?.pricingVersion);
  return {
    costStatus: hasRates && currency ? 'known' : 'unknown',
    ...(currency ? { costCurrency: currency } : {}),
    ...(pricingVersion ? { pricingVersion } : {}),
  };
};

export const optimizationCostError = (
  errorCode: OptimizationCostErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => {
  const code = optimizationCostErrorCodeSchema.parse(errorCode);
  return new BadRequestException({
    errorCode: code,
    message,
    ...(details === undefined ? {} : { details }),
  });
};

type ModelConfigRoute = OptimizationCostFacts & {
  provider?: unknown;
  model?: unknown;
};

const modelConfigRoutes = (value: unknown): ModelConfigRoute[] =>
  Array.isArray(value)
    ? value.filter((item): item is ModelConfigRoute => Boolean(item && typeof item === 'object'))
    : [];

export const assertOptimizationModelConfigCost = (value: unknown) => {
  const routes = modelConfigRoutes(value);
  const currencies = [
    ...new Set(
      routes
        .map((route) => normalizeCostCurrency(route.costCurrency))
        .filter((currency): currency is string => currency !== null),
    ),
  ];
  if (currencies.length > 1)
    throw optimizationCostError(
      'OPTIMIZATION_COST_MIXED_CURRENCY',
      '同一实验不能混用已知的不同计费币种',
      { currencies },
    );
  return currencies[0] ?? null;
};

export const sameOptimizationCostConfirmation = (
  previous: { modelConfig: unknown; budget: unknown; maxRounds?: unknown },
  current: { modelConfig: unknown; budget: unknown; maxRounds?: unknown },
) => {
  try {
    return (
      optimizationSha256({
        modelConfig: previous.modelConfig,
        budget: previous.budget,
        maxRounds: previous.maxRounds,
      }) ===
      optimizationSha256({
        modelConfig: current.modelConfig,
        budget: current.budget,
        maxRounds: current.maxRounds,
      })
    );
  } catch {
    return false;
  }
};

export const normalizeCostAmountText = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value)) return value;
  if (value && typeof value === 'object' && 'toString' in value) {
    const text = String(value);
    if (/^\d+(?:\.\d+)?$/u.test(text)) return text;
  }
  return null;
};

const addAmount = (left: string, right: string) =>
  DecimalValue.from(left).plus(DecimalValue.from(right)).toString();

const routeKey = (route: ModelConfigRoute) =>
  typeof route.provider === 'string' && typeof route.model === 'string'
    ? `${route.provider}:${route.model}`
    : null;

export const optimizationCostSummary = (
  experiment: Pick<ExperimentRow, 'modelConfig'> & { costUsed: unknown },
  attempts?: readonly AttemptRow[],
): OptimizationCostSummary => {
  const routes = modelConfigRoutes(experiment.modelConfig);
  if (routes.length === 0)
    return {
      status: 'unavailable',
      currency: null,
      knownAmount: null,
      knownByCurrency: [],
      reason: 'historical_missing_metadata',
    };

  const knownRoutes = routes.filter(
    (route) => route.costStatus === 'known' && normalizeCostCurrency(route.costCurrency),
  );
  const declaredCurrencies = [
    ...new Set(
      routes
        .map((route) => normalizeCostCurrency(route.costCurrency))
        .filter((currency): currency is string => currency !== null),
    ),
  ];
  const unknownRoute = routes.some(
    (route) => route.costStatus !== 'known' || !normalizeCostCurrency(route.costCurrency),
  );
  const amounts = new Map<string, string>();
  let unknownReason: OptimizationCostSummary['reason'] = null;
  if (unknownRoute) {
    const routeWithUnknownCurrency = routes.some(
      (route) => !normalizeCostCurrency(route.costCurrency),
    );
    unknownReason = routeWithUnknownCurrency ? 'unknown_currency' : 'unknown_cost';
  }
  const routeByKey = new Map(routes.map((route) => [routeKey(route), route]));
  const observedCurrencies = new Set(declaredCurrencies);

  if (attempts) {
    for (const attempt of attempts) {
      const route = routeByKey.get(attempt.modelKey);
      const metadata = toRecord(attempt.modelMetadata);
      const attemptStatus = metadata.costStatus;
      const attemptCurrency = normalizeCostCurrency(metadata.costCurrency);
      if (!route) unknownReason = 'historical_missing_metadata';
      if (attemptStatus !== 'known') {
        if (attemptStatus === 'unknown')
          unknownReason = attemptCurrency ? 'unknown_cost' : 'unknown_currency';
        else unknownReason = 'historical_missing_metadata';
        continue;
      }
      if (!attemptCurrency) {
        unknownReason = 'unknown_currency';
        continue;
      }
      observedCurrencies.add(attemptCurrency);
      const routeCurrency = route ? normalizeCostCurrency(route.costCurrency) : null;
      if (route?.costStatus === 'known' && routeCurrency && routeCurrency !== attemptCurrency)
        unknownReason = 'mixed_currency';
      const amount = normalizeCostAmountText(attempt.cost);
      if (amount === null) {
        unknownReason = 'unknown_cost';
        continue;
      }
      amounts.set(attemptCurrency, addAmount(amounts.get(attemptCurrency) ?? '0', amount));
    }
  }

  if (observedCurrencies.size > 1)
    return {
      status: 'mixed_currency',
      currency: null,
      knownAmount: null,
      knownByCurrency: [...amounts.entries()].map(([currency, amount]) => ({ currency, amount })),
      reason: 'mixed_currency',
    };

  const currency = declaredCurrencies.length === 1 ? (declaredCurrencies[0] ?? null) : null;
  if (!attempts && currency && !unknownRoute)
    amounts.set(currency, normalizeCostAmountText(experiment.costUsed) ?? '0');
  const knownByCurrency = [...amounts.entries()].map(([itemCurrency, amount]) => ({
    currency: itemCurrency,
    amount,
  }));
  if (unknownRoute || unknownReason) {
    return {
      status:
        knownRoutes.length > 0 || declaredCurrencies.length > 0 || knownByCurrency.length > 0
          ? 'partial'
          : 'unavailable',
      currency,
      knownAmount: knownByCurrency.length === 1 ? knownByCurrency[0]!.amount : null,
      knownByCurrency,
      reason: unknownReason ?? 'unknown_cost',
    };
  }
  const amount = knownByCurrency[0]?.amount ?? normalizeCostAmountText(experiment.costUsed) ?? '0';
  return {
    status: 'complete',
    currency,
    knownAmount: amount,
    knownByCurrency: [{ currency: currency!, amount }],
    reason: null,
  };
};
