import { describe, expect, it } from 'vitest';
import { computeSizing, type SizingInput } from '../src/backtest-sizing.js';

const evaluationAt = '2026-09-08T10:00:00.000Z';
const price = (value = '10') => ({
  value,
  occurredAt: '2026-09-08T09:59:00.000Z',
  availableAt: '2026-09-08T09:59:30.000Z',
});
const equity = (amount = '10000', currency: 'CNY' | 'HKD' | 'USD' = 'CNY') => ({
  amount,
  currency,
  occurredAt: '2026-09-08T09:58:00.000Z',
  availableAt: '2026-09-08T09:58:30.000Z',
});

const input = (rule: SizingInput['rule'], overrides: Partial<SizingInput> = {}): SizingInput => ({
  rule,
  executionCurrency: 'CNY',
  lotSize: '100',
  currentQuantity: '0',
  evaluationAt,
  price: price(),
  equity: equity(),
  ...overrides,
});

describe('computeSizing', () => {
  it('uses Decimal formulas for all four sizing rules', () => {
    const fixedAmount = computeSizing(input({ type: 'fixedAmount', amount: '1050' }));
    const percent = computeSizing(input({ type: 'percentOfEquity', percent: '0.5' }));
    const fixedQuantity = computeSizing(input({ type: 'fixedQuantity', quantity: '250' }));
    const targetWeight = computeSizing(input({ type: 'targetWeight', weight: '0.5' }));

    expect(fixedAmount).toMatchObject({
      side: 'buy',
      requestedQuantity: '105',
      normalizedQuantity: '100',
    });
    expect(percent).toMatchObject({
      side: 'buy',
      requestedQuantity: '500',
      normalizedQuantity: '500',
    });
    expect(fixedQuantity).toMatchObject({
      side: 'buy',
      requestedQuantity: '250',
      normalizedQuantity: '200',
    });
    expect(targetWeight).toMatchObject({
      side: 'buy',
      requestedQuantity: '500',
      normalizedQuantity: '500',
      targetQuantity: '500',
    });
  });

  it('uses target quantity delta for buy, sell, and no-op', () => {
    const buy = computeSizing(
      input({ type: 'targetWeight', weight: '0.5' }, { currentQuantity: '100' }),
    );
    const sell = computeSizing(
      input({ type: 'targetWeight', weight: '0.5' }, { currentQuantity: '600' }),
    );
    const none = computeSizing(
      input({ type: 'targetWeight', weight: '0.5' }, { currentQuantity: '500' }),
    );

    expect(buy).toMatchObject({ side: 'buy', requestedQuantity: '400', normalizedQuantity: '400' });
    expect(sell).toMatchObject({
      side: 'sell',
      requestedQuantity: '100',
      normalizedQuantity: '100',
    });
    expect(none).toMatchObject({ side: 'none', requestedQuantity: '0', normalizedQuantity: '0' });
  });

  it.each([
    ['CN', '100', '777', '700'],
    ['HK', '500', '777', '500'],
    ['US', '1', '777', '777'],
  ] as const)(
    'normalizes %s quantities down to the market lot',
    (market, lotSize, quantity, normalized) => {
      const result = computeSizing(
        input(
          { type: 'fixedQuantity', quantity },
          { lotSize, executionCurrency: market === 'CN' ? 'CNY' : market === 'HK' ? 'HKD' : 'USD' },
        ),
      );

      expect(result).toMatchObject({ normalizedQuantity: normalized });
    },
  );

  it('rejects zero and insufficient quantities at runtime', () => {
    const zero = computeSizing(input({ type: 'fixedQuantity', quantity: '0' }));
    const insufficient = computeSizing(input({ type: 'fixedQuantity', quantity: '50' }));

    expect(zero).toMatchObject({ status: 'rejected', reasonCode: 'INVALID_PARAMETER' });
    expect(insufficient).toMatchObject({ status: 'rejected', reasonCode: 'QUANTITY_BELOW_LOT' });
  });

  it('converts direct and inverse FX using only consumed facts', () => {
    const direct = computeSizing(
      input(
        { type: 'percentOfEquity', percent: '0.5' },
        {
          executionCurrency: 'CNY',
          equity: equity('1000', 'USD'),
          fx: {
            fromCurrency: 'USD',
            toCurrency: 'CNY',
            rate: '7',
            occurredAt: '2026-09-08T09:57:00.000Z',
            availableAt: '2026-09-08T09:57:30.000Z',
          },
        },
      ),
    );
    const inverse = computeSizing(
      input(
        { type: 'percentOfEquity', percent: '0.5' },
        {
          executionCurrency: 'USD',
          equity: equity('80000', 'CNY'),
          fx: {
            fromCurrency: 'CNY',
            toCurrency: 'USD',
            rate: '0.125',
            occurredAt: '2026-09-08T09:57:00.000Z',
            availableAt: '2026-09-08T09:57:30.000Z',
          },
        },
      ),
    );

    expect(direct).toMatchObject({ normalizedQuantity: '300' });
    expect(inverse).toMatchObject({ normalizedQuantity: '500' });
    expect((direct as { availableAt: string }).availableAt).toBe('2026-09-08T09:59:30.000Z');
    expect((direct as { inputFacts: string[] }).inputFacts).toEqual(
      expect.arrayContaining(['fx.availableAt=2026-09-08T09:57:30.000Z']),
    );
  });

  it('returns explicit unavailable or rejected facts for bad timing and availability', () => {
    const unavailable = computeSizing(
      input(
        { type: 'fixedAmount', amount: '1000' },
        { price: { ...price(), status: 'unavailable', reason: 'provider-down' } },
      ),
    );
    const future = computeSizing(
      input(
        { type: 'fixedAmount', amount: '1000' },
        { price: { ...price(), availableAt: '2026-09-08T10:01:00.000Z' } },
      ),
    );
    const invalidOrder = computeSizing(
      input(
        { type: 'fixedAmount', amount: '1000' },
        { price: { ...price(), availableAt: '2026-09-08T09:58:00.000Z' } },
      ),
    );
    const extraFutureFx = computeSizing(
      input(
        { type: 'fixedAmount', amount: '1000' },
        {
          fx: {
            fromCurrency: 'USD',
            toCurrency: 'CNY',
            rate: '7',
            occurredAt: '2026-09-08T10:01:00.000Z',
            availableAt: '2026-09-08T10:01:00.000Z',
          },
        },
      ),
    );

    expect(unavailable).toMatchObject({ status: 'unavailable', reasonCode: 'PRICE_UNAVAILABLE' });
    expect(future).toMatchObject({ status: 'unavailable', reasonCode: 'FUTURE_DATA' });
    expect(invalidOrder).toMatchObject({ status: 'rejected', reasonCode: 'INVALID_TIME' });
    expect(extraFutureFx).toMatchObject({ status: 'available', normalizedQuantity: '100' });
  });

  it('classifies stale or mismatched FX explicitly', () => {
    const stale = computeSizing(
      input(
        { type: 'percentOfEquity', percent: '0.5' },
        {
          equity: equity('1000', 'USD'),
          fx: {
            fromCurrency: 'USD',
            toCurrency: 'CNY',
            rate: '7',
            occurredAt: '2026-09-08T09:57:00.000Z',
            availableAt: '2026-09-08T09:57:30.000Z',
            status: 'stale',
          },
        },
      ),
    );
    const mismatch = computeSizing(
      input(
        { type: 'percentOfEquity', percent: '0.5' },
        {
          equity: equity('1000', 'USD'),
          fx: {
            fromCurrency: 'HKD',
            toCurrency: 'CNY',
            rate: '7',
            occurredAt: '2026-09-08T09:57:00.000Z',
            availableAt: '2026-09-08T09:57:30.000Z',
          },
        },
      ),
    );

    expect(stale).toMatchObject({ status: 'unavailable', reasonCode: 'FX_STALE' });
    expect(mismatch).toMatchObject({ status: 'rejected', reasonCode: 'CURRENCY_MISMATCH' });
  });
});
