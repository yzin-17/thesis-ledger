import { describe, expect, it } from 'vitest';
import { DecimalValue } from '../src/decimal.js';
import { fitNormalizedQuantityToAvailableCash } from '../src/backtest-normalized-budget.js';

describe('normalized quantity cash fitting', () => {
  it('retains an affordable requested quantity without changing its representation', () => {
    const result = fitNormalizedQuantityToAvailableCash('1.25', () => ({
      status: 'affordable',
      value: 'reserved',
    }));

    expect(result).toEqual({ status: 'available', quantity: '1.25', value: 'reserved' });
  });

  it('finds the greatest affordable amount on the existing 40-decimal boundary', () => {
    const limit = '1.2345678901234567890123456789012345678901';
    const result = fitNormalizedQuantityToAvailableCash('2', (quantity) =>
      DecimalValue.from(quantity).compareTo(limit) <= 0
        ? { status: 'affordable', value: quantity }
        : { status: 'insufficient-cash' },
    );

    expect(result).toEqual({ status: 'available', quantity: limit, value: limit });
  });

  it('stops when affordability cannot be evaluated and reports when no positive unit fits', () => {
    expect(
      fitNormalizedQuantityToAvailableCash('2', () => ({
        status: 'unavailable',
        reason: 'EXCHANGE_PLAN_REJECTED',
      })),
    ).toEqual({ status: 'unavailable', reason: 'EXCHANGE_PLAN_REJECTED' });
    expect(
      fitNormalizedQuantityToAvailableCash('0.00000000000000000000000000000000000000001', () => ({
        status: 'insufficient-cash',
      })),
    ).toEqual({ status: 'unavailable', reason: 'INSUFFICIENT_CASH' });
  });
});
