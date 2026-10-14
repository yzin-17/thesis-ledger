import { describe, expect, it } from 'vitest';
import { SimulationLedger } from '../src/simulation-ledger.js';
import { simulationCashDividendAmount } from '../src/simulation-cash-dividend-entitlement.js';

const instrument = {
  symbol: '510300.SH',
  market: 'CN',
  assetType: 'etf',
  currency: 'CNY',
} as const;
const now = '2025-06-18T01:30:00Z';
function ledger() {
  return new SimulationLedger({
    executionInstrument: instrument,
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000' },
    accountingBasis: 'raw-events',
  });
}
describe('明确登记资格沿用原现金账本', () => {
  it('legacy显式冻结资格0原样执行，仅验证旧版本重放，不代表新业务规则', () => {
    const value = ledger();
    value.applyFill({
      eventId: 'record-buy',
      fillId: 'record-buy',
      executionSymbol: instrument.symbol,
      side: 'buy',
      quantity: '100',
      price: '4',
      currency: 'CNY',
      charges: [],
      occurredAt: '2025-06-17T01:30:00Z',
      availableAt: '2025-06-17T01:30:00Z',
    });
    value.applySettlement({
      eventId: 'buy-settle',
      sourceEventId: 'record-buy',
      occurredAt: now,
      availableAt: now,
    });
    expect(value.snapshot().position.settledQuantity).toBe('100');
    expect(
      value.applyCashDividend({
        eventId: 'div',
        executionSymbol: instrument.symbol,
        amountPerShare: '0.088',
        eligibleQuantity: '0',
        currency: 'CNY',
        occurredAt: now,
        availableAt: now,
      }).applied,
    ).toBe(true);
    expect(value.snapshot().cash.CNY.unsettled).toBe('0');
  });
  it('登记持仓已卖出也保留100份资格及8.8应收，原调用默认行为保持', () => {
    const value = ledger();
    expect(
      value.applyCashDividend({
        eventId: 'div',
        executionSymbol: instrument.symbol,
        amountPerShare: '0.088',
        eligibleQuantity: '100',
        currency: 'CNY',
        occurredAt: now,
        availableAt: now,
      }).applied,
    ).toBe(true);
    expect(value.snapshot().cash.CNY.unsettled).toBe('8.8');
    expect(simulationCashDividendAmount({ amountPerShare: '0.088' }, '100')).toMatchObject({
      valid: true,
    });
  });
  it.each(['-1', 'invalid'])('非法资格%s不生成金额', (eligibleQuantity) => {
    expect(
      simulationCashDividendAmount({ amountPerShare: '0.088', eligibleQuantity }, '100').valid,
    ).toBe(false);
  });
});
