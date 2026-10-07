import { describe, expect, it } from 'vitest';
import {
  ExchangeMarketSimulation,
  SimulationLedger,
  type ExchangeMarketSimulationInput,
} from '../src/index.js';
import { currency, symbol, openAt, lotSize, order, input } from './backtest-exchange.fixtures.js';

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
    expect(first.ledgerFill.cashReservationId).toBe('order-1:cash-reservation');
    expect(first.cashReservation).toMatchObject({ currency: currency[market] });
    if (market === 'US') expect(first.chargeBreakdown[0]?.amount).toBe('1');
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

  it.each(['0', '1'])('rejects insufficient cash with stable facts at %s', (settledCash) => {
    const cash = new ExchangeMarketSimulation().plan(
      input('US', { account: { settledCash, availableQuantity: '1' } }),
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

  it('applies slippage adversely by side and rounds fees only under an explicit policy', () => {
    const exact = new ExchangeMarketSimulation().plan(
      input('US', {
        costs: {
          version: 'strategy-cost-1',
          slippageRate: '0',
          commissionRate: '0.001',
        },
      }),
    );
    const buy = new ExchangeMarketSimulation().plan(
      input('US', {
        costs: {
          version: 'strategy-cost-1',
          slippageRate: '0.01',
          commissionRate: '0.001',
          feeRounding: { mode: 'halfUp', decimalPlaces: 2 },
        },
      }),
    );
    const sell = new ExchangeMarketSimulation().plan(
      input('US', {
        order: order('US', { side: 'sell' }),
        costs: {
          version: 'strategy-cost-1',
          slippageRate: '0.01',
          commissionRate: '0.001',
          feeRounding: { mode: 'halfUp', decimalPlaces: 2 },
        },
      }),
    );

    expect(exact.status).toBe('filled');
    expect(buy.status).toBe('filled');
    expect(sell.status).toBe('filled');
    if (exact.status !== 'filled' || buy.status !== 'filled' || sell.status !== 'filled') return;
    expect(exact.fill.charges[0]?.amount).toBe('0.0101');
    expect(buy.fill.price).toBe('10.201');
    expect(buy.fill.charges[0]).toMatchObject({ amount: '0.01', currency: 'USD' });
    expect(sell.fill.price).toBe('9.999');
    expect(sell.fill.charges[0]).toMatchObject({ amount: '0.01', currency: 'USD' });
  });

  it('rejects unrecognized fixed-per-trade fee models instead of ignoring them', () => {
    const costs = {
      version: 'strategy-cost-1',
      slippageRate: '0',
      commissionRate: '0',
      fixedCommission: { amount: '1', currency: 'USD' },
    } as ExchangeMarketSimulationInput['costs'];
    const planned = new ExchangeMarketSimulation().plan(input('US', { costs }));

    expect(planned).toMatchObject({ status: 'rejected', reject: { code: 'INVALID_COST' } });
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
        assetType: 'etf',
        currency: 'USD',
      },
      baseCurrency: 'USD',
      initialCash: { USD: '100000' },
    });
    expect(planned.cashReservation).toBeDefined();
    if (planned.cashReservation) {
      expect(
        ledger.reserveCash(
          planned.cashReservation.reservationId,
          planned.cashReservation.currency,
          planned.cashReservation.amount,
        ),
      ).toMatchObject({ accepted: true });
    }
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
        assetType: 'etf',
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
    const settlement = planned.settlement.ledgerSettlements[0];
    if (!settlement) throw new Error('fixture 缺少结算事件');
    expect(
      ledger.applyEvent({ type: 'settlement', payload: settlement }, settlement.availableAt),
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

describe('SimulationLedger cash reuse', () => {
  it('makes sell proceeds available only after settlement and releases an unused reservation', () => {
    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: symbol.US,
        market: 'US',
        assetType: 'etf',
        currency: 'USD',
      },
      baseCurrency: 'USD',
      initialCash: { USD: '100' },
    });
    expect(
      ledger.applyFill({
        eventId: 'reuse-buy',
        fillId: 'reuse-buy',
        executionSymbol: symbol.US,
        side: 'buy',
        quantity: '5',
        price: '10',
        charges: [{ amount: '1', currency: 'USD' }],
        currency: 'USD',
        occurredAt: '2026-09-07T13:30:00.000Z',
        availableAt: '2026-09-07T13:30:00.000Z',
      }),
    ).toMatchObject({ applied: true });
    expect(
      ledger.applySettlement({
        eventId: 'reuse-buy-settlement',
        sourceEventId: 'reuse-buy',
        kind: 'both',
        currency: 'USD',
        symbol: symbol.US,
        occurredAt: '2026-09-07T13:30:00.000Z',
        availableAt: '2026-09-07T13:30:00.000Z',
      }),
    ).toMatchObject({ applied: true });
    expect(
      ledger.applyFill({
        eventId: 'reuse-sell',
        fillId: 'reuse-sell',
        executionSymbol: symbol.US,
        side: 'sell',
        quantity: '5',
        price: '12',
        charges: [{ amount: '0.2', currency: 'USD' }],
        currency: 'USD',
        occurredAt: '2026-09-08T13:30:00.000Z',
        availableAt: '2026-09-08T13:30:00.000Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.availableCash('USD')).toBe('49');
    expect(
      ledger.applySettlement({
        eventId: 'reuse-sell-settlement',
        sourceEventId: 'reuse-sell',
        kind: 'cash',
        currency: 'USD',
        symbol: symbol.US,
        occurredAt: '2026-09-09T13:30:00.000Z',
        availableAt: '2026-09-09T13:30:00.000Z',
      }),
    ).toMatchObject({ applied: true });

    expect(ledger.availableCash('USD')).toBe('108.8');
    expect(ledger.reserveCash('next-order', 'USD', '100')).toMatchObject({ accepted: true });
    expect(ledger.availableCash('USD')).toBe('8.8');
    expect(ledger.releaseCash('next-order')).toBe(true);
    expect(ledger.availableCash('USD')).toBe('108.8');
  });
});
