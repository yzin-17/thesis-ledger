import {
  DecimalValue,
  createCorporateActionPort,
  createExchangeSizingAdapter,
  buildBacktestAnalytics,
  projectBacktestTrades,
  SimulationLedger,
  tradingCalendarFromFact,
  VersionedExecutionRules,
  runDeterministicSimulation,
  evaluateSignalAt,
  evaluateNumericExpression,
  aggregateMinuteBars,
  evaluateIndicator,
  numericExpressionKey,
  sourceSeriesKey,
  CnNavSimulation,
  expectedCutoffSchedule,
  navRequestFromTargetIntent,
  createRiskEvaluationAdapter,
  valueSimulationLedger,
  type BacktestCorporateActionFact,
  type BacktestSeries,
  type ExecutionCalendarFact,
  type ExecutionInstrumentFact,
  type SimulationFillRecord,
  type SimulationLedgerConfig,
  type SimulationSettlement,
  type SimulationFxRate,
  type SimulationTargetIntent,
  type CnNavFact,
  type CnNavSimulationEvent,
  type NumericExpression,
  type BooleanExpression,
  type NumericEvaluation,
  type SimulationEngineInput,
  type BacktestMinuteBar,
  type TradingCalendar,
} from '@thesis-ledger/domain';
import {
  executionRuleSnapshotSchema,
  type ExecutionRuleSnapshot,
  type RunConfig,
  type StrategySchemaV2,
} from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from './backtest-artifact-store.js';

export type RowsByArtifact = ReadonlyMap<string, readonly ArtifactRow[]>;

export const signalArtifactFor = (
  artifacts: readonly ArtifactRef[],
  market: StrategySchemaV2['executionInstrument']['market'],
  symbol: string,
) => {
  const segment = `signal/${market}-${symbol}-`;
  return artifacts.find(
    (artifact) => artifact.key.startsWith(segment) || artifact.key.includes(`/${segment}`),
  );
};

export interface BacktestVerticalInput {
  runId: string;
  strategyVersionId: string;
  snapshotId: string;
  strategy: StrategySchemaV2;
  runConfig: RunConfig;
  rows: RowsByArtifact;
  artifacts: readonly ArtifactRef[];
  engineVersion: string;
  marketRuleVersion: string;
  calendarVersion: string;
  aggregationVersion: string;
}

const parseJson = <T>(value: ArtifactRow['sessions'] | undefined, label: string): T => {
  if (typeof value !== 'string') throw new Error(`${label} 缺少冻结事实`);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} 不是有效 JSON`);
  }
};

const rowsForPurpose = (rows: RowsByArtifact, purpose: string) =>
  [...rows.entries()].find(([key]) => {
    const parts = key.split('/');
    return parts.at(-2) === purpose;
  })?.[1] ?? [];

const fxCompleteness = (quality: unknown): NonNullable<SimulationFxRate['completeness']> => {
  if (quality === 'complete') return 'complete';
  if (quality === 'unavailable') return 'unavailable';
  return 'partial';
};

const latestPointAt = (series: BacktestSeries | undefined, evaluationAt: string) =>
  [...(series?.points ?? [])]
    .filter(
      (point) =>
        Date.parse(point.occurredAt) <= Date.parse(evaluationAt) &&
        Date.parse(point.availableAt) <= Date.parse(evaluationAt),
    )
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
        Date.parse(right.availableAt) - Date.parse(left.availableAt),
    )[0];

const fxRatesFrom = (rows: RowsByArtifact): SimulationFxRate[] =>
  rowsForPurpose(rows, 'fx').flatMap((row) => {
    if (
      (row.fromCurrency !== 'CNY' && row.fromCurrency !== 'HKD' && row.fromCurrency !== 'USD') ||
      (row.toCurrency !== 'CNY' && row.toCurrency !== 'HKD' && row.toCurrency !== 'USD') ||
      typeof row.rate !== 'string'
    ) {
      return [];
    }
    return [
      {
        fromCurrency: row.fromCurrency,
        toCurrency: row.toCurrency,
        rate: row.rate,
        occurredAt: stringField(row, 'occurredAt'),
        availableAt: stringField(row, 'availableAt'),
        provider: stringField(row, 'provider'),
        providerRevision: stringField(row, 'providerRevision'),
        stale: row.freshness === 'stale',
        completeness: fxCompleteness(row.quality),
      },
    ];
  });

const rowFor = (rows: readonly ArtifactRow[], predicate: (row: ArtifactRow) => boolean) => {
  const row = rows.find(predicate);
  if (!row) throw new Error('Snapshot 冻结事实缺失');
  return row;
};

const stringField = (row: Readonly<Record<string, unknown>>, field: string) => {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Snapshot fact ${field} 缺失`);
  return value;
};

const rowsAtTimeframe = (
  rows: readonly ArtifactRow[],
  timeframe: StrategySchemaV2['primaryTimeframe'],
  calendar: TradingCalendar,
): readonly Record<string, unknown>[] => {
  if (timeframe === '1m' || timeframe === '1d') return rows;
  const minuteBars: BacktestMinuteBar[] = rows.map((row) => ({
    symbol: stringField(row, 'symbol'),
    market: row.market as BacktestMinuteBar['market'],
    timeframe: '1m',
    occurredAt: stringField(row, 'occurredAt'),
    availableAt: stringField(row, 'availableAt'),
    open: stringField(row, 'open'),
    high: stringField(row, 'high'),
    low: stringField(row, 'low'),
    close: stringField(row, 'close'),
    volume: stringField(row, 'volume'),
    ...(typeof row.amount === 'string' ? { amount: row.amount } : {}),
    provider: stringField(row, 'provider'),
    providerRevision: stringField(row, 'providerRevision'),
    ...(row.quality === 'complete' ||
    row.quality === 'partial' ||
    row.quality === 'suspended' ||
    row.quality === 'unknown'
      ? { quality: row.quality }
      : {}),
    ...(row.suspended === true ? { suspended: true } : {}),
  }));
  return aggregateMinuteBars(minuteBars, timeframe, { calendar }).map((bar) =>
    Object.fromEntries(Object.entries(bar)),
  );
};

const instrumentType = (assetType: StrategySchemaV2['executionInstrument']['assetType']) => {
  if (assetType === 'stock') return 'STOCK' as const;
  if (assetType === 'etf') return 'ETF' as const;
  return 'NAV_FUND' as const;
};

const executionBars = (rows: readonly Record<string, unknown>[]) => {
  const ordered = rows
    .filter((row) => typeof row.occurredAt === 'string')
    .sort((left, right) =>
      stringField(left, 'occurredAt').localeCompare(stringField(right, 'occurredAt')),
    );
  return ordered.map((row, index) => {
    let previousClose: string;
    if (typeof row.previousClose === 'string') {
      previousClose = row.previousClose;
    } else if (index > 0) {
      previousClose = stringField(ordered[index - 1]!, 'close');
    } else {
      previousClose = stringField(row, 'close');
    }
    let previousCloseAvailableAt: string;
    if (typeof row.previousCloseAvailableAt === 'string') {
      previousCloseAvailableAt = row.previousCloseAvailableAt;
    } else if (index > 0) {
      previousCloseAvailableAt = stringField(ordered[index - 1]!, 'availableAt');
    } else {
      previousCloseAvailableAt = stringField(row, 'availableAt');
    }
    return {
      occurredAt: stringField(row, 'occurredAt'),
      availableAt: stringField(row, 'availableAt'),
      openedAt: typeof row.openedAt === 'string' ? row.openedAt : stringField(row, 'occurredAt'),
      openAvailableAt:
        typeof row.openAvailableAt === 'string'
          ? row.openAvailableAt
          : stringField(row, 'availableAt'),
      previousCloseAvailableAt,
      open: stringField(row, 'open'),
      close: stringField(row, 'close'),
      previousClose,
      status: row.quality === 'suspended' ? ('unavailable' as const) : ('available' as const),
      suspended: row.suspended === true,
    };
  });
};

const calendarFact = (row: ArtifactRow): ExecutionCalendarFact => ({
  market: row.market as ExecutionCalendarFact['market'],
  timezone: stringField(row, 'timezone'),
  provider: stringField(row, 'provider'),
  providerRevision: stringField(row, 'providerRevision'),
  availableAt: stringField(row, 'availableAt'),
  sessions: parseJson(row.sessions, 'Calendar sessions'),
  sessionOverrides: parseJson(row.sessionOverrides, 'Calendar sessionOverrides'),
  holidays: parseJson(row.holidays, 'Calendar holidays'),
  range: parseJson(row.range, 'Calendar range'),
});

const instrumentFact = (row: ArtifactRow): ExecutionInstrumentFact => ({
  symbol: stringField(row, 'symbol'),
  market: row.market as ExecutionInstrumentFact['market'],
  instrumentType: row.instrumentType as ExecutionInstrumentFact['instrumentType'],
  currency: row.currency as ExecutionInstrumentFact['currency'],
  lotSize: stringField(row, 'lotSize'),
  tickSize: stringField(row, 'tickSize'),
  tradable: row.tradable === true,
  provider: stringField(row, 'provider'),
  providerRevision: stringField(row, 'providerRevision'),
  occurredAt: stringField(row, 'occurredAt'),
  availableAt: stringField(row, 'availableAt'),
});

const executionRuleSnapshot = (row: ArtifactRow): ExecutionRuleSnapshot =>
  executionRuleSnapshotSchema.parse(parseJson(row.executionRules, 'Execution rules'));

const toCorporateAction = (row: ArtifactRow): BacktestCorporateActionFact => {
  const result: BacktestCorporateActionFact = {
    symbol: stringField(row, 'symbol'),
    market: row.market as BacktestCorporateActionFact['market'],
    instrumentType: row.instrumentType as BacktestCorporateActionFact['instrumentType'],
    type: row.type as BacktestCorporateActionFact['type'],
    occurredAt: stringField(row, 'occurredAt'),
    availableAt: stringField(row, 'availableAt'),
    provider: stringField(row, 'provider'),
    providerRevision: stringField(row, 'providerRevision'),
  };
  if (typeof row.ratio === 'string') result.ratio = row.ratio;
  if (typeof row.cashAmount === 'string') result.cashAmount = row.cashAmount;
  if (row.currency === 'CNY' || row.currency === 'HKD' || row.currency === 'USD') {
    return { ...result, currency: row.currency };
  }
  return result;
};

const initialLedgerConfig = (
  strategy: StrategySchemaV2,
  runConfig: RunConfig,
): SimulationLedgerConfig => {
  let currency: 'CNY' | 'HKD' | 'USD';
  if (strategy.executionInstrument.market === 'CN') {
    currency = 'CNY';
  } else if (strategy.executionInstrument.market === 'HK') {
    currency = 'HKD';
  } else {
    currency = 'USD';
  }
  return {
    executionInstrument: {
      symbol: strategy.executionInstrument.symbol,
      market: strategy.executionInstrument.market,
      assetType: strategy.executionInstrument.assetType,
      currency,
    },
    baseCurrency: runConfig.baseCurrency,
    initialCash: Object.fromEntries(
      Object.entries(runConfig.initialCash).filter(([, amount]) => amount !== undefined),
    ),
  };
};

const indicatorSeriesFor = (
  expression: BooleanExpression | NumericExpression,
  sourceSeries: ReadonlyMap<string, BacktestSeries>,
  output: Map<string, BacktestSeries>,
): void => {
  if (expression.type === 'indicator') {
    indicatorSeriesFor(expression.input, sourceSeries, output);
    const inputSeries =
      expression.input.type === 'series'
        ? (sourceSeries.get(sourceSeriesKey(expression.input.sourceId, expression.input.field)) ??
          sourceSeries.get(expression.input.sourceId))
        : output.get(numericExpressionKey(expression.input));
    if (!inputSeries) return;
    const indicator = evaluateIndicator(expression.name, inputSeries.points, expression.params, {
      output: expression.output ?? 'value',
    });
    output.set(numericExpressionKey(expression), {
      ...inputSeries,
      sourceId: numericExpressionKey(expression),
      points: indicator.points,
    });
    return;
  }
  if (expression.type === 'compare' || expression.type === 'cross') {
    indicatorSeriesFor(expression.left, sourceSeries, output);
    indicatorSeriesFor(expression.right, sourceSeries, output);
  } else if (expression.type === 'all' || expression.type === 'any') {
    expression.conditions.forEach((condition) =>
      indicatorSeriesFor(condition, sourceSeries, output),
    );
  } else if (expression.type === 'not') {
    indicatorSeriesFor(expression.expression, sourceSeries, output);
  }
};

const numericExpressionsIn = (expression: BooleanExpression): readonly NumericExpression[] => {
  if (expression.type === 'compare' || expression.type === 'cross') {
    return [expression.left, expression.right];
  }
  if (expression.type === 'not') return numericExpressionsIn(expression.expression);
  if (expression.type === 'all' || expression.type === 'any') {
    return expression.conditions.flatMap(numericExpressionsIn);
  }
  return [];
};

export interface ExchangeVerticalResult {
  fills: readonly SimulationFillRecord[];
  rejects: readonly { orderId?: string; reason: string; code: string; occurredAt: string }[];
  trades: ReturnType<typeof projectBacktestTrades>['trades'];
  analytics: ReturnType<typeof buildBacktestAnalytics>;
}

export {
  DecimalValue,
  createCorporateActionPort,
  createExchangeSizingAdapter,
  buildBacktestAnalytics,
  projectBacktestTrades,
  SimulationLedger,
  tradingCalendarFromFact,
  VersionedExecutionRules,
  runDeterministicSimulation,
  evaluateSignalAt,
  evaluateNumericExpression,
  aggregateMinuteBars,
  evaluateIndicator,
  numericExpressionKey,
  sourceSeriesKey,
  CnNavSimulation,
  expectedCutoffSchedule,
  navRequestFromTargetIntent,
  createRiskEvaluationAdapter,
  valueSimulationLedger,
};
export type {
  BacktestCorporateActionFact,
  BacktestSeries,
  ExecutionCalendarFact,
  ExecutionInstrumentFact,
  SimulationFillRecord,
  SimulationLedgerConfig,
  SimulationSettlement,
  SimulationFxRate,
  SimulationTargetIntent,
  CnNavFact,
  CnNavSimulationEvent,
  NumericExpression,
  BooleanExpression,
  NumericEvaluation,
  SimulationEngineInput,
  BacktestMinuteBar,
  TradingCalendar,
};

export {
  calendarFact,
  executionRuleSnapshot,
  executionBars,
  fxRatesFrom,
  indicatorSeriesFor,
  initialLedgerConfig,
  instrumentFact,
  instrumentType,
  latestPointAt,
  numericExpressionsIn,
  parseJson,
  rowFor,
  rowsAtTimeframe,
  rowsForPurpose,
  stringField,
  toCorporateAction,
};
