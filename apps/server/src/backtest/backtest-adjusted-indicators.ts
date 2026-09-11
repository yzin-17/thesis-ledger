import {
  alignSeriesAt,
  buildSeriesVariantsAt,
  type BacktestCorporateActionFact,
  type BacktestSeries,
  type BacktestSeriesPoint,
  type BooleanExpression,
  type CorporateActionForSeries,
  type NumericExpression,
} from '@thesis-ledger/domain';
import { indicatorSeriesFor } from './backtest-v2-execution-shared.js';

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
  const aligned = alignSeriesAt(series, [tick.occurredAt])[0];
  if (aligned?.point) {
    return {
      ...aligned.point,
      occurredAt: tick.occurredAt,
      availableAt: tick.availableAt,
    };
  }
  return {
    occurredAt: tick.occurredAt,
    availableAt: tick.availableAt,
    status: 'unavailable',
    reason: aligned?.reason ?? 'Indicator unavailable',
  };
};

export const buildPointInTimeIndicatorSeries = (input: {
  expressions: readonly (BooleanExpression | NumericExpression)[];
  sourceSeries: ReadonlyMap<string, BacktestSeries>;
  corporateActions: readonly BacktestCorporateActionFact[];
  ticks: readonly IndicatorTick[];
}): ReadonlyMap<string, BacktestSeries> => {
  const output = new Map<string, BacktestSeries>();
  const actions = seriesActions(input.corporateActions);
  const indicatorCache = new Map<string, ReadonlyMap<string, BacktestSeries>>();
  const lastEvaluationAt = input.ticks.at(-1)?.occurredAt;
  if (lastEvaluationAt === undefined) return output;
  for (const tick of input.ticks) {
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
        indicatorSeriesFor(expression, adjustedSources, computed);
      }
      indicatorCache.set(cacheKey, computed);
      current = computed;
    }
    for (const [key, series] of current) {
      const existing = output.get(key);
      output.set(key, {
        ...series,
        adjusted: series.adjusted,
        points: [...(existing?.points ?? []), pointAtTick(series, tick)],
      });
    }
  }
  return output;
};
