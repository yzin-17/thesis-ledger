import { describe, expect, it } from 'vitest';
import {
  normalizedSeriesEquity,
  normalizedSeriesPositionValue,
  shouldApplySimulationCorporateAction,
} from '../src/backtest-normalized-accounting.js';
import { SimulationLedger } from '../src/simulation-ledger.js';
import { valueSimulationLedger } from '../src/simulation-valuation.js';

const instrument = {
  symbol: 'TEST.CN',
  market: 'CN' as const,
  assetType: 'stock' as const,
  currency: 'CNY' as const,
};

const createLedger = (accountingBasis: 'raw-events' | 'normalized-series', initialCash = '200') =>
  new SimulationLedger({
    executionInstrument: instrument,
    baseCurrency: 'CNY',
    initialCash: { CNY: initialCash },
    accountingBasis,
  });

const buy = (ledger: SimulationLedger, quantity: string, price: string) =>
  ledger.applyFill({
    eventId: `fill-${quantity}-${price}`,
    fillId: `fill-${quantity}-${price}`,
    executionSymbol: instrument.symbol,
    side: 'buy',
    quantity,
    price,
    charges: [],
    currency: 'CNY',
    occurredAt: '2025-01-01T00:00:00Z',
    availableAt: '2025-01-01T00:00:00Z',
  });

const settle = (ledger: SimulationLedger, sourceEventId: string) =>
  ledger.applySettlement({
    eventId: `settlement-${sourceEventId}`,
    sourceEventId,
    kind: 'both',
    currency: 'CNY',
    occurredAt: '2025-01-01T00:00:00Z',
    availableAt: '2025-01-01T00:00:00Z',
  });

const valueAt = (ledger: SimulationLedger, price: string) =>
  valueSimulationLedger(ledger.snapshot(), {
    valuationAt: '2025-01-04T00:00:00Z',
    policy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '16:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    prices: [
      {
        ...instrument,
        price,
        occurredAt: '2025-01-03T00:00:00Z',
        availableAt: '2025-01-03T00:00:00Z',
      },
    ],
    fxRates: [],
  });

describe('normalized-series accounting policy', () => {
  it('uses decimal values for fractional normalized units and rejects invalid valuations', () => {
    expect(normalizedSeriesPositionValue('0.25', '14.2')).toBe('3.55');
    expect(normalizedSeriesEquity('80.5', '0.25', '14.2')).toBe('84.05');
    expect(() => normalizedSeriesPositionValue('-0.25', '14.2')).toThrow();
    expect(() => normalizedSeriesPositionValue('0.25', '0')).toThrow();
  });

  it('applies company actions only in raw-event accounting', () => {
    expect(shouldApplySimulationCorporateAction('raw-events')).toBe(true);
    expect(shouldApplySimulationCorporateAction('normalized-series')).toBe(false);
  });

  it('retains exact decimal conservation across raw, qfq, and hfq split coordinates', () => {
    const raw = createLedger('raw-events');
    expect(buy(raw, '100', '2')).toMatchObject({ applied: true });
    expect(
      raw.applyEvent({
        type: 'split',
        payload: {
          eventId: 'raw-split',
          executionSymbol: instrument.symbol,
          ratio: '2',
          occurredAt: '2025-01-02T00:00:00Z',
          availableAt: '2025-01-02T00:00:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    const qfq = createLedger('normalized-series');
    expect(buy(qfq, '200', '1')).toMatchObject({ applied: true });
    const hfq = createLedger('normalized-series');
    expect(buy(hfq, '100', '2')).toMatchObject({ applied: true });

    expect(raw.snapshot().position.quantity).toBe('200');
    expect(qfq.snapshot().position.quantity).toBe('200');
    expect(hfq.snapshot().position.quantity).toBe('100');
    expect(valueAt(raw, '1').originalCurrency.CNY.total).toBe('200');
    expect(valueAt(qfq, '1').originalCurrency.CNY.total).toBe('200');
    expect(valueAt(hfq, '2').originalCurrency.CNY.total).toBe('200');
  });

  it('keeps the raw dividend in cash and does not inject it into normalized cash', () => {
    const raw = createLedger('raw-events');
    expect(buy(raw, '2', '100')).toMatchObject({ applied: true });
    expect(settle(raw, 'fill-2-100')).toMatchObject({ applied: true });
    expect(
      raw.applyEvent({
        type: 'cashDividend',
        payload: {
          eventId: 'raw-dividend',
          executionSymbol: instrument.symbol,
          amountPerShare: '10',
          currency: 'CNY',
          occurredAt: '2025-01-02T00:00:00Z',
          availableAt: '2025-01-02T00:00:00Z',
        },
      }),
    ).toMatchObject({ applied: true });

    const normalized = createLedger('normalized-series');
    expect(buy(normalized, '2', '100')).toMatchObject({ applied: true });
    expect(settle(normalized, 'fill-2-100')).toMatchObject({ applied: true });
    expect(
      normalized.applyEvent({
        type: 'cashDividend',
        payload: {
          eventId: 'normalized-dividend',
          executionSymbol: instrument.symbol,
          amountPerShare: '10',
          currency: 'CNY',
          occurredAt: '2025-01-02T00:00:00Z',
          availableAt: '2025-01-02T00:00:00Z',
        },
      }),
    ).toMatchObject({ applied: false, code: 'CORPORATE_ACTION_IGNORED' });

    expect(valueAt(raw, '90').originalCurrency.CNY).toMatchObject({
      cash: '20',
      position: '180',
      total: '200',
    });
    expect(valueAt(normalized, '100').originalCurrency.CNY).toMatchObject({
      cash: '0',
      position: '200',
      total: '200',
    });
  });
});
