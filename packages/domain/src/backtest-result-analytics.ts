import { DecimalValue } from './decimal.js';
import { calculateBacktestTradeMetrics, type BacktestTradeMetrics } from './backtest-trades.js';
import type {
  BacktestCurrency,
  BacktestMetric,
  BacktestMoney,
  SimulationTrade,
} from './backtest-contract.js';
import {
  calculateBuyAndHoldReturn,
  compareBacktestBenchmarkCompatibility,
  deterministicResultChecksum,
  type BacktestBenchmarkCompatibilityIdentity,
  type BacktestBenchmarkCompatibilityReport,
  type BacktestBenchmarkCostAssumption,
} from './backtest-benchmark-compatibility.js';

export { deterministicResultChecksum };
export type {
  BacktestBenchmarkCompatibilityIdentity,
  BacktestBenchmarkCompatibilityReport,
  BacktestBenchmarkCostAssumption,
} from './backtest-benchmark-compatibility.js';

export interface BacktestEquityPoint {
  occurredAt: string;
  availableAt?: string;
  value: BacktestMoney;
}

export interface BacktestDrawdownPoint {
  occurredAt: string;
  availableAt?: string;
  equity: BacktestMoney;
  peak: BacktestMoney;
  drawdown: string;
}

export interface BacktestBenchmarkPoint {
  occurredAt: string;
  availableAt?: string;
  value: string;
}

export interface BacktestFxPoint {
  occurredAt: string;
  availableAt?: string;
  rate: string;
}

export interface BacktestBenchmarkInput {
  symbol: string;
  currency: BacktestCurrency;
  points: readonly BacktestBenchmarkPoint[];
  fxToBase?: readonly BacktestFxPoint[];
}

export interface BacktestAnalyticsMetadata {
  runId: string;
  strategyVersionId: string;
  snapshotId: string;
  contentHash: string;
  engineVersion: string;
  schemaVersion: '2';
  marketRuleVersion: string;
  calendarVersion: string;
  aggregationVersion: string;
}

export interface BacktestAnalyticsInput extends BacktestAnalyticsMetadata {
  baseCurrency: BacktestCurrency;
  equityCurve: readonly BacktestEquityPoint[];
  periodsPerYear: number;
  trades?: readonly SimulationTrade[];
  turnover?: string;
  benchmark?: BacktestBenchmarkInput | readonly BacktestBenchmarkInput[];
  executionInstrument?: {
    symbol: string;
    currency: BacktestCurrency;
    prices: readonly BacktestBenchmarkPoint[];
    fxToBase?: readonly BacktestFxPoint[];
  };
  benchmarkComparison?: {
    strategy: BacktestBenchmarkCompatibilityIdentity;
    benchmark?: BacktestBenchmarkCompatibilityIdentity;
  };
  unavailableReasons?: readonly string[];
}

export interface BacktestAnalyticsResult {
  equityCurve: BacktestEquityPoint[];
  drawdownCurve: BacktestDrawdownPoint[];
  metrics: Record<string, BacktestMetric>;
  benchmark?: Record<string, BacktestMetric>;
  benchmarkCompatibility?: BacktestBenchmarkCompatibilityReport & {
    costAssumption: BacktestBenchmarkCostAssumption | { kind: 'unavailable' };
  };
  completeness: 'complete' | 'partial' | 'unavailable';
  warnings: string[];
  resultChecksum: string;
}

const available = (value: string): BacktestMetric => ({ status: 'available', value });
const unavailable = (reason: string): BacktestMetric => ({ status: 'unavailable', reason });

const parseTime = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`无效分析时间: ${value}`);
  return parsed;
};

const decimal = (value: string, label: string) => {
  try {
    return DecimalValue.from(value);
  } catch {
    throw new Error(`${label} 不是规范十进制值`);
  }
};

const comparePoints = (left: { occurredAt: string; availableAt?: string }, right: typeof left) => {
  const occurred = parseTime(left.occurredAt) - parseTime(right.occurredAt);
  if (occurred !== 0) return occurred;
  return (
    parseTime(left.availableAt ?? left.occurredAt) -
    parseTime(right.availableAt ?? right.occurredAt)
  );
};

const comparePointsSafely = (
  left: { occurredAt: string; availableAt?: string },
  right: { occurredAt: string; availableAt?: string },
) => {
  try {
    return comparePoints(left, right);
  } catch {
    return left.occurredAt.localeCompare(right.occurredAt);
  }
};

const normalizedEquity = (
  input: BacktestAnalyticsInput,
  warnings: string[],
): BacktestEquityPoint[] => {
  const result: BacktestEquityPoint[] = [];
  for (const point of [...input.equityCurve].sort(comparePointsSafely)) {
    try {
      parseTime(point.occurredAt);
      if (point.availableAt !== undefined) parseTime(point.availableAt);
      if (point.value.currency !== input.baseCurrency) {
        warnings.push(`EQUITY_CURRENCY_MISMATCH:${point.occurredAt}`);
        continue;
      }
      const value = decimal(point.value.amount, '权益值');
      if (value.isNegative()) {
        warnings.push(`INVALID_EQUITY:${point.occurredAt}`);
        continue;
      }
      result.push({
        occurredAt: point.occurredAt,
        ...(point.availableAt === undefined ? {} : { availableAt: point.availableAt }),
        value: { amount: value.toString(), currency: point.value.currency },
      });
    } catch (error) {
      warnings.push(
        `${point.occurredAt}: ${error instanceof Error ? error.message : '权益点不可用'}`,
      );
    }
  }
  return result;
};

const drawdowns = (
  points: readonly BacktestEquityPoint[],
): { curve: BacktestDrawdownPoint[]; max: string } => {
  let peak = DecimalValue.from('0');
  let max = DecimalValue.from('0');
  const curve: BacktestDrawdownPoint[] = [];
  for (const point of points) {
    const equity = DecimalValue.from(point.value.amount);
    if (equity.compareTo(peak) > 0) peak = equity;
    const drawdown = peak.isZero()
      ? DecimalValue.from('0')
      : equity.minus(peak).dividedBy(peak, 20);
    if (drawdown.compareTo(max) < 0) max = drawdown;
    curve.push({
      occurredAt: point.occurredAt,
      ...(point.availableAt === undefined ? {} : { availableAt: point.availableAt }),
      equity: point.value,
      peak: { amount: peak.toString(), currency: point.value.currency },
      drawdown: drawdown.toString(),
    });
  }
  return { curve, max: max.toString() };
};

const decimalMetric = (value: DecimalValue) => available(value.toString());

const numericMetric = (value: number, reason: string): BacktestMetric => {
  if (!Number.isFinite(value)) return unavailable(reason);
  return available(DecimalValue.from(value.toFixed(20)).toString());
};

const returnMetrics = (
  points: readonly BacktestEquityPoint[],
  periodsPerYear: number,
  maxDrawdown: string,
  warnings: string[],
) => {
  const unavailableMetrics = {
    totalReturn: unavailable('INSUFFICIENT_EQUITY_POINTS'),
    cagr: unavailable('INSUFFICIENT_EQUITY_POINTS'),
    maxDrawdown: unavailable('INSUFFICIENT_EQUITY_POINTS'),
    volatility: unavailable('INSUFFICIENT_RETURN_SAMPLES'),
    sharpe: unavailable('INSUFFICIENT_RETURN_SAMPLES'),
    basicPeriodReturn: unavailable('INSUFFICIENT_EQUITY_POINTS'),
  };
  if (points.length < 2) return unavailableMetrics;
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    warnings.push('INVALID_ANNUALIZATION_FACTOR');
    return { ...unavailableMetrics, maxDrawdown: decimalMetric(DecimalValue.from(maxDrawdown)) };
  }
  const first = DecimalValue.from(points[0]!.value.amount);
  const last = DecimalValue.from(points.at(-1)!.value.amount);
  if (first.isZero()) {
    warnings.push('ZERO_INITIAL_EQUITY');
    return { ...unavailableMetrics, maxDrawdown: decimalMetric(DecimalValue.from(maxDrawdown)) };
  }
  const total = last.dividedBy(first, 20).minus('1');
  const returns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = DecimalValue.from(points[index - 1]!.value.amount);
    if (previous.isZero()) {
      warnings.push(`ZERO_EQUITY_AT:${points[index - 1]!.occurredAt}`);
      continue;
    }
    returns.push(
      Number(
        DecimalValue.from(points[index]!.value.amount)
          .dividedBy(previous, 20)
          .minus('1')
          .toString(),
      ),
    );
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.length < 2
      ? Number.NaN
      : returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const standardDeviation = Math.sqrt(variance);
  const periods = points.length - 1;
  const cagrNumber =
    Math.pow(Number(last.toString()) / Number(first.toString()), periodsPerYear / periods) - 1;
  return {
    totalReturn: decimalMetric(total),
    cagr: numericMetric(cagrNumber, 'CAGR_UNAVAILABLE'),
    maxDrawdown: decimalMetric(DecimalValue.from(maxDrawdown)),
    volatility: numericMetric(
      standardDeviation * Math.sqrt(periodsPerYear),
      'VOLATILITY_UNAVAILABLE',
    ),
    sharpe: numericMetric(
      standardDeviation === 0 ? Number.NaN : (mean / standardDeviation) * Math.sqrt(periodsPerYear),
      standardDeviation === 0 ? 'ZERO_VOLATILITY' : 'SHARPE_UNAVAILABLE',
    ),
    basicPeriodReturn: decimalMetric(total),
  };
};

const pointAt = (
  points: readonly BacktestBenchmarkPoint[],
  evaluationAt: string,
): BacktestBenchmarkPoint | undefined =>
  [...points]
    .filter((point) => {
      try {
        return (
          parseTime(point.occurredAt) <= parseTime(evaluationAt) &&
          parseTime(point.availableAt ?? point.occurredAt) <= parseTime(evaluationAt)
        );
      } catch {
        return false;
      }
    })
    .sort(comparePointsSafely)
    .at(-1);

const fxAt = (points: readonly BacktestFxPoint[] | undefined, evaluationAt: string) =>
  points === undefined
    ? undefined
    : [...points]
        .filter((point) => {
          try {
            return (
              parseTime(point.occurredAt) <= parseTime(evaluationAt) &&
              parseTime(point.availableAt ?? point.occurredAt) <= parseTime(evaluationAt)
            );
          } catch {
            return false;
          }
        })
        .sort(comparePointsSafely)
        .at(-1);

const resolveBenchmark = (
  input: BacktestAnalyticsInput,
): {
  benchmark: BacktestBenchmarkInput | undefined;
  multiple: boolean;
  defaultExecutionInstrument: boolean;
} => {
  if (input.benchmark === undefined) {
    if (input.executionInstrument === undefined) {
      return { benchmark: undefined, multiple: false, defaultExecutionInstrument: false };
    }
    return {
      benchmark: {
        symbol: input.executionInstrument.symbol,
        currency: input.executionInstrument.currency,
        points: input.executionInstrument.prices,
        ...(input.executionInstrument.fxToBase === undefined
          ? {}
          : { fxToBase: input.executionInstrument.fxToBase }),
      },
      multiple: false,
      defaultExecutionInstrument: true,
    };
  }
  if ('symbol' in input.benchmark) {
    return { benchmark: input.benchmark, multiple: false, defaultExecutionInstrument: false };
  }
  if (input.benchmark.length !== 1) {
    return { benchmark: undefined, multiple: true, defaultExecutionInstrument: false };
  }
  return {
    benchmark: input.benchmark[0],
    multiple: false,
    defaultExecutionInstrument: false,
  };
};

interface BacktestBenchmarkAnalysis {
  metrics: Record<string, BacktestMetric>;
  compatibility: BacktestBenchmarkCompatibilityReport & {
    costAssumption: BacktestBenchmarkCostAssumption | { kind: 'unavailable' };
  };
}

const benchmarkMetrics = (
  input: BacktestAnalyticsInput,
  equity: readonly BacktestEquityPoint[],
  strategyTotalReturn: BacktestMetric,
  warnings: string[],
): BacktestBenchmarkAnalysis | undefined => {
  const resolution = resolveBenchmark(input);
  const benchmarkIdentity =
    input.benchmarkComparison?.benchmark ??
    (resolution.defaultExecutionInstrument ? input.benchmarkComparison?.strategy : undefined);
  const comparison = compareBacktestBenchmarkCompatibility(
    input.benchmarkComparison?.strategy,
    benchmarkIdentity,
  );
  const hasComparisonInput = input.benchmarkComparison !== undefined;
  const costAssumption = benchmarkIdentity?.costAssumption ?? { kind: 'unavailable' as const };
  const compatibility: BacktestBenchmarkAnalysis['compatibility'] = {
    ...comparison,
    costAssumption,
  };
  const finish = (totalReturn: BacktestMetric): BacktestBenchmarkAnalysis => {
    const metrics: Record<string, BacktestMetric> = { totalReturn };
    if (hasComparisonInput) {
      let excessReturn = unavailable('BENCHMARK_COMPARISON_UNVERIFIED');
      if (comparison.status === 'incompatible') {
        excessReturn = unavailable('BENCHMARK_COMPARISON_INCOMPATIBLE');
      } else if (comparison.status === 'compatible') {
        if (strategyTotalReturn.status !== 'available' || strategyTotalReturn.value === undefined) {
          excessReturn = unavailable('STRATEGY_RETURN_UNAVAILABLE');
        } else if (totalReturn.status !== 'available' || totalReturn.value === undefined) {
          excessReturn = unavailable('BENCHMARK_RETURN_UNAVAILABLE');
        } else {
          excessReturn = decimalMetric(
            decimal(strategyTotalReturn.value, '策略收益').minus(totalReturn.value),
          );
        }
      }
      metrics.excessReturn = excessReturn;
    }
    return { metrics, compatibility };
  };

  if (resolution.multiple) {
    warnings.push('MULTIPLE_BENCHMARKS');
    return finish(unavailable('MAX_ONE_BENCHMARK'));
  }
  const benchmark = resolution.benchmark;
  if (benchmark === undefined) return undefined;
  const values: DecimalValue[] = [];
  const matched = new Set<string>();
  let alignmentIncomplete = false;
  let fxUnavailable = false;
  for (const equityPoint of equity) {
    const source = pointAt(benchmark.points, equityPoint.occurredAt);
    if (source === undefined) {
      alignmentIncomplete = true;
      continue;
    }
    matched.add(`${source.occurredAt}:${source.availableAt ?? source.occurredAt}`);
    let value: DecimalValue;
    try {
      value = decimal(source.value, 'Benchmark 值');
      if (benchmark.currency !== input.baseCurrency) {
        const fx = fxAt(benchmark.fxToBase, equityPoint.occurredAt);
        if (fx === undefined) {
          fxUnavailable = true;
          warnings.push(`FX_UNAVAILABLE:${benchmark.symbol}:${equityPoint.occurredAt}`);
          continue;
        }
        const rate = decimal(fx.rate, 'FX');
        if (!rate.isPositive()) throw new Error('FX 必须为正数');
        value = value.times(rate);
      }
    } catch (error) {
      warnings.push(
        `${benchmark.symbol}:${error instanceof Error ? error.message : 'Benchmark 不可用'}`,
      );
      continue;
    }
    values.push(value);
  }
  if (alignmentIncomplete) warnings.push(`BENCHMARK_ALIGNMENT_INCOMPLETE:${benchmark.symbol}`);
  if (fxUnavailable) return finish(unavailable('FX_UNAVAILABLE'));
  if (alignmentIncomplete || matched.size < 2 || values.length < 2) {
    return finish(unavailable('INSUFFICIENT_BENCHMARK_POINTS'));
  }
  if (costAssumption.kind === 'unavailable') {
    return finish(unavailable('BENCHMARK_COST_ASSUMPTION_UNAVAILABLE'));
  }
  const benchmarkReturn = calculateBuyAndHoldReturn(
    values[0]!.toString(),
    values.at(-1)!.toString(),
    costAssumption,
  );
  return finish(
    benchmarkReturn.status === 'available'
      ? available(benchmarkReturn.value)
      : unavailable(benchmarkReturn.reason),
  );
};

const tradeMetricRecord = (
  trades: readonly SimulationTrade[] | undefined,
): BacktestTradeMetrics => {
  if (trades === undefined) {
    return {
      tradeCount: unavailable('TRADE_DATA_UNAVAILABLE'),
      winRate: unavailable('TRADE_DATA_UNAVAILABLE'),
      profitFactor: unavailable('TRADE_DATA_UNAVAILABLE'),
      warnings: [],
    };
  }
  return calculateBacktestTradeMetrics(trades);
};

const turnoverMetric = (
  input: BacktestAnalyticsInput,
  trades: readonly SimulationTrade[] | undefined,
): BacktestMetric => {
  if (input.turnover !== undefined) {
    try {
      return decimalMetric(decimal(input.turnover, 'Turnover'));
    } catch {
      return unavailable('INVALID_TURNOVER');
    }
  }
  if (trades === undefined) return unavailable('TURNOVER_DATA_UNAVAILABLE');
  if (
    trades.some(
      (trade) =>
        trade.entryValue.currency !== input.baseCurrency ||
        trade.exitValue.currency !== input.baseCurrency,
    )
  ) {
    return unavailable('TURNOVER_FX_UNAVAILABLE');
  }
  const total = trades.reduce(
    (sum, trade) => sum.plus(trade.entryValue.amount).plus(trade.exitValue.amount),
    DecimalValue.from('0'),
  );
  return decimalMetric(total);
};

export const buildBacktestAnalytics = (input: BacktestAnalyticsInput): BacktestAnalyticsResult => {
  const warnings: string[] = [];
  warnings.push(...(input.unavailableReasons ?? []));
  const equityCurve = normalizedEquity(input, warnings);
  const drawdown = drawdowns(equityCurve);
  const tradeMetrics = tradeMetricRecord(input.trades);
  warnings.push(...tradeMetrics.warnings);
  const metrics = {
    ...returnMetrics(equityCurve, input.periodsPerYear, drawdown.max, warnings),
    tradeCount: tradeMetrics.tradeCount,
    winRate: tradeMetrics.winRate,
    profitFactor: tradeMetrics.profitFactor,
    turnover: turnoverMetric(input, input.trades),
  };
  const benchmarkAnalysis = benchmarkMetrics(input, equityCurve, metrics.totalReturn, warnings);
  const benchmark = benchmarkAnalysis?.metrics;
  if (
    benchmark !== undefined &&
    Object.values(benchmark).some((metric) => metric.status === 'unavailable')
  ) {
    warnings.push('BENCHMARK_UNAVAILABLE');
  }
  if (
    input.benchmarkComparison !== undefined &&
    benchmark?.excessReturn?.status === 'unavailable'
  ) {
    warnings.push('BENCHMARK_COMPARISON_UNAVAILABLE');
  }
  let completeness: BacktestAnalyticsResult['completeness'] = 'complete';
  if (equityCurve.length === 0 || (input.unavailableReasons?.length ?? 0) > 0) {
    completeness = 'unavailable';
  } else if (
    warnings.length > 0 ||
    Object.values(metrics).some(
      (metric) => metric.status === 'unavailable' && metric.reason !== 'NO_LOSING_TRADES',
    )
  ) {
    completeness = 'partial';
  }
  const checksumPayload = {
    metadata: {
      runId: input.runId,
      strategyVersionId: input.strategyVersionId,
      snapshotId: input.snapshotId,
      contentHash: input.contentHash,
      engineVersion: input.engineVersion,
      schemaVersion: input.schemaVersion,
      marketRuleVersion: input.marketRuleVersion,
      calendarVersion: input.calendarVersion,
      aggregationVersion: input.aggregationVersion,
    },
    completeness,
    warnings: [...warnings].sort(),
    equityCurve,
    drawdownCurve: drawdown.curve,
    metrics,
    benchmark,
    benchmarkCompatibility: benchmarkAnalysis?.compatibility,
  };
  return {
    equityCurve,
    drawdownCurve: drawdown.curve,
    metrics,
    ...(benchmark === undefined ? {} : { benchmark }),
    ...(benchmarkAnalysis === undefined
      ? {}
      : { benchmarkCompatibility: benchmarkAnalysis.compatibility }),
    completeness,
    warnings,
    resultChecksum: deterministicResultChecksum(checksumPayload),
  };
};

export const createBacktestResultAnalytics = buildBacktestAnalytics;
