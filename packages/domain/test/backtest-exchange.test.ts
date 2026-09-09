import { describe, expect, it } from 'vitest';
import {
  ExchangeMarketSimulation,
  SimulationLedger,
  tradingCalendars,
  VersionedExecutionRules,
  type ExchangeMarketSimulationInput,
  type ExecutionRuleFacts,
  type ExchangeOrderRequest,
  type TradingMarket,
} from '../src/index.js';

const currency = { CN: 'CNY', HK: 'HKD', US: 'USD' } as const;
const symbol = { CN: '600000.SH', HK: '00005.HK', US: 'AAPL.US' } as const;
const openAt = {
  CN: '2026-09-08T01:30:00.000Z',
  HK: '2026-09-08T01:30:00.000Z',
  US: '2026-09-08T13:30:00.000Z',
} as const;
const lotSize = (market: TradingMarket) => {
  if (market === 'CN') return '100';
  if (market === 'HK') return '500';
  return '1';
};

const facts = (market: TradingMarket): ExecutionRuleFacts => {
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

const order = (
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

const input = (
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

describe('ExchangeMarketSimulation', () => {
  it.each(['CN', 'HK', 'US'] as const)('creates deterministic raw-open fills for %s', (market) => {
    const simulation = new ExchangeMarketSimulation();
    const first = simulation.plan(input(market));
    const second = simulation.plan(input(market));
    expect(first).toEqual(second);
    expect(first.status).toBe('filled');
    if (first.status !== 'filled') return;
    expect(first.fill.occurredAt).toBe(
      new Date(Date.parse(openAt[market]) + 10 * 60_000).toISOString(),
    );
    expect(first.fill.price).toBe('10.201');
    expect(first.fill.quantity).toBe(lotSize(market));
    expect(first.fill.charges.every((charge) => charge.currency === currency[market])).toBe(true);
    expect(first.settlement.sourceEventId).toBe(first.ledgerFill.eventId);
    expect(
      first.settlement.ledgerSettlements.every(
        (item) => item.sourceEventId === first.ledgerFill.eventId,
      ),
    ).toBe(true);
  });

  it('executes risk only at the next eligible bar open and expires DAY orders', () => {
    const market = 'CN' as const;
    const planned = new ExchangeMarketSimulation().plan(
      input(market, {
        order: order(market, { reason: 'risk' }),
      }),
    );
    expect(planned.status).toBe('filled');
    if (planned.status === 'filled')
      expect(planned.fill.occurredAt).toBe('2026-09-08T01:40:00.000Z');
    const expired = new ExchangeMarketSimulation().plan(
      input(market, {
        bars: [
          {
            occurredAt: '2026-09-08T01:35:00.000Z',
            availableAt: '2026-09-08T01:35:00.000Z',
            openedAt: '2026-09-08T01:30:00.000Z',
            openAvailableAt: '2026-09-08T01:30:00.000Z',
            previousCloseAvailableAt: '2026-09-08T01:30:00.000Z',
            open: '10.10',
            previousClose: '10.00',
          },
        ],
      }),
    );
    expect(expired).toMatchObject({ status: 'rejected', reject: { code: 'DAY_EXPIRED' } });
  });

  it('rejects insufficient cash with stable facts', () => {
    const cash = new ExchangeMarketSimulation().plan(
      input('US', { account: { settledCash: '1', availableQuantity: '1' } }),
    );
    expect(cash).toMatchObject({ status: 'rejected', reject: { code: 'INSUFFICIENT_CASH' } });
  });

  it('rejects a quantity below the market lot', () => {
    const lot = new ExchangeMarketSimulation().plan(
      input('CN', { order: order('CN', { quantity: '1' }) }),
    );
    expect(lot).toMatchObject({ status: 'rejected', reject: { code: 'RULE_REJECTED' } });
  });

  it('rejects a non-tick-aligned open price', () => {
    const tick = new ExchangeMarketSimulation().plan(
      input('US', {
        bars: [
          {
            occurredAt: '2026-09-08T13:35:00.000Z',
            availableAt: '2026-09-08T13:35:00.000Z',
            openedAt: '2026-09-08T13:30:00.000Z',
            openAvailableAt: '2026-09-08T13:30:00.000Z',
            previousCloseAvailableAt: '2026-09-08T13:30:00.000Z',
            open: '10.00',
            previousClose: '9.90',
          },
          {
            occurredAt: '2026-09-08T13:45:00.000Z',
            availableAt: '2026-09-08T13:45:00.000Z',
            openedAt: '2026-09-08T13:40:00.000Z',
            openAvailableAt: '2026-09-08T13:40:00.000Z',
            previousCloseAvailableAt: '2026-09-08T13:40:00.000Z',
            open: '10.105',
            previousClose: '10.00',
          },
        ],
      }),
    );
    expect(tick).toMatchObject({ status: 'rejected', reject: { code: 'RULE_REJECTED' } });
  });

  it('rejects a suspended target bar', () => {
    const suspended = new ExchangeMarketSimulation().plan(
      input('HK', {
        bars: [
          {
            occurredAt: '2026-09-08T01:35:00.000Z',
            availableAt: '2026-09-08T01:35:00.000Z',
            openedAt: '2026-09-08T01:30:00.000Z',
            openAvailableAt: '2026-09-08T01:30:00.000Z',
            previousCloseAvailableAt: '2026-09-08T01:30:00.000Z',
            open: '10.00',
            previousClose: '9.90',
          },
          {
            occurredAt: '2026-09-08T01:45:00.000Z',
            availableAt: '2026-09-08T01:45:00.000Z',
            openedAt: '2026-09-08T01:40:00.000Z',
            openAvailableAt: '2026-09-08T01:40:00.000Z',
            previousCloseAvailableAt: '2026-09-08T01:40:00.000Z',
            open: '10.10',
            previousClose: '10.00',
            suspended: true,
          },
        ],
      }),
    );
    expect(suspended).toMatchObject({ status: 'rejected', reject: { code: 'RULE_REJECTED' } });
  });

  it('keeps strategy commission separate from one rules-provided statutory charge', () => {
    const planned = new ExchangeMarketSimulation().plan(
      input('HK', {
        order: order('HK', { side: 'sell' }),
      }),
    );
    expect(planned.status).toBe('filled');
    if (planned.status !== 'filled') return;
    expect(planned.fill.charges.map((charge) => charge.amount)).toEqual(['4.9995', '0.49995']);
    expect(planned.chargeBreakdown.map((charge) => charge.source)).toEqual([
      'strategy',
      'executionRules',
    ]);
  });
});

describe('ExchangeMarketSimulation costs and ledger adapter', () => {
  it('uses normalized lot quantity for price costs, turnover, commission and cash', () => {
    const planned = new ExchangeMarketSimulation().plan(
      input('CN', {
        order: order('CN', { quantity: '150' }),
        account: { settledCash: '1030', availableQuantity: '1000' },
      }),
    );
    expect(planned.status).toBe('filled');
    if (planned.status !== 'filled') return;
    expect(planned.fill.quantity).toBe('100');
    expect(planned.chargeBreakdown[0]).toMatchObject({ amount: '1.0201', currency: 'CNY' });
  });

  it('rejects a minimum commission whose Money currency conflicts with the execution rules', () => {
    const planned = new ExchangeMarketSimulation().plan(
      input('US', {
        costs: {
          version: 'strategy-cost-1',
          slippageRate: '0.01',
          commissionRate: '0.001',
          minimumCommission: { amount: '1', currency: 'HKD' },
        },
      }),
    );
    expect(planned).toMatchObject({ status: 'rejected', reject: { code: 'INVALID_COST' } });
  });

  it('adapts the fill and settlement directly to SimulationLedger events', () => {
    const planned = new ExchangeMarketSimulation().plan(input('US'));
    expect(planned.status).toBe('filled');
    if (planned.status !== 'filled') return;
    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: symbol.US,
        market: 'US',
        assetType: 'ETF',
        currency: 'USD',
      },
      baseCurrency: 'USD',
      initialCash: { USD: '100000' },
    });
    const appliedFill = ledger.applyEvent({ type: 'fill', payload: planned.ledgerFill });
    expect(appliedFill).toMatchObject({ applied: true });
    for (const settlement of planned.settlement.ledgerSettlements) {
      expect(ledger.applyEvent({ type: 'settlement', payload: settlement })).toMatchObject({
        applied: true,
      });
    }
    expect(ledger.snapshot().position.quantity).toBe(lotSize('US'));
    expect(ledger.snapshot().cash.USD.settled).not.toBe('100000');
    expect(ledger.applyEvent({ type: 'fill', payload: planned.ledgerFill })).toMatchObject({
      applied: false,
      code: 'DUPLICATE_EVENT',
    });
  });

  it('creates only cash settlement for a sell and resolves the US session clock', () => {
    const planned = new ExchangeMarketSimulation().plan(
      input('US', {
        order: order('US', { side: 'sell' }),
        account: { settledCash: '100000', availableQuantity: '1' },
      }),
    );
    expect(planned.status).toBe('filled');
    if (planned.status !== 'filled') return;
    expect(planned.settlement.ledgerSettlements).toHaveLength(1);
    expect(planned.settlement.ledgerSettlements[0]).toMatchObject({
      kind: 'cash',
      sourceEventId: planned.ledgerFill.eventId,
      availableAt: '2026-09-09T13:30:00.000Z',
    });

    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: symbol.US,
        market: 'US',
        assetType: 'ETF',
        currency: 'USD',
      },
      baseCurrency: 'USD',
      initialCash: { USD: '100000' },
    });
    expect(
      ledger.applyEvent({
        type: 'fill',
        payload: {
          eventId: 'seed-fill-event',
          fillId: 'seed-fill',
          executionSymbol: symbol.US,
          side: 'buy',
          quantity: '1',
          price: '1',
          charges: [],
          currency: 'USD',
          occurredAt: '2026-09-07T13:30:00.000Z',
          availableAt: '2026-09-07T13:30:00.000Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      ledger.applyEvent({
        type: 'settlement',
        payload: {
          eventId: 'seed-settlement',
          sourceEventId: 'seed-fill-event',
          kind: 'both',
          currency: 'USD',
          symbol: symbol.US,
          occurredAt: '2026-09-07T13:30:00.000Z',
          availableAt: '2026-09-07T13:30:00.000Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.applyEvent({ type: 'fill', payload: planned.ledgerFill })).toMatchObject({
      applied: true,
    });
    expect(
      ledger.applyEvent(
        { type: 'settlement', payload: planned.settlement.ledgerSettlements[0] },
        planned.settlement.ledgerSettlements[0].availableAt,
      ),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().position.quantity).toBe('0');
  });
});

describe('ExchangeMarketSimulation timing facts', () => {
  it('fills a close signal at the next trading day open', () => {
    const planned = new ExchangeMarketSimulation().plan(
      input('CN', {
        order: order('CN', {
          occurredAt: '2026-09-08T06:55:00.000Z',
          availableAt: '2026-09-08T06:55:00.000Z',
        }),
        bars: [
          {
            occurredAt: '2026-09-09T01:35:00.000Z',
            availableAt: '2026-09-09T01:35:00.000Z',
            openedAt: '2026-09-09T01:30:00.000Z',
            openAvailableAt: '2026-09-09T01:30:00.000Z',
            previousCloseAvailableAt: '2026-09-09T01:30:00.000Z',
            open: '10.00',
            previousClose: '9.90',
          },
        ],
      }),
    );
    expect(planned.status).toBe('filled');
    if (planned.status === 'filled') {
      expect(planned.fill.occurredAt).toBe('2026-09-09T01:30:00.000Z');
      expect(planned.settlement.tradingDate).toBe('2026-09-09');
    }
  });

  it('allows a completed Bar to arrive after its open when open facts were available', () => {
    const planned = new ExchangeMarketSimulation().plan(
      input('US', {
        bars: [
          {
            occurredAt: '2026-09-08T13:50:00.000Z',
            availableAt: '2026-09-08T13:50:00.000Z',
            openedAt: '2026-09-08T13:40:00.000Z',
            openAvailableAt: '2026-09-08T13:40:00.000Z',
            previousCloseAvailableAt: '2026-09-08T13:40:00.000Z',
            open: '10.00',
            previousClose: '9.90',
          },
        ],
      }),
    );
    expect(planned.status).toBe('filled');
    if (planned.status === 'filled') {
      expect(planned.fill.occurredAt).toBe('2026-09-08T13:40:00.000Z');
      expect(planned.fill.availableAt).toBe('2026-09-08T13:40:00.000Z');
    }
  });

  it('rejects a future previous-close fact and malformed order time with stable codes', () => {
    const futurePreviousClose = new ExchangeMarketSimulation().plan(
      input('US', {
        bars: [
          {
            occurredAt: '2026-09-08T13:50:00.000Z',
            availableAt: '2026-09-08T13:50:00.000Z',
            openedAt: '2026-09-08T13:40:00.000Z',
            openAvailableAt: '2026-09-08T13:40:00.000Z',
            previousCloseAvailableAt: '2026-09-08T13:41:00.000Z',
            open: '10.00',
            previousClose: '9.90',
          },
        ],
      }),
    );
    expect(futurePreviousClose).toMatchObject({
      status: 'rejected',
      reject: { code: 'FUTURE_DATA' },
    });
    const malformed = new ExchangeMarketSimulation().plan(
      input('US', {
        order: order('US', { occurredAt: 'not-a-time', availableAt: 'not-a-time' }),
      }),
    );
    expect(malformed).toMatchObject({
      status: 'rejected',
      reject: { code: 'RULE_REJECTED', reason: '输入时间事实无效' },
    });
  });

  it('rejects non-Market or non-DAY orders without carrying them to another day', () => {
    const simulation = new ExchangeMarketSimulation();
    expect(
      simulation.plan(input('US', { order: order('US', { orderType: 'Limit' }) })),
    ).toMatchObject({
      status: 'rejected',
      reject: { code: 'RULE_REJECTED' },
    });
    expect(
      simulation.plan(input('US', { order: order('US', { timeInForce: 'GTC' }) })),
    ).toMatchObject({
      status: 'rejected',
      reject: { code: 'RULE_REJECTED' },
    });
  });
});
