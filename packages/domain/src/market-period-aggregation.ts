import {
  MARKET_PERIOD_RULE_VERSION,
  type MarketPeriodAggregation,
  type MarketPeriodAggregationInput,
  type MarketPeriodBar,
  type MarketPeriodNoTradingEvidence,
} from './market-period-types.js';
import {
  marketPeriodBuckets,
  marketPeriodTradingDays,
  MarketPeriodAggregationError,
  periodInstant,
  type MarketPeriodBucket,
} from './market-period-calendar.js';
import { normalizeMarketPeriodInput } from './market-period-input.js';

const aggregateBucket = (
  bucket: MarketPeriodBucket,
  normalized: ReturnType<typeof normalizeMarketPeriodInput>,
  calendarAvailableAt: number,
): MarketPeriodBar | null => {
  const bars = bucket.days.flatMap((day) => {
    const bar = normalized.bars.get(day.tradingDate);
    return bar ? [bar] : [];
  });
  if (bars.length === 0) return null;
  if (!bucket.calendarComplete)
    throw new MarketPeriodAggregationError(
      'calendar_unavailable',
      '日历未覆盖整个周期或不足五个计划交易日',
    );
  const lastDay = bucket.days.at(-1)!;
  const bucketEndAt = lastDay.endAt;
  const expectedTradingDates = bucket.days.map((day) => day.tradingDate);
  const explained = bucket.days.flatMap((day) => {
    const evidence = normalized.evidence.get(day.tradingDate);
    return evidence ? [evidence] : [];
  });
  const missingDays = bucket.days.filter(
    (day) => !normalized.bars.has(day.tradingDate) && !normalized.evidence.has(day.tradingDate),
  );
  let completionStatus: MarketPeriodBar['completionStatus'] = 'complete';
  if (
    bars.some((bar) => bar.completionStatus === 'unknown') ||
    missingDays.some((day) => day.endAt <= normalized.asOf)
  ) {
    completionStatus = 'unknown';
  } else if (
    normalized.asOf < bucketEndAt ||
    bars.some((bar) => bar.completionStatus === 'incomplete')
  ) {
    completionStatus = 'incomplete';
  }
  let availableAt = Math.max(
    calendarAvailableAt,
    ...bars.map((bar) => periodInstant(bar.availableAt)),
    ...explained.map((evidence) => periodInstant(evidence.availableAt)),
  );
  if (completionStatus === 'complete') availableAt = Math.max(availableAt, bucketEndAt);
  const volume = bars.some((bar) => bar.volume === null) ? null : bars.reduce((sum, bar) => sum + bar.volume!, 0);
  const amount = bars.some((bar) => bar.amount === null) ? null : bars.reduce((sum, bar) => sum + bar.amount!, 0);
  if ((volume !== null && !Number.isFinite(volume)) || (amount !== null && !Number.isFinite(amount)))
    throw new MarketPeriodAggregationError('invalid_input', '周期成交量或金额溢出');
  return {
    timestamp: new Date(bucketEndAt).toISOString(),
    tradingDate: lastDay.tradingDate,
    bucketStartDate: bucket.startDate,
    bucketEndDate: bucket.endDate,
    bucketEndAt: new Date(bucketEndAt).toISOString(),
    open: bars[0]!.open,
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
    close: bars.at(-1)!.close,
    volume,
    amount,
    completionStatus,
    availableAt: new Date(availableAt).toISOString(),
    expectedTradingDates,
    observedTradingDates: bars.map((bar) => bar.tradingDate),
    explainedTradingDates: explained.map((evidence) => evidence.tradingDate),
    missingTradingDates: missingDays.map((day) => day.tradingDate),
  };
};

/** 日历及已绑定证据由调用方提供；聚合不读取时钟、网络或存储。 */
export const aggregateMarketDailyBars = (
  input: MarketPeriodAggregationInput,
): MarketPeriodAggregation => {
  const days = marketPeriodTradingDays(input.calendar);
  const normalized = normalizeMarketPeriodInput(input, days);
  const buckets = marketPeriodBuckets(input, days);
  const points = buckets.flatMap((bucket) => {
    const point = aggregateBucket(bucket, normalized, periodInstant(input.calendar.availableAt));
    return point ? [point] : [];
  });
  const usedEvidence = points.flatMap((point) =>
    point.explainedTradingDates.map((date) => normalized.evidence.get(date)!),
  );
  return {
    symbol: input.symbol,
    adjustment: input.adjustment,
    priceBasisFingerprint: input.priceBasisFingerprint,
    kind: 'derived',
    provider: 'thesis-ledger-server',
    providerRevision: MARKET_PERIOD_RULE_VERSION,
    timeframe: input.timeframe,
    calendarRevision: input.calendar.revision,
    baseInputFingerprint: input.baseInputFingerprint,
    evaluationAsOf: new Date(normalized.asOf).toISOString(),
    ...(input.anchorTradingDate === undefined
      ? {}
      : { anchorTradingDate: input.anchorTradingDate }),
    coverageEvidence: usedEvidence,
    points,
  };
};

const evidenceEncoding = (item: MarketPeriodNoTradingEvidence) => [
  item.symbol,
  item.tradingDate,
  item.calendarRevision,
  item.baseInputFingerprint,
  item.revision,
  item.availableAt,
  item.evidenceRef,
  item.reason,
];

/** T3 对该规范化编码生成摘要，缓存和指标不得只散列 OHLC 数值。 */
export const canonicalMarketPeriodEncoding = (result: MarketPeriodAggregation): string =>
  JSON.stringify([
    result.symbol,
    result.timeframe,
    result.adjustment,
    result.priceBasisFingerprint,
    result.kind,
    result.provider,
    result.providerRevision,
    result.calendarRevision,
    result.baseInputFingerprint,
    result.evaluationAsOf,
    result.anchorTradingDate ?? null,
    result.coverageEvidence.map(evidenceEncoding),
    result.points.map((point) => [
      point.timestamp,
      point.tradingDate,
      point.bucketStartDate,
      point.bucketEndDate,
      point.bucketEndAt,
      point.open,
      point.high,
      point.low,
      point.close,
      point.volume,
      point.amount,
      point.completionStatus,
      point.availableAt,
      point.expectedTradingDates,
      point.observedTradingDates,
      point.explainedTradingDates,
      point.missingTradingDates,
    ]),
  ]);
