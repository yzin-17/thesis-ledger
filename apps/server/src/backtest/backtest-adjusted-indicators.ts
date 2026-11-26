import {
  alignSeriesAt,
  buildSeriesVariantsAt,
  type BacktestCorporateActionFact,
  type BacktestSeries,
  type BacktestSeriesPoint,
  type BooleanExpression,
  type CorporateActionForSeries,
  type NumericExpression,
  finishBacktestComputation,
} from '@thesis-ledger/domain';
import { indicatorSeriesForSteps } from './backtest-v2-execution-shared.js';

interface IndicatorTick {
  occurredAt: string;
  availableAt: string;
}

const assetType = (instrumentType: BacktestCorporateActionFact['instrumentType']) => {
  if (instrumentType === 'NAV_FUND') return 'fund' as const;
  return instrumentType.toLowerCase() as 'stock' | 'etf';
};

const seriesActions = (
  facts: readonly BacktestCorporateActionFact[],
): CorporateActionForSeries[] => {
  const actions: CorporateActionForSeries[] = [];
  for (const fact of facts) {
    const base = {
      symbol: fact.symbol,
      market: fact.market,
      assetType: assetType(fact.instrumentType),
      occurredAt: fact.occurredAt,
      availableAt: fact.availableAt,
    };
    if (fact.type === 'CASH_DIVIDEND' && fact.cashAmount !== undefined) {
      actions.push({ ...base, type: fact.type, cashAmount: fact.cashAmount });
    }
    if (fact.type !== 'CASH_DIVIDEND' && fact.ratio !== undefined) {
      actions.push({ ...base, type: fact.type, ratio: fact.ratio });
    }
  }
  return actions;
};

const adjustedSourcesAt = (
  sources: ReadonlyMap<string, BacktestSeries>,
  actions: ReturnType<typeof seriesActions>,
  evaluationAt: string,
) => {
  const closePointsBySource = new Map(
    [...sources.values()]
      .filter((series) => series.field === 'close')
      .map((series) => [
        series.sourceId,
        buildSeriesVariantsAt(series, [], evaluationAt).raw.points,
      ]),
  );
  return new Map(
    [...sources].map(([key, series]) => [
      key,
      series.field === 'open' ||
      series.field === 'high' ||
      series.field === 'low' ||
      series.field === 'close'
        ? buildSeriesVariantsAt(series, actions, evaluationAt, {
            ...(closePointsBySource.get(series.sourceId)
              ? { cashDividendReferencePoints: closePointsBySource.get(series.sourceId)! }
              : {}),
          }).adjusted
        : series,
    ]),
  );
};

const pointAtTick = (series: BacktestSeries, tick: IndicatorTick): BacktestSeriesPoint => {
  const strictPoint = series.strictObservations
    ? [...series.points]
        .filter((point) => Date.parse(point.occurredAt) <= Date.parse(tick.occurredAt))
        .at(-1)
    : undefined;
  const aligned = series.strictObservations
    ? { point: strictPoint, reason: '历史窗口观测不可用' }
    : alignSeriesAt(series, [tick.occurredAt])[0];
  if (aligned?.point) {
    return {
      ...aligned.point,
      occurredAt: tick.occurredAt,
      valueOccurredAt: aligned.point.valueOccurredAt ?? aligned.point.occurredAt,
      availableAt:
        aligned.point.researchClock || series.strictObservations
          ? aligned.point.availableAt
          : tick.availableAt,
      ...(aligned.point.researchClock
        ? {
            researchClock: { ...aligned.point.researchClock, decisionAt: tick.occurredAt },
          }
        : {}),
    };
  }
  return {
    occurredAt: tick.occurredAt,
    availableAt: tick.availableAt,
    status: 'unavailable',
    reason: aligned?.reason ?? 'Indicator unavailable',
  };
};

export function* pointInTimeIndicatorSeriesSteps(input: {
  expressions: readonly (BooleanExpression | NumericExpression)[];
  sourceSeries: ReadonlyMap<string, BacktestSeries>;
  corporateActions: readonly BacktestCorporateActionFact[];
  ticks: readonly IndicatorTick[];
}): Generator<void, ReadonlyMap<string, BacktestSeries>, void> {
  const output = new Map<string, BacktestSeries>();
  const buffers = new Map<string, BacktestSeriesPoint[]>();
  const actions = seriesActions(input.corporateActions);
  const indicatorCache = new Map<string, ReadonlyMap<string, BacktestSeries>>();
  const lastEvaluationAt = input.ticks.at(-1)?.occurredAt;
  if (lastEvaluationAt === undefined) return output;
  for (const tick of input.ticks) {
    yield;
    const activeActionIndexes = actions.flatMap((action, index) =>
      Date.parse(action.occurredAt) <= Date.parse(tick.occurredAt) &&
      Date.parse(action.availableAt) <= Date.parse(tick.occurredAt)
        ? [index]
        : [],
    );
    const cacheKey = activeActionIndexes.join(',');
    let current = indicatorCache.get(cacheKey);
    if (!current) {
      const computed = new Map<string, BacktestSeries>();
      const activeActions = activeActionIndexes.map((index) => actions[index]!);
      const adjustedSources = adjustedSourcesAt(
        input.sourceSeries,
        activeActions,
        lastEvaluationAt,
      );
      for (const expression of input.expressions) {
        yield* indicatorSeriesForSteps(expression, adjustedSources, computed);
      }
      for (const series of computed.values()) {
        for (const point of series.points) { Object.freeze(point); yield; }
        Object.freeze(series.points);
      }
      indicatorCache.set(cacheKey, computed);
      current = computed;
    }
    for (const [key, series] of current) {
      const points = buffers.get(key) ?? [];
      points.push(pointAtTick(series, tick));
      buffers.set(key, points);
      output.set(key, {
        ...series,
        adjusted: series.adjusted,
        points,
      });
      yield;
    }
  }
  return output;
}

export const buildPointInTimeIndicatorSeries = (input: Parameters<typeof pointInTimeIndicatorSeriesSteps>[0]) => finishBacktestComputation(pointInTimeIndicatorSeriesSteps(input));
