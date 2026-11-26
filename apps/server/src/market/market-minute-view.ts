import {
  aggregateMarketMinutes,
  MARKET_MINUTE_RULE_VERSION,
  type MarketMinutePeriod,
} from '@thesis-ledger/domain';
import {
  barSeriesSchema,
  canonicalBarSeriesEncoding,
  canonicalMarketPeriodIndicatorEncoding,
  marketMinuteBarSeriesSchema,
  type MarketMinuteBarSeries,
} from '@thesis-ledger/schemas';
import { periodContentFingerprint as hash } from './market-period-source.js';
import type { planMinuteWindow } from './market-minute-window.js';

export function buildMinuteView(
  raw: unknown,
  timeframe: MarketMinutePeriod,
  plan: NonNullable<ReturnType<typeof planMinuteWindow>>,
  evaluationAsOf: string,
  cutoffAt?: string,
) {
  const source = barSeriesSchema.parse(raw),
    context = source.chartContextV3;
  if (
    source.identity.timeframe !== '1m' ||
    source.identity.adjustment !== 'none' ||
    !/\.(HK|US)$/.test(source.identity.symbol) ||
    !['STOCK', 'ETF'].includes(source.identity.assetType) ||
    source.provenance.upstreamSource !== 'futu' ||
    context?.session !== 'regular' ||
    context.requestedStart !== plan.start ||
    context.requestedEnd !== plan.end ||
    context.sourcePriceBasis.adjustment !== 'none' ||
    Date.parse(context.sourcePriceBasis.observedAt) > Date.parse(evaluationAsOf) ||
    Date.parse(source.provenance.fetchedAt) > Date.parse(evaluationAsOf) ||
    hash(canonicalBarSeriesEncoding(source.identity, source.points)) !== source.inputFingerprint
  )
    throw new Error('分钟来源的身份、Session、实际窗口或指纹不匹配');
  const priceBasisFingerprint = hash(JSON.stringify(context.sourcePriceBasis));
  const baseInputFingerprint = hash(
    JSON.stringify([
      source.identity,
      source.inputFingerprint,
      source.provenance,
      context,
      plan.calendar.revision,
    ]),
  );
  const baseObservedEndAt = source.points.at(-1)?.timestamp;
  if (!baseObservedEndAt) throw new Error('分钟来源为空');
  const activeSession = plan.calendar.sessions.find(
    (session) =>
      Date.parse(session.startAt) <= Date.parse(evaluationAsOf) &&
      Date.parse(evaluationAsOf) < Date.parse(session.endAt),
  );
  const currentTrailingCoverage =
    activeSession && Date.parse(baseObservedEndAt) >= Date.parse(activeSession.startAt)
      ? baseObservedEndAt
      : undefined;
  const points = aggregateMarketMinutes({
    calendar: plan.calendar,
    timeframe,
    evaluationAsOf,
    cutoffAt,
    coverageThrough: currentTrailingCoverage,
    includeOpeningBoundary: source.identity.symbol.endsWith('.HK'),
    points: source.points.map((point) => ({
      ...point,
      availableAt: new Date(
        Math.max(
          Date.parse(point.availableAt),
          Date.parse(plan.calendar.availableAt),
          Date.parse(context.sourcePriceBasis.observedAt),
        ),
      ).toISOString(),
    })),
  });
  const identity = { ...source.identity, timeframe };
  const seriesFor = (selected: typeof points, hasMoreBefore: boolean) => {
    const derivation = {
      ruleVersion: MARKET_MINUTE_RULE_VERSION,
      baseTimeframe: '1m',
      timestampConvention: 'interval-end',
      session: 'regular',
      includeOpeningBoundary: source.identity.symbol.endsWith('.HK'),
      basePointCount: source.points.length,
      baseObservedEndAt,
      baseInputFingerprint,
      priceBasisFingerprint,
      calendarRevision: plan.calendar.revision,
      evaluationAsOf,
      ...(cutoffAt ? { cutoffAt } : {}),
      coverageEvidence: [],
    };
    const periodContext = {
      protocol: 'market-period-indicator-v1' as const,
      aggregationFingerprint: hash(JSON.stringify([identity, derivation, selected])),
      pointFingerprint: hash(canonicalBarSeriesEncoding(identity, selected)),
    };
    const series = marketMinuteBarSeriesSchema.parse({
      contractVersion: 1,
      identity,
      points: selected,
      coverage: {
        actualStart: selected[0]?.timestamp ?? null,
        actualEnd: selected.at(-1)?.timestamp ?? null,
        hasMoreBefore,
        latestCompleteTradingDate:
          selected.filter((point) => point.completionStatus === 'complete').at(-1)?.tradingDate ??
          null,
      },
      provenance: {
        kind: 'derived',
        provider: 'thesis-ledger-server',
        providerRevision: MARKET_MINUTE_RULE_VERSION,
        baseSources: [
          {
            providerId: source.provenance.providerId,
            upstreamSource: source.provenance.upstreamSource,
            providerRevision: source.provenance.providerRevision,
            inputFingerprint: source.inputFingerprint,
            priceBasisFingerprint,
          },
        ],
      },
      derivation,
      inputFingerprint: hash(canonicalMarketPeriodIndicatorEncoding(periodContext)),
    });
    return { series, periodContext };
  };
  const visible = points
    .filter((point) => !plan.visibleStart || point.tradingDate >= plan.visibleStart)
    .slice(-plan.visibleLimit);
  const calculation = points.slice(
    -Math.min(plan.calculationLimit, visible.length + plan.calculationLimit - plan.visibleLimit),
  );
  return {
    baseCacheStatus: source.provenance.cacheStatus,
    visible: seriesFor(visible, points.length > visible.length || source.coverage.hasMoreBefore),
    calculation: seriesFor(
      calculation,
      points.length > calculation.length || source.coverage.hasMoreBefore,
    ),
  };
}

export type MinuteView = ReturnType<typeof buildMinuteView>;
export type MinuteSeries = MarketMinuteBarSeries;
