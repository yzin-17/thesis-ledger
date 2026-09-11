import { describe, expect, it } from 'vitest';
import {
  VersionedExecutionRules,
  tradingCalendarFromFact,
  tradingCalendars,
  type ExecutionOrderCandidate,
  type ExecutionRuleFacts,
  type TradingMarket,
} from '../src/index.js';

const sessionOpen: Record<TradingMarket, string> = {
  CN: '2026-09-08T01:30:00.000Z',
  HK: '2026-09-08T01:30:00.000Z',
  US: '2026-09-08T13:30:00.000Z',
};

const currencyByMarket = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
const symbolByMarket = { CN: '600000.SH', HK: '00005.HK', US: 'AAPL.US' } as const;

const facts = (
  market: TradingMarket,
  overrides: Partial<ExecutionRuleFacts> = {},
): ExecutionRuleFacts => ({
  version: `${market.toLowerCase()}-rules-2026-1`,
  calendar: tradingCalendars[market],
  calendarProvider: 'exchange-calendar-fixture',
  calendarProviderRevision: `${market.toLowerCase()}-calendar-2026-1`,
  calendarAvailableAt: '2026-09-07T00:00:00.000Z',
  instrument: {
    symbol: symbolByMarket[market],
    market,
    instrumentType: 'STOCK',
    currency: currencyByMarket[market],
    lotSize: market === 'CN' ? '100' : market === 'HK' ? '500' : '1',
    tickSize: '0.01',
    tradable: true,
    provider: 'fixture',
    providerRevision: 'instrument-1',
    occurredAt: '2026-09-07T00:00:00.000Z',
    availableAt: '2026-09-07T00:00:00.000Z',
  },
  order: {
    type: 'Market',
    timeInForce: 'DAY',
    executionTiming: 'nextEligibleBarOpen',
    fillPolicy: 'full-or-reject',
    longOnly: true,
  },
  price:
    market === 'CN'
      ? { reference: 'previousClose', maxUpRatio: '0.1', maxDownRatio: '0.1' }
      : { reference: 'previousClose' },
  positionSettlement: { sellableAfterTradingDays: market === 'CN' ? 1 : 0 },
  cashSettlement: {
    buyDebitAfterTradingDays: 0,
    sellCreditAfterTradingDays: market === 'CN' ? 0 : market === 'HK' ? 2 : 1,
  },
  statutoryCharges:
    market === 'CN'
      ? [{ code: 'STAMP_DUTY', side: 'sell', rate: '0.0005' }]
      : [{ code: `${market}_MARKET_FEE`, side: 'both', rate: '0.001' }],
  ...overrides,
});

const order = (
  market: TradingMarket,
  overrides: Partial<ExecutionOrderCandidate> = {},
): ExecutionOrderCandidate => ({
  symbol: symbolByMarket[market],
  market,
  side: 'buy',
  quantity: market === 'CN' ? '250' : market === 'HK' ? '1000' : '3',
  rawPrice: '10',
  previousClose: '10',
  evaluatedAt: sessionOpen[market],
  ...overrides,
});

describe('VersionedExecutionRules 三市场 Golden', () => {
  it('CN 按 lot 向下规范化并使用交易日表达持仓 T+1', () => {
    const rules = new VersionedExecutionRules(facts('CN'));
    expect(rules.evaluate(order('CN'))).toMatchObject({
      accepted: true,
      normalizedQuantity: '200',
      trace: { ruleVersion: 'cn-rules-2026-1', instrumentProviderRevision: 'instrument-1' },
    });
    expect(
      rules.evaluate(
        order('CN', {
          side: 'sell',
          quantity: '100',
          availableQuantity: '100',
          acquiredOn: '2026-09-08',
        }),
      ),
    ).toMatchObject({ accepted: false, code: 'RULE_REJECTED', reasonCode: 'POSITION_NOT_SETTLED' });
    expect(
      rules.evaluate(
        order('CN', {
          side: 'sell',
          quantity: '100',
          availableQuantity: '100',
          acquiredOn: '2026-09-08',
          evaluatedAt: '2026-09-09T01:30:00.000Z',
        }),
      ),
    ).toMatchObject({ accepted: true });
  });

  it('HK 使用市场 Session、lot 和版本化现金结算时钟', () => {
    const rules = new VersionedExecutionRules(facts('HK'));
    expect(rules.evaluate(order('HK', { quantity: '1200' }))).toMatchObject({
      accepted: true,
      normalizedQuantity: '1000',
    });
    expect(rules.settlementDates('sell', '2026-09-08')).toEqual({
      positionAvailableOn: '2026-09-08',
      cashAvailableOn: '2026-09-10',
    });
  });

  it('US 不继承 A 股涨跌幅与 T+1 布尔值，并按事实计算市场费用', () => {
    const rules = new VersionedExecutionRules(facts('US'));
    expect(rules.evaluate(order('US', { rawPrice: '15', previousClose: '10' }))).toMatchObject({
      accepted: true,
      normalizedQuantity: '3',
    });
    expect(rules.statutoryCharges('sell', '30.10')).toEqual([
      { code: 'US_MARKET_FEE', amount: '0.0301', currency: 'USD' },
    ]);
    expect(rules.settlementDates('sell', '2026-09-08').cashAvailableOn).toBe('2026-09-09');
  });
});

describe('VersionedExecutionRules 拒绝与追踪', () => {
  it('从冻结 Calendar Fact 适配时区、Session、节假日和覆盖范围', () => {
    const calendar = tradingCalendarFromFact({
      market: 'HK',
      timezone: 'Asia/Hong_Kong',
      provider: 'dsa',
      providerRevision: 'hk-calendar-1',
      availableAt: '2026-09-07T00:00:00.000Z',
      sessions: [
        { startMinute: 570, endMinute: 720 },
        { startMinute: 780, endMinute: 960 },
      ],
      sessionOverrides: [{ date: '2026-09-08', sessions: [{ startMinute: 570, endMinute: 660 }] }],
      holidays: ['2026-10-01'],
      range: { start: '2026-01-01', end: '2026-12-31' },
    });
    expect(calendar.sessionStatus('2026-09-08T01:30:00.000Z')).toMatchObject({ open: true });
    expect(calendar.sessionStatus('2026-09-08T03:30:00.000Z')).toMatchObject({
      open: false,
      reason: 'outside-session',
    });
    expect(calendar.status('2026-10-01T04:00:00.000Z')).toMatchObject({
      open: false,
      reason: 'exchange-holiday',
    });
    expect(calendar.status('2027-01-04T04:00:00.000Z')).toMatchObject({
      open: false,
      reason: 'calendar-unavailable',
    });
  });

  it('拒绝闭市、非 Session、停牌与未来 Instrument Fact', () => {
    const rules = new VersionedExecutionRules(facts('CN'));
    expect(rules.evaluate(order('CN', { evaluatedAt: '2026-09-08T00:00:00.000Z' }))).toMatchObject({
      reasonCode: 'OUTSIDE_SESSION',
    });
    expect(rules.evaluate(order('CN', { evaluatedAt: '2026-10-01T01:30:00.000Z' }))).toMatchObject({
      reasonCode: 'MARKET_CLOSED',
    });
    expect(rules.evaluate(order('CN', { suspended: true }))).toMatchObject({
      reasonCode: 'SUSPENDED',
    });
    const futureFact = facts('CN', {
      instrument: { ...facts('CN').instrument, availableAt: '2026-09-09T00:00:00.000Z' },
    });
    expect(new VersionedExecutionRules(futureFact).evaluate(order('CN'))).toMatchObject({
      reasonCode: 'INSTRUMENT_NOT_TRADABLE',
    });
    const futureCalendar = facts('CN', { calendarAvailableAt: '2026-09-09T00:00:00.000Z' });
    expect(new VersionedExecutionRules(futureCalendar).evaluate(order('CN'))).toMatchObject({
      reasonCode: 'CALENDAR_UNAVAILABLE',
      trace: { calendarAvailableAt: '2026-09-09T00:00:00.000Z' },
    });
  });

  it('拒绝 Limit/GTC、非 tick 价格、价格上限和持仓不足', () => {
    const rules = new VersionedExecutionRules(facts('CN'));
    expect(rules.evaluate(order('CN', { orderType: 'Limit' }))).toMatchObject({
      reasonCode: 'UNSUPPORTED_ORDER',
    });
    expect(rules.evaluate(order('CN', { rawPrice: '10.005' }))).toMatchObject({
      reasonCode: 'INVALID_TICK',
    });
    expect(rules.evaluate(order('CN', { rawPrice: '11.01' }))).toMatchObject({
      reasonCode: 'PRICE_LIMIT',
    });
    expect(
      rules.evaluate(order('CN', { side: 'sell', availableQuantity: '50', quantity: '100' })),
    ).toMatchObject({ reasonCode: 'INSUFFICIENT_POSITION' });
  });

  it('按 tick halfUp 计算涨跌停边界并保留最小价差', () => {
    const rules = new VersionedExecutionRules(
      facts('CN', {
        price: {
          reference: 'previousClose',
          maxUpRatio: '0.1',
          maxDownRatio: '0.1',
          rounding: 'halfUpToTick',
          minimumDistanceTicks: 1,
          minimumPriceTicks: 1,
        },
      }),
    );
    expect(
      rules.evaluate(order('CN', { rawPrice: '11.06', previousClose: '10.05' })),
    ).toMatchObject({ accepted: true });
    expect(
      rules.evaluate(order('CN', { rawPrice: '11.07', previousClose: '10.05' })),
    ).toMatchObject({ accepted: false, reasonCode: 'PRICE_LIMIT' });
    expect(
      rules.evaluate(order('CN', { rawPrice: '9.05', previousClose: '10.05' })),
    ).toMatchObject({ accepted: true });
    expect(
      rules.evaluate(order('CN', { rawPrice: '9.04', previousClose: '10.05' })),
    ).toMatchObject({ accepted: false, reasonCode: 'PRICE_LIMIT' });
  });

  it('法定费用与最低费用使用 Decimal 计算且保留币种', () => {
    const configured = facts('HK', {
      statutoryCharges: [
        { code: 'LEVY', side: 'both', rate: '0.000027', minimum: '0.01' },
        { code: 'SELL_ONLY', side: 'sell', rate: '0.001' },
      ],
    });
    const rules = new VersionedExecutionRules(configured);
    expect(rules.statutoryCharges('buy', '100')).toEqual([
      { code: 'LEVY', amount: '0.01', currency: 'HKD' },
    ]);
    expect(rules.statutoryCharges('sell', '100')).toEqual([
      { code: 'LEVY', amount: '0.01', currency: 'HKD' },
      { code: 'SELL_ONLY', amount: '0.1', currency: 'HKD' },
    ]);
  });
});
