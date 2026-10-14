import {
  MARKET_PERIOD_RULE_VERSION,
  type MarketPeriodAggregationInput,
  type MarketPeriodDailyBar,
  type MarketPeriodNoTradingEvidence,
} from './market-period-types.js';
import {
  MarketPeriodAggregationError,
  periodDate,
  periodInstant,
  type MarketPeriodTradingDay,
} from './market-period-calendar.js';

const fingerprint = /^[a-f0-9]{64}$/;

const barEncoding = (bar: MarketPeriodDailyBar) =>
  JSON.stringify([
    bar.symbol,
    bar.tradingDate,
    periodInstant(bar.timestamp),
    bar.adjustment,
    bar.priceBasisFingerprint,
    bar.open,
    bar.high,
    bar.low,
    bar.close,
    bar.volume,
    bar.amount,
    bar.completionStatus,
    periodInstant(bar.availableAt),
  ]);

const validateInputContext = (input: MarketPeriodAggregationInput) => {
  const asOf = periodInstant(input.evaluationAsOf);
  if (
    !input.symbol.trim() ||
    !['5d', '1w', '1mo', '1y'].includes(input.timeframe) ||
    !['none', 'qfq', 'hfq'].includes(input.adjustment) ||
    input.ruleVersion !== MARKET_PERIOD_RULE_VERSION ||
    !fingerprint.test(input.priceBasisFingerprint) ||
    !fingerprint.test(input.baseInputFingerprint)
  )
    throw new MarketPeriodAggregationError(
      'invalid_input',
      '证券、周期、复权、规则版本或基础指纹无效',
    );
  if ((input.timeframe === '5d') !== (input.anchorTradingDate !== undefined))
    throw new MarketPeriodAggregationError('invalid_input', '仅五日周期必须显式指定锚点');
  if (input.anchorTradingDate !== undefined) periodDate(input.anchorTradingDate);
  if (periodInstant(input.calendar.availableAt) > asOf)
    throw new MarketPeriodAggregationError('future_evidence', '日历晚于评估时刻');
  return asOf;
};

const normalizeDailyBar = (
  bar: MarketPeriodDailyBar,
  input: MarketPeriodAggregationInput,
  calendarDays: ReadonlyMap<string, MarketPeriodTradingDay>,
  asOf: number,
): MarketPeriodDailyBar => {
  const day = calendarDays.get(periodDate(bar.tradingDate));
  if (!day || (input.anchorTradingDate !== undefined && bar.tradingDate > input.anchorTradingDate))
    throw new MarketPeriodAggregationError(
      'calendar_unavailable',
      '日线不在已证明日历或五日锚点范围内',
    );
  if (
    bar.symbol !== input.symbol ||
    bar.adjustment !== input.adjustment ||
    bar.priceBasisFingerprint !== input.priceBasisFingerprint
  )
    throw new MarketPeriodAggregationError(
      'price_basis_mismatch',
      '日线证券、复权及完整口径必须一致',
    );
  const values = [bar.open, bar.high, bar.low, bar.close, bar.volume, bar.amount].filter(
    (value): value is number => value !== null,
  );
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    bar.high < Math.max(bar.open, bar.close, bar.low) ||
    bar.low > Math.min(bar.open, bar.close, bar.high) ||
    !['complete', 'incomplete', 'unknown'].includes(bar.completionStatus)
  )
    throw new MarketPeriodAggregationError('invalid_input', '无效日线数值、OHLC 或完成状态');
  const availableAt = periodInstant(bar.availableAt);
  const timestamp = periodInstant(bar.timestamp);
  if (availableAt > asOf || timestamp > asOf)
    throw new MarketPeriodAggregationError('future_evidence', '日线晚于评估时刻');
  if (bar.completionStatus === 'complete' && availableAt < day.endAt)
    throw new MarketPeriodAggregationError(
      'invalid_input',
      '日线完整状态不能早于计划 Session 结束',
    );
  return {
    ...bar,
    timestamp: new Date(timestamp).toISOString(),
    availableAt: new Date(availableAt).toISOString(),
  };
};

const normalizeCoverageEvidence = (
  item: MarketPeriodNoTradingEvidence,
  input: MarketPeriodAggregationInput,
  calendarDays: ReadonlyMap<string, MarketPeriodTradingDay>,
  bars: ReadonlyMap<string, MarketPeriodDailyBar>,
  asOf: number,
): MarketPeriodNoTradingEvidence => {
  const date = periodDate(item.tradingDate);
  if (
    item.symbol !== input.symbol ||
    item.calendarRevision !== input.calendar.revision ||
    item.baseInputFingerprint !== input.baseInputFingerprint ||
    !calendarDays.has(date) ||
    !item.revision.trim() ||
    !item.evidenceRef.trim() ||
    !['suspended', 'no-trading'].includes(item.reason)
  )
    throw new MarketPeriodAggregationError(
      'invalid_input',
      '覆盖证据没有绑定同次证券、日历或基础窗口',
    );
  const availableAt = periodInstant(item.availableAt);
  if (availableAt > asOf)
    throw new MarketPeriodAggregationError('future_evidence', '无交易证据晚于评估时刻');
  if (bars.has(date))
    throw new MarketPeriodAggregationError('conflicting_fact', '日线与无交易证据互相矛盾');
  return {
    symbol: item.symbol,
    tradingDate: item.tradingDate,
    calendarRevision: item.calendarRevision,
    baseInputFingerprint: item.baseInputFingerprint,
    revision: item.revision,
    availableAt: new Date(availableAt).toISOString(),
    evidenceRef: item.evidenceRef,
    reason: item.reason,
  };
};

export const normalizeMarketPeriodInput = (
  input: MarketPeriodAggregationInput,
  days: readonly MarketPeriodTradingDay[],
) => {
  const asOf = validateInputContext(input);
  const calendarDays = new Map(days.map((day) => [day.tradingDate, day]));
  const bars = new Map<string, MarketPeriodDailyBar>();
  for (const item of input.bars) {
    const bar = normalizeDailyBar(item, input, calendarDays, asOf);
    const previous = bars.get(bar.tradingDate);
    if (previous && barEncoding(previous) !== barEncoding(bar))
      throw new MarketPeriodAggregationError('conflicting_fact', '同一交易日日线冲突');
    bars.set(bar.tradingDate, bar);
  }
  const evidence = new Map<string, MarketPeriodNoTradingEvidence>();
  for (const item of input.noTradingEvidence) {
    const normalized = normalizeCoverageEvidence(item, input, calendarDays, bars, asOf);
    const previous = evidence.get(normalized.tradingDate);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized))
      throw new MarketPeriodAggregationError('conflicting_fact', '同一交易日覆盖证据冲突');
    evidence.set(normalized.tradingDate, normalized);
  }
  return { asOf, bars, evidence };
};
