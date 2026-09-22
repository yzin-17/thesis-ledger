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
import type { AiProviderModelPricingView } from '../ai/ai-provider.contracts.js';

export type OptimizationCostFacts = {
  costStatus: 'known' | 'unknown';
  costCurrency?: string;
  pricingVersion?: string;
};

export type OptimizationPricing = {
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
};

type ProviderMetadata = OptimizationPricing & {
  modelPricing?: Readonly<Record<string, AiProviderModelPricingView>>;
};

export const optimizationPricingForModel = (
  metadata: ProviderMetadata | undefined,
  model?: string,
): OptimizationPricing | undefined => {
  const pricing = model && metadata?.modelPricing?.[model] ? metadata.modelPricing[model] : metadata;
  if (!pricing) return undefined;
  return {
    ...(pricing.costPer1kInput === undefined ? {} : { costPer1kInput: pricing.costPer1kInput }),
    ...(pricing.costPer1kOutput === undefined
      ? {}
      : { costPer1kOutput: pricing.costPer1kOutput }),
    ...(pricing.costCurrency === undefined ? {} : { costCurrency: pricing.costCurrency }),
    ...(pricing.pricingVersion === undefined ? {} : { pricingVersion: pricing.pricingVersion }),
  };
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
  model?: string,
): OptimizationCostFacts => {
  const pricing = optimizationPricingForModel(metadata, model);
  const currency = normalizeCostCurrency(pricing?.costCurrency);
  const hasRates =
    typeof pricing?.costPer1kInput === 'number' &&
    Number.isFinite(pricing.costPer1kInput) &&
    pricing.costPer1kInput >= 0 &&
    typeof pricing?.costPer1kOutput === 'number' &&
    Number.isFinite(pricing.costPer1kOutput) &&
    pricing.costPer1kOutput >= 0;
  const pricingVersion = normalizePricingVersion(pricing?.pricingVersion);
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
  costPer1kInput?: unknown;
  costPer1kOutput?: unknown;
};

const modelConfigRoutes = (value: unknown): ModelConfigRoute[] =>
  Array.isArray(value)
    ? value.filter((item): item is ModelConfigRoute => Boolean(item && typeof item === 'object'))
    : [];

export const optimizationPricingForExperimentRoute = (
  modelConfig: unknown,
  provider: string,
  model: string,
  fallback?: ProviderMetadata,
): OptimizationPricing | undefined => {
  const route = modelConfigRoutes(modelConfig).find(
    (candidate) => candidate.provider === provider && candidate.model === model,
  );
  if (!route) return optimizationPricingForModel(fallback, model);
  if (route.costStatus === 'unknown')
    return {
      ...(typeof route.costPer1kInput === 'number'
        ? { costPer1kInput: route.costPer1kInput }
        : {}),
      ...(typeof route.costPer1kOutput === 'number'
        ? { costPer1kOutput: route.costPer1kOutput }
        : {}),
      ...(typeof route.costCurrency === 'string' ? { costCurrency: route.costCurrency } : {}),
      ...(typeof route.pricingVersion === 'string'
        ? { pricingVersion: route.pricingVersion }
        : {}),
    };
  if (typeof route.costPer1kInput === 'number' || typeof route.costPer1kOutput === 'number')
    return {
      ...(typeof route.costPer1kInput === 'number'
        ? { costPer1kInput: route.costPer1kInput }
        : {}),
      ...(typeof route.costPer1kOutput === 'number'
        ? { costPer1kOutput: route.costPer1kOutput }
        : {}),
      ...(typeof route.costCurrency === 'string' ? { costCurrency: route.costCurrency } : {}),
      ...(typeof route.pricingVersion === 'string'
        ? { pricingVersion: route.pricingVersion }
        : {}),
    };
  return optimizationPricingForModel(fallback, model);
};

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
  if (value && typeof value === 'object' && typeof value.toString === 'function') {
    const stringifiable = value as { toString: () => string };
    const text = stringifiable.toString();
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
