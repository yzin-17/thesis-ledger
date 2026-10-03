import { DecimalValue } from './decimal.js';

export type BacktestBenchmarkCostAssumption =
  | { kind: 'zero-cost'; version: string }
  | {
      kind: 'proportional';
      version: string;
      commissionRate: string;
      slippageRate: string;
    }
  | { kind: 'unsupported'; version: string; fingerprint: string };

export type BacktestBenchmarkCompatibilityFact =
  | string
  | number
  | boolean
  | null
  | readonly BacktestBenchmarkCompatibilityFact[]
  | { readonly [key: string]: BacktestBenchmarkCompatibilityFact };

/** Frozen facts that must agree before a benchmark can be used for excess-return comparison. */
export interface BacktestBenchmarkCompatibilityIdentity {
  priceProtocol?: BacktestBenchmarkCompatibilityFact;
  returnProtocol?: BacktestBenchmarkCompatibilityFact;
  historyProtocol?: BacktestBenchmarkCompatibilityFact;
  costAssumption?: BacktestBenchmarkCostAssumption;
  source?: BacktestBenchmarkCompatibilityFact;
  dividendAssumption?: BacktestBenchmarkCompatibilityFact;
}

export type BacktestBenchmarkCompatibilityField = keyof BacktestBenchmarkCompatibilityIdentity;

export interface BacktestBenchmarkCompatibilityReport {
  status: 'compatible' | 'incompatible' | 'unverified';
  strategyFingerprint?: string;
  benchmarkFingerprint?: string;
  missingFields: BacktestBenchmarkCompatibilityField[];
  differentFields: BacktestBenchmarkCompatibilityField[];
}

const requiredIdentityFields: BacktestBenchmarkCompatibilityField[] = [
  'priceProtocol',
  'returnProtocol',
  'historyProtocol',
  'costAssumption',
  'source',
  'dividendAssumption',
];

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
};

/** Small dependency-free deterministic checksum; kept stable for existing result checksums. */
export const deterministicResultChecksum = (value: unknown) => {
  const input = canonicalize(value);
  let hash = 1469598103934665603n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
};

const hasAllIdentityFields = (identity: BacktestBenchmarkCompatibilityIdentity) =>
  requiredIdentityFields.every((field) => identity[field] !== undefined);

const fingerprintIdentity = (identity: BacktestBenchmarkCompatibilityIdentity) =>
  deterministicResultChecksum(identity);

export const compareBacktestBenchmarkCompatibility = (
  strategy: BacktestBenchmarkCompatibilityIdentity | undefined,
  benchmark: BacktestBenchmarkCompatibilityIdentity | undefined,
): BacktestBenchmarkCompatibilityReport => {
  const missingFields = requiredIdentityFields.filter(
    (field) => strategy?.[field] === undefined || benchmark?.[field] === undefined,
  );
  const differentFields = requiredIdentityFields.filter((field) => {
    const strategyFact = strategy?.[field];
    const benchmarkFact = benchmark?.[field];
    return (
      strategyFact !== undefined &&
      benchmarkFact !== undefined &&
      canonicalize(strategyFact) !== canonicalize(benchmarkFact)
    );
  });

  let status: BacktestBenchmarkCompatibilityReport['status'] = 'compatible';
  if (differentFields.length > 0) status = 'incompatible';
  else if (missingFields.length > 0) status = 'unverified';

  return {
    status,
    ...(strategy !== undefined && hasAllIdentityFields(strategy)
      ? { strategyFingerprint: fingerprintIdentity(strategy) }
      : {}),
    ...(benchmark !== undefined && hasAllIdentityFields(benchmark)
      ? { benchmarkFingerprint: fingerprintIdentity(benchmark) }
      : {}),
    missingFields,
    differentFields,
  };
};

export type BacktestBenchmarkReturn =
  { status: 'available'; value: string } | { status: 'unavailable'; reason: string };

/** Computes one buy at the first point and one liquidation at the last point. */
export const calculateBuyAndHoldReturn = (
  firstValue: string,
  lastValue: string,
  costAssumption: BacktestBenchmarkCostAssumption,
): BacktestBenchmarkReturn => {
  try {
    const first = DecimalValue.from(firstValue);
    const last = DecimalValue.from(lastValue);
    if (!first.isPositive()) return { status: 'unavailable', reason: 'ZERO_INITIAL_BENCHMARK' };

    if (costAssumption.kind === 'unsupported') {
      return { status: 'unavailable', reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED' };
    }
    if (costAssumption.kind === 'zero-cost') {
      return {
        status: 'available',
        value: last.dividedBy(first, 20).minus('1').toString(),
      };
    }

    const commissionRate = DecimalValue.from(costAssumption.commissionRate);
    const slippageRate = DecimalValue.from(costAssumption.slippageRate);
    const one = DecimalValue.from('1');
    if (
      commissionRate.isNegative() ||
      commissionRate.compareTo(one) >= 0 ||
      slippageRate.isNegative() ||
      slippageRate.compareTo(one) >= 0
    ) {
      return { status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' };
    }

    const buyCostFactor = one.plus(slippageRate).times(one.plus(commissionRate));
    const sellProceedsFactor = one.minus(slippageRate).times(one.minus(commissionRate));
    return {
      status: 'available',
      value: last
        .times(sellProceedsFactor)
        .dividedBy(first.times(buyCostFactor), 20)
        .minus('1')
        .toString(),
    };
  } catch {
    return { status: 'unavailable', reason: 'INVALID_BENCHMARK_COST_ASSUMPTION' };
  }
};
