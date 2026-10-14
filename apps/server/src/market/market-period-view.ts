import {
  aggregateMarketDailyBars,
  canonicalMarketPeriodEncoding,
  MarketPeriodAggregationError,
  type MarketPeriodAggregation,
  type MarketPeriodBar,
} from '@thesis-ledger/domain';
import {
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  marketPeriodBarSeriesSchema,
  type BarSeries,
  type MarketPeriodIndicatorContext,
} from '@thesis-ledger/schemas';
import { bindPeriodSource, periodContentFingerprint } from './market-period-source.js';
import { planMarketPeriodWindow, type MarketPeriodWindowInput } from './market-period-window.js';
import { compareDecisionClockV3 } from './market-pit-decision-window-calendar-v3.js';

function retainProofAvailability(
  aggregate: MarketPeriodAggregation,
  binding: ReturnType<typeof bindPeriodSource>,
  calendarAvailableAt: string,
): MarketPeriodAggregation {
  return {
    ...aggregate,
    points: aggregate.points.map((point) => {
      const times = [
        point.availableAt,
        calendarAvailableAt,
        ...binding.bars
          .filter((bar) => point.observedTradingDates.includes(bar.tradingDate))
          .map((bar) => bar.availableAt),
      ];
      const availableAt = times.reduce((latest, value) =>
        compareDecisionClockV3(value, latest) > 0 ? value : latest,
      );
      return { ...point, availableAt };
    }),
  };
}

function periodWindowSeries(
  aggregate: MarketPeriodAggregation,
  points: readonly MarketPeriodBar[],
  binding: ReturnType<typeof bindPeriodSource>,
  hasMoreBefore: boolean,
) {
  const selected: MarketPeriodAggregation = { ...aggregate, points };
  const identity = { ...binding.source.identity, timeframe: aggregate.timeframe };
  const periodContext: MarketPeriodIndicatorContext = {
    protocol: 'market-period-indicator-v1',
    aggregationFingerprint: periodContentFingerprint(canonicalMarketPeriodEncoding(selected)),
    pointFingerprint: periodContentFingerprint(canonicalBarSeriesEncoding(identity, points)),
  };
  const series = marketPeriodBarSeriesSchema.parse({
    contractVersion: 3,
    identity,
    points,
    coverage: {
      actualStart: points[0]?.timestamp ?? null,
      actualEnd: points.at(-1)?.timestamp ?? null,
      hasMoreBefore,
      latestCompleteTradingDate:
        points.filter((point) => point.completionStatus === 'complete').at(-1)?.tradingDate ?? null,
    },
    provenance: {
      kind: aggregate.kind,
      provider: aggregate.provider,
      providerRevision: aggregate.providerRevision,
      baseSources: [
        {
          providerId: binding.source.provenance.providerId,
          upstreamSource: binding.source.provenance.upstreamSource,
          providerRevision: binding.source.provenance.providerRevision,
          inputFingerprint: binding.source.inputFingerprint,
          priceBasisFingerprint: binding.priceBasisFingerprint,
        },
      ],
    },
    derivation: {
      ruleVersion: aggregate.providerRevision,
      calendarRevision: aggregate.calendarRevision,
      baseInputFingerprint: aggregate.baseInputFingerprint,
      priceBasisFingerprint: aggregate.priceBasisFingerprint,
      evaluationAsOf: aggregate.evaluationAsOf,
      ...(aggregate.anchorTradingDate ? { anchorTradingDate: aggregate.anchorTradingDate } : {}),
      coverageEvidence: [],
    },
    inputFingerprint: periodContentFingerprint(
      canonicalMarketPeriodIndicatorEncoding(periodContext),
    ),
  });
  return { series, periodContext };
}

/** 不读来源或缓存；没有显式可信停牌证据时让缺日保持 unknown。 */
export function buildMarketPeriodView(raw: BarSeries, input: MarketPeriodWindowInput) {
  if (compareDecisionClockV3(input.calendar.availableAt, input.evaluationAsOf) > 0)
    throw new MarketPeriodAggregationError('future_evidence', '日历可用时刻晚于评估');
  const plan = planMarketPeriodWindow(input);
  const binding = bindPeriodSource(raw, input.evaluationAsOf);
  if (
    binding.bars.some(
      (bar) =>
        !plan.baseStart ||
        !plan.baseEnd ||
        bar.tradingDate < plan.baseStart ||
        bar.tradingDate > plan.baseEnd,
    )
  )
    throw new MarketPeriodAggregationError('invalid_input', '实际基础日线超出规划窗口');
  const aggregate = retainProofAvailability(
    {
      ...aggregateMarketDailyBars({
        symbol: binding.source.identity.symbol,
        adjustment: binding.source.identity.adjustment,
        priceBasisFingerprint: binding.priceBasisFingerprint,
        baseInputFingerprint: binding.baseInputFingerprint,
        timeframe: input.timeframe,
        evaluationAsOf: input.evaluationAsOf,
        ruleVersion: 'market-period-aggregation-v1',
        ...(input.anchorTradingDate ? { anchorTradingDate: input.anchorTradingDate } : {}),
        calendar: input.calendar,
        bars: binding.bars,
        noTradingEvidence: [],
      }),
      evaluationAsOf: input.evaluationAsOf,
    },
    binding,
    input.calendar.availableAt,
  );
  const visibleBuckets = new Set(
    plan.visible.map((bucket) => `${bucket.startDate}:${bucket.endDate}`),
  );
  const visiblePoints = aggregate.points.filter((point) =>
    visibleBuckets.has(`${point.bucketStartDate}:${point.bucketEndDate}`),
  );
  const firstVisible = visiblePoints[0];
  const hasMoreBefore =
    firstVisible !== undefined &&
    (aggregate.points.some((point) => point.timestamp < firstVisible.timestamp) ||
      (binding.source.coverage.hasMoreBefore && plan.calendarHasEarlierBucket));
  return {
    plan,
    baseCacheStatus: binding.source.provenance.cacheStatus,
    visible: periodWindowSeries(aggregate, visiblePoints, binding, hasMoreBefore),
    calculation: periodWindowSeries(
      aggregate,
      aggregate.points,
      binding,
      binding.source.coverage.hasMoreBefore,
    ),
  };
}
