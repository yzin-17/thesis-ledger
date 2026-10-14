import {
  MARKET_PERIOD_RULE_VERSION,
  type MarketPeriodAggregationInput,
  type MarketPeriodCalendarFact,
  type MarketPeriodDailyBar,
  type MarketPeriodNoTradingEvidence,
} from '../../src/market-period-types.js';

export const priceBasisFingerprint = 'a'.repeat(64);
export const baseInputFingerprint = 'b'.repeat(64);

/** 受控工作日日历，只证明分桶语义，不证明交易所实际开闭市。 */
export const calendarFixture = (
  start = '2026-09-07',
  end = '2026-09-13',
  closed: readonly string[] = [],
): MarketPeriodCalendarFact => {
  const sessions = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= end) {
    const date = cursor.toISOString().slice(0, 10);
    if (![0, 6].includes(cursor.getUTCDay()) && !closed.includes(date))
      sessions.push({
        tradingDate: date,
        startAt: `${date}T01:30:00.000Z`,
        endAt: `${date}T07:00:00.000Z`,
      });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return {
    market: 'CN',
    timezone: 'Asia/Shanghai',
    revision: 'fixture-calendar-r1',
    availableAt: '2025-01-01T00:00:00.000Z',
    coverageStart: start,
    coverageEnd: end,
    sessions,
  };
};

export const dailyFixture = (tradingDate: string, value = 10): MarketPeriodDailyBar => ({
  symbol: '510300.SH',
  tradingDate,
  timestamp: `${tradingDate}T07:00:00.000Z`,
  adjustment: 'none',
  priceBasisFingerprint,
  open: value,
  high: value + 2,
  low: value - 1,
  close: value + 1,
  volume: value,
  amount: value * 100,
  completionStatus: 'complete',
  availableAt: `${tradingDate}T07:00:00.000Z`,
});

export const inputFixture = (
  overrides: Partial<MarketPeriodAggregationInput> = {},
): MarketPeriodAggregationInput => {
  const calendar = overrides.calendar ?? calendarFixture();
  return {
    symbol: '510300.SH',
    timeframe: '1w',
    adjustment: 'none',
    priceBasisFingerprint,
    baseInputFingerprint,
    ruleVersion: MARKET_PERIOD_RULE_VERSION,
    evaluationAsOf: '2026-09-14T00:00:00.000Z',
    calendar,
    bars: calendar.sessions.map((session, index) => dailyFixture(session.tradingDate, 10 + index)),
    noTradingEvidence: [],
    ...overrides,
  };
};

export const suspensionFixture = (tradingDate = '2026-09-09'): MarketPeriodNoTradingEvidence => ({
  symbol: '510300.SH',
  tradingDate,
  calendarRevision: 'fixture-calendar-r1',
  baseInputFingerprint,
  revision: 'suspension-r1',
  availableAt: `${tradingDate}T07:05:00.000Z`,
  evidenceRef: `notice:${tradingDate}`,
  reason: 'suspended',
});
