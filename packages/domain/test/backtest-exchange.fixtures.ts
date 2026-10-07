import {
  tradingCalendars,
  VersionedExecutionRules,
  type ExchangeMarketSimulationInput,
  type ExecutionRuleFacts,
  type ExchangeOrderRequest,
  type TradingMarket,
} from '../src/index.js';

export const currency = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
export const symbol = { CN: '600000.SH', HK: '00005.HK', US: 'AAPL.US' } as const;
export const openAt = {
  CN: '2026-09-08T01:30:00.000Z',
  HK: '2026-09-08T01:30:00.000Z',
  US: '2026-09-08T13:30:00.000Z',
} as const;
export const lotSize = (market: TradingMarket) => {
  if (market === 'CN') return '100';
  if (market === 'HK') return '500';
  return '1';
};

export const facts = (market: TradingMarket): ExecutionRuleFacts => {
  const statutoryCharges =
    market === 'CN'
      ? [{ code: 'STAMP_DUTY', side: 'sell' as const, rate: '0.0005' }]
      : [{ code: market === 'HK' ? 'LEVY' : 'SEC_FEE', side: 'sell' as const, rate: '0.0001' }];
  return {
    version: `${market.toLowerCase()}-exchange-2026-1`,
    calendar: tradingCalendars[market],
    calendarProvider: 'exchange-fixture',
    calendarProviderRevision: `${market.toLowerCase()}-calendar-1`,
    calendarAvailableAt: '2026-09-01T00:00:00.000Z',
    instrument: {
      symbol: symbol[market],
      market,
      instrumentType: market === 'US' ? 'ETF' : 'STOCK',
      currency: currency[market],
      lotSize: lotSize(market),
      tickSize: '0.01',
      tradable: true,
      provider: 'exchange-fixture',
      providerRevision: 'instrument-1',
      occurredAt: '2026-09-01T00:00:00.000Z',
      availableAt: '2026-09-01T00:00:00.000Z',
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
      sellCreditAfterTradingDays: market === 'US' ? 1 : 0,
    },
    statutoryCharges,
  };
};

export const order = (
  market: TradingMarket,
  overrides: Partial<ExchangeOrderRequest> = {},
): ExchangeOrderRequest => ({
  intentId: 'intent-1',
  signalId: 'signal-1',
  orderId: 'order-1',
  executionSymbol: symbol[market],
  market,
  side: 'buy',
  reason: 'signal',
  occurredAt: new Date(Date.parse(openAt[market]) + 5 * 60_000).toISOString(),
  availableAt: new Date(Date.parse(openAt[market]) + 5 * 60_000).toISOString(),
  quantity: lotSize(market),
  ...overrides,
});

export const input = (
  market: TradingMarket,
  overrides: Partial<ExchangeMarketSimulationInput> = {},
): ExchangeMarketSimulationInput => {
  const ruleFacts = facts(market);
  const rules = new VersionedExecutionRules(ruleFacts);
  const firstOpen = openAt[market];
  const firstCompleted = new Date(Date.parse(firstOpen) + 5 * 60_000).toISOString();
  const secondOpen = new Date(Date.parse(firstOpen) + 10 * 60_000).toISOString();
  const secondCompleted = new Date(Date.parse(firstOpen) + 15 * 60_000).toISOString();
  return {
    rules,
    calendar: ruleFacts.calendar,
    currency: currency[market],
    bars: [
      {
        occurredAt: firstCompleted,
        availableAt: firstCompleted,
        openedAt: firstOpen,
        openAvailableAt: firstOpen,
        previousCloseAvailableAt: firstOpen,
        open: '10.00',
        previousClose: '9.90',
      },
      {
        occurredAt: secondCompleted,
        availableAt: secondCompleted,
        openedAt: secondOpen,
        openAvailableAt: secondOpen,
        previousCloseAvailableAt: secondOpen,
        open: '10.10',
        previousClose: '10.00',
      },
    ],
    account: { settledCash: '100000', availableQuantity: '1000' },
    costs: {
      version: 'strategy-cost-1',
      slippageRate: '0.01',
      commissionRate: '0.001',
      minimumCommission: { amount: '1', currency: currency[market] },
    },
    order: order(market),
    ...overrides,
  };
};
