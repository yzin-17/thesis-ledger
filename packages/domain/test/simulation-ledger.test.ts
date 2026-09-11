import { describe, expect, it } from 'vitest';
import {
  SimulationLedger,
  SimulationLedgerError,
  replaySimulationLedger,
  valueSimulationLedger,
  type SimulationLedgerConfig,
} from '../src/index.js';

const config: SimulationLedgerConfig = {
  executionInstrument: {
    symbol: 'AAPL.US',
    market: 'US',
    assetType: 'stock',
    currency: 'USD',
  },
  baseCurrency: 'CNY',
  initialCash: { CNY: '1000', USD: '100' },
};

const buy = (eventId = 'fill-buy-1') => ({
  eventId,
  fillId: eventId,
  executionSymbol: 'AAPL.US',
  side: 'buy' as const,
  quantity: '5',
  price: '10',
  charges: [{ amount: '1', currency: 'USD' as const }],
  currency: 'USD' as const,
  occurredAt: '2026-09-08T14:00:00Z',
  availableAt: '2026-09-08T14:00:00Z',
});

describe('SimulationLedger', () => {
  it('keeps cash and position in settled/unsettled buckets with no external cash flow', () => {
    const ledger = new SimulationLedger(config);
    const first = ledger.applyFill(buy());
    expect(first).toMatchObject({
      applied: true,
      state: { cash: { USD: { settled: '100', unsettled: '-51' } } },
    });
    expect(ledger.availableCash('USD')).toBe('49');
    expect(ledger.snapshot().position).toMatchObject({
      quantity: '5',
      settledQuantity: '0',
      unsettledQuantity: '5',
      averageCost: '10.2',
    });

    expect(ledger.applyFill({ ...buy('fill-buy-2'), quantity: '5' })).toMatchObject({
      applied: false,
      code: 'INSUFFICIENT_CASH',
    });
    expect(
      ledger.applyEvent({
        type: 'settlement',
        payload: {
          eventId: 'settle-buy-1',
          sourceEventId: 'fill-buy-1',
          currency: 'USD',
          symbol: 'AAPL.US',
          occurredAt: '2026-09-10T14:00:00Z',
          availableAt: '2026-09-10T14:00:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().cash.USD).toEqual({ currency: 'USD', settled: '49', unsettled: '0' });
    expect(ledger.snapshot().position.settledQuantity).toBe('5');

    const sell = ledger.applyFill({
      eventId: 'fill-sell-1',
      fillId: 'fill-sell-1',
      executionSymbol: 'AAPL.US',
      side: 'sell',
      quantity: '2',
      price: '12',
      charges: [{ amount: '0.2', currency: 'USD' }],
      currency: 'USD',
      occurredAt: '2026-09-11T14:00:00Z',
      availableAt: '2026-09-11T14:00:00Z',
    });
    expect(sell).toMatchObject({ applied: true, realizedPnl: '3.4' });
    expect(ledger.snapshot().cash.USD).toMatchObject({ settled: '49', unsettled: '23.8' });
    expect(ledger.snapshot().position).toMatchObject({ quantity: '3', settledQuantity: '3' });
    expect(
      ledger.applySettlement({
        eventId: 'settle-sell-1',
        sourceEventId: 'fill-sell-1',
        currency: 'USD',
        occurredAt: '2026-09-12T14:00:00Z',
        availableAt: '2026-09-12T14:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().cash.USD).toMatchObject({ settled: '72.8', unsettled: '0' });
  });

  it('uses the requested gross amount for amount-based fills with fractional units', () => {
    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: 'FUND.CN',
        market: 'CN',
        assetType: 'fund',
        currency: 'CNY',
      },
      baseCurrency: 'CNY',
      initialCash: { CNY: '1000' },
    });
    expect(ledger.reserveCash('nav-1:cash-reservation', 'CNY', '12.12')).toMatchObject({
      accepted: true,
    });
    expect(
      ledger.applyFill({
        eventId: 'nav-1:fill',
        fillId: 'nav-1:fill',
        executionSymbol: 'FUND.CN',
        side: 'buy',
        quantity: '0.9230769230769230769230769230769230769231',
        price: '13',
        cashDebit: '12',
        charges: [{ amount: '0.12', currency: 'CNY' }],
        currency: 'CNY',
        occurredAt: '2026-09-08T01:30:00Z',
        availableAt: '2026-09-08T01:30:00Z',
        cashReservationId: 'nav-1:cash-reservation',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().cash.CNY).toMatchObject({ settled: '1000', unsettled: '-12.12' });
    expect(
      ledger.applySettlement({
        eventId: 'nav-1:settlement',
        sourceEventId: 'nav-1:fill',
        kind: 'both',
        symbol: 'FUND.CN',
        currency: 'CNY',
        occurredAt: '2026-09-09T01:30:00Z',
        availableAt: '2026-09-09T01:30:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().cash.CNY).toMatchObject({ settled: '987.88', unsettled: '0' });
  });

  it('rejects another instrument, wrong currency and future events without creating FX orders', () => {
    const ledger = new SimulationLedger({ ...config, initialCash: { CNY: '1000' } });
    expect(ledger.applyFill({ ...buy(), executionSymbol: 'MSFT.US' })).toMatchObject({
      applied: false,
      code: 'INSTRUMENT_MISMATCH',
    });
    expect(ledger.applyFill({ ...buy(), currency: 'CNY' })).toMatchObject({
      applied: false,
      code: 'CURRENCY_MISMATCH',
    });
    expect(ledger.applyFill(buy())).toMatchObject({ applied: false, code: 'INSUFFICIENT_CASH' });
    expect(
      ledger.applyFill({
        ...buy('negative-charge-fill'),
        charges: [{ amount: '-1', currency: 'USD' }],
      }),
    ).toMatchObject({ applied: false, code: 'INVALID_AMOUNT' });
    expect(ledger.snapshot().cash).toMatchObject({ CNY: { settled: '1000', unsettled: '0' } });
    expect(
      ledger.applyFill({
        ...buy('direct-future-fill'),
        occurredAt: '2026-09-08T14:00:00Z',
        availableAt: '2026-09-09T14:00:00Z',
      }),
    ).toMatchObject({ applied: false, code: 'FUTURE_DATA' });
    expect(
      ledger.applyFill({
        ...buy('invalid-time-fill'),
        occurredAt: 'not-a-time',
        availableAt: 'not-a-time',
      }),
    ).toMatchObject({ applied: false, code: 'INVALID_TIME' });
    expect(
      ledger.applyEvent(
        { type: 'fill', payload: { ...buy('future-fill'), availableAt: '2026-09-09T14:00:00Z' } },
        '2026-09-08T14:00:00Z',
      ),
    ).toMatchObject({ applied: false, code: 'FUTURE_DATA' });
  });

  it('settles only the referenced fill or dividend when settlement dates interleave', () => {
    const ledger = new SimulationLedger(config);
    expect(ledger.applyFill(buy('fill-day-1'))).toMatchObject({ applied: true });
    expect(ledger.applyFill({ ...buy('fill-day-2'), quantity: '1' })).toMatchObject({
      applied: true,
    });
    expect(
      ledger.applySettlement({
        eventId: 'settle-day-1',
        sourceEventId: 'fill-day-1',
        kind: 'both',
        currency: 'USD',
        occurredAt: '2026-09-09T14:00:00Z',
        availableAt: '2026-09-09T14:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().position).toMatchObject({
      settledQuantity: '5',
      unsettledQuantity: '1',
    });
    expect(ledger.snapshot().cash.USD).toMatchObject({ settled: '49', unsettled: '-11' });

    expect(
      ledger.applyCashDividend({
        eventId: 'dividend-day-1',
        executionSymbol: 'AAPL.US',
        amountPerShare: '1',
        currency: 'USD',
        occurredAt: '2026-09-09T15:00:00Z',
        availableAt: '2026-09-09T15:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(
      ledger.applySettlement({
        eventId: 'settle-dividend-day-1',
        sourceEventId: 'dividend-day-1',
        kind: 'cash',
        currency: 'USD',
        occurredAt: '2026-09-10T14:00:00Z',
        availableAt: '2026-09-10T14:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().cash.USD).toMatchObject({ settled: '54', unsettled: '-11' });
    expect(ledger.snapshot().position).toMatchObject({
      settledQuantity: '5',
      unsettledQuantity: '1',
    });

    expect(
      ledger.applySettlement({
        eventId: 'settle-day-2',
        sourceEventId: 'fill-day-2',
        kind: 'both',
        currency: 'USD',
        occurredAt: '2026-09-11T14:00:00Z',
        availableAt: '2026-09-11T14:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().position).toMatchObject({
      settledQuantity: '6',
      unsettledQuantity: '0',
    });
    expect(ledger.snapshot().cash.USD).toMatchObject({ settled: '43', unsettled: '0' });
  });

  it('applies dividends and splits once and can replay the same event sequence deterministically', () => {
    const events = [
      { type: 'fill' as const, payload: buy() },
      {
        type: 'settlement' as const,
        payload: {
          eventId: 'settle-1',
          sourceEventId: 'fill-buy-1',
          currency: 'USD' as const,
          occurredAt: '2026-09-10T14:00:00Z',
          availableAt: '2026-09-10T14:00:00Z',
        },
      },
      {
        type: 'cashDividend' as const,
        payload: {
          eventId: 'dividend-1',
          executionSymbol: 'AAPL.US',
          amountPerShare: '1',
          currency: 'USD' as const,
          occurredAt: '2026-09-11T14:00:00Z',
          availableAt: '2026-09-11T14:00:00Z',
        },
      },
      {
        type: 'split' as const,
        payload: {
          eventId: 'split-1',
          executionSymbol: 'AAPL.US',
          ratio: '2',
          occurredAt: '2026-09-12T14:00:00Z',
          availableAt: '2026-09-12T14:00:00Z',
        },
      },
    ];
    const first = replaySimulationLedger(config, events);
    const second = replaySimulationLedger(config, events);
    expect(first.state).toEqual(second.state);
    expect(first.state.position).toMatchObject({ quantity: '10', averageCost: '5.1' });
    expect(first.state.cash.USD).toMatchObject({ settled: '49', unsettled: '5' });
    expect(Number(first.state.position.quantity) * Number(first.state.position.averageCost)).toBe(
      51,
    );

    const beforeSplit = replaySimulationLedger(config, events.slice(0, 3));
    const valuationInput = {
      valuationAt: '2026-09-13T00:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '16:00',
        pricePolicy: 'latestAvailable' as const,
        fxPolicy: 'latestAvailable' as const,
      },
      fxRates: [
        {
          fromCurrency: 'USD' as const,
          toCurrency: 'CNY' as const,
          rate: '7',
          occurredAt: '2026-09-12T20:00:00Z',
          availableAt: '2026-09-12T20:01:00Z',
          provider: 'fixture',
          providerRevision: 'fx-split',
        },
      ],
    };
    const beforeMarketValue = valueSimulationLedger(beforeSplit.state, {
      ...valuationInput,
      prices: [
        {
          symbol: 'AAPL.US',
          market: 'US',
          assetType: 'stock',
          currency: 'USD',
          price: '10',
          occurredAt: '2026-09-12T20:00:00Z',
          availableAt: '2026-09-12T20:01:00Z',
        },
      ],
    });
    const afterMarketValue = valueSimulationLedger(first.state, {
      ...valuationInput,
      prices: [
        {
          symbol: 'AAPL.US',
          market: 'US',
          assetType: 'stock',
          currency: 'USD',
          price: '5',
          occurredAt: '2026-09-12T20:00:00Z',
          availableAt: '2026-09-12T20:01:00Z',
        },
      ],
    });
    expect(beforeMarketValue.originalCurrency.USD.total).toBe('104');
    expect(afterMarketValue.originalCurrency.USD.total).toBe('104');
    expect(beforeMarketValue.baseCurrencyValue).toBe(afterMarketValue.baseCurrencyValue);
    const duplicate = first.ledger.applyEvent(events[2]);
    expect(duplicate).toMatchObject({ applied: false, code: 'DUPLICATE_EVENT' });
  });

  it('preserves HKD cash and position conservation independently from other currencies', () => {
    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: '0700.HK',
        market: 'HK',
        assetType: 'stock',
        currency: 'HKD',
      },
      baseCurrency: 'CNY',
      initialCash: { HKD: '100' },
    });
    expect(
      ledger.applyFill({
        eventId: 'hkd-buy',
        fillId: 'hkd-buy',
        executionSymbol: '0700.HK',
        side: 'buy',
        quantity: '2',
        price: '10',
        charges: [{ amount: '1', currency: 'HKD' }],
        currency: 'HKD',
        occurredAt: '2026-09-08T02:00:00Z',
        availableAt: '2026-09-08T02:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot().cash).toMatchObject({
      HKD: { settled: '100', unsettled: '-21' },
      CNY: { settled: '0', unsettled: '0' },
      USD: { settled: '0', unsettled: '0' },
    });
    expect(
      ledger.applySettlement({
        eventId: 'hkd-settlement',
        sourceEventId: 'hkd-buy',
        kind: 'both',
        currency: 'HKD',
        occurredAt: '2026-09-09T02:00:00Z',
        availableAt: '2026-09-09T02:00:00Z',
      }),
    ).toMatchObject({ applied: true });
    expect(ledger.snapshot()).toMatchObject({
      cash: { HKD: { settled: '79', unsettled: '0' } },
      position: { quantity: '2', settledQuantity: '2', unsettledQuantity: '0' },
    });
  });

  it('rejects negative initial cash at construction', () => {
    expect(() => new SimulationLedger({ ...config, initialCash: { USD: '-1' } })).toThrow(
      SimulationLedgerError,
    );
  });
});

describe('valueSimulationLedger', () => {
  it('values original currencies first and converts only point-in-time FX', () => {
    const ledger = new SimulationLedger(config);
    ledger.applyFill(buy());
    ledger.applySettlement({
      eventId: 'settle-valuation',
      sourceEventId: 'fill-buy-1',
      currency: 'USD',
      occurredAt: '2026-09-10T14:00:00Z',
      availableAt: '2026-09-10T14:00:00Z',
    });
    const result = valueSimulationLedger(ledger.snapshot(), {
      valuationAt: '2026-09-12T00:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '16:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      prices: [
        {
          symbol: 'AAPL.US',
          market: 'US',
          assetType: 'stock',
          currency: 'USD',
          price: '10',
          occurredAt: '2026-09-11T20:00:00Z',
          availableAt: '2026-09-11T20:01:00Z',
        },
      ],
      fxRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: '7',
          occurredAt: '2026-09-11T20:00:00Z',
          availableAt: '2026-09-11T20:02:00Z',
          provider: 'fixture',
          providerRevision: 'fx-1',
        },
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: '6',
          occurredAt: '2026-09-10T20:00:00Z',
          availableAt: '2026-09-11T20:00:00Z',
          provider: 'fixture',
          providerRevision: 'fx-older-occurrence',
        },
      ],
    });
    expect(result).toMatchObject({ status: 'available', baseCurrencyValue: '1693' });
    expect(result.originalCurrency.USD).toMatchObject({ cash: '49', position: '50', total: '99' });
    expect(result.fx[0]).toMatchObject({ status: 'used', rate: '7' });
  });

  it('keeps original currency values and reports partial when FX is missing, stale, or future', () => {
    const ledger = new SimulationLedger(config);
    ledger.applyFill(buy());
    const result = valueSimulationLedger(ledger.snapshot(), {
      valuationAt: '2026-09-08T15:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '16:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      prices: [
        {
          symbol: 'AAPL.US',
          market: 'US',
          assetType: 'stock',
          currency: 'USD',
          price: '11',
          occurredAt: '2026-09-08T14:00:00Z',
          availableAt: '2026-09-09T14:00:00Z',
        },
      ],
      fxRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: '7',
          occurredAt: '2026-09-08T14:00:00Z',
          availableAt: '2026-09-09T14:00:00Z',
          provider: 'fixture',
          providerRevision: 'fx-future',
        },
      ],
    });
    expect(result.status).toBe('partial');
    expect(result.baseCurrencyValue).toBe('1000');
    expect(result.originalCurrency.USD.status).toBe('partial');
    expect(result.unavailableReasons).toContain('USD:PRICE_UNAVAILABLE');
    const staleFx = valueSimulationLedger(ledger.snapshot(), {
      valuationAt: '2026-09-08T15:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '16:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      prices: [],
      fxRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: '7',
          occurredAt: '2026-09-08T14:00:00Z',
          availableAt: '2026-09-08T14:01:00Z',
          provider: 'fixture',
          providerRevision: 'fx-stale',
          stale: true,
        },
      ],
    });
    expect(staleFx.status).toBe('partial');
    expect(staleFx.fx).toContainEqual(
      expect.objectContaining({ status: 'unavailable', reason: 'FX_STALE' }),
    );
    expect(staleFx.unavailableReasons).toContain('USD:FX_STALE');
    expect(
      valueSimulationLedger(ledger.snapshot(), {
        valuationAt: 'not-a-time',
        policy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '16:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
        prices: [],
        fxRates: [],
      }),
    ).toMatchObject({ status: 'unavailable', unavailableReasons: ['VALUATION_TIME_INVALID'] });
    const invalidPrice = valueSimulationLedger(ledger.snapshot(), {
      valuationAt: '2026-09-08T15:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '16:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      prices: [
        {
          symbol: 'AAPL.US',
          market: 'US',
          assetType: 'stock',
          currency: 'USD',
          price: 'not-a-decimal',
          occurredAt: '2026-09-08T14:00:00Z',
          availableAt: '2026-09-08T14:00:00Z',
        },
      ],
      fxRates: [],
    });
    expect(invalidPrice.unavailableReasons).toContain('USD:PRICE_INVALID');
    const invalidFx = valueSimulationLedger(ledger.snapshot(), {
      valuationAt: '2026-09-08T15:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '16:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      prices: [
        {
          symbol: 'AAPL.US',
          market: 'US',
          assetType: 'stock',
          currency: 'USD',
          price: '11',
          occurredAt: '2026-09-08T14:00:00Z',
          availableAt: '2026-09-08T14:00:00Z',
        },
      ],
      fxRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: '7',
          occurredAt: 'not-a-time',
          availableAt: '2026-09-08T14:00:00Z',
          provider: 'fixture',
          providerRevision: 'fx-invalid',
        },
      ],
    });
    expect(invalidFx.unavailableReasons).toContain('USD:FX_INVALID');
  });
});
