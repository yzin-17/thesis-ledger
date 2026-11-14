import { describe, expect, it } from 'vitest';
import { computeSizing, type SizingInput } from '../src/backtest-sizing.js';

const input = (researchPrice = '8'): SizingInput => ({
  rule: { type: 'fixedQuantity', quantity: '100' },
  accountingBasis: 'normalized-series',
  normalizedExecution: {
    priceCoordinate: 'continuous-decimal',
    quantityUnits: 'continuous-normalized-decimal',
    lotSizeConstraint: 'not-applied',
    tickSizeConstraint: 'not-applied',
    dailyPriceLimit: 'not-applied',
    feeBasis: 'simulatedTurnover',
  },
  executionCurrency: 'CNY',
  currentQuantity: '0',
  evaluationAt: '2026-01-05T01:30:00Z',
  price: {
    value: researchPrice,
    occurredAt: '2026-01-05T01:30:00Z',
    availableAt: '2026-01-05T01:30:00Z',
  },
  priceResearchReference: {
    protocolVersion: 'price-research-v1',
    actualPrice: {
      value: '4',
      occurredAt: '2026-01-05T01:30:00Z',
      availableAt: '2026-01-05T01:30:00Z',
    },
  },
});

describe('参考份数的研究投入', () => {
  it('100 份以原价 4 确定 400 元投入，后复权价 8 对应 50 研究单位', () => {
    expect(computeSizing(input())).toMatchObject({
      status: 'available',
      normalizedQuantity: '50',
      inputFacts: expect.arrayContaining(['research.requestedNotional=400']),
    });
  });
  it('后复权价格缩放时保持投入与持仓研究价值不变', () => {
    expect(computeSizing(input('80'))).toMatchObject({
      status: 'available',
      normalizedQuantity: '5',
    });
  });
  it('保持旧归一化固定数量的拒绝行为', () => {
    const old = input();
    delete old.priceResearchReference;
    expect(computeSizing(old)).toMatchObject({
      status: 'rejected',
      reasonCode: 'UNSUPPORTED_UNIT',
    });
  });
  it('拒绝缺失、错位、晚到和无效的参考价', () => {
    const missing = input();
    delete missing.priceResearchReference!.actualPrice;
    expect(computeSizing(missing)).toMatchObject({
      status: 'unavailable',
      reasonCode: 'PRICE_UNAVAILABLE',
    });
    const wrong = input();
    wrong.priceResearchReference!.actualPrice!.occurredAt = '2026-01-06T01:30:00Z';
    expect(computeSizing(wrong)).toMatchObject({
      status: 'unavailable',
      reasonCode: 'PRICE_UNAVAILABLE',
    });
    const late = input();
    late.priceResearchReference!.actualPrice!.availableAt = '2026-01-06T01:30:00Z';
    expect(computeSizing(late)).toMatchObject({ status: 'unavailable', reasonCode: 'FUTURE_DATA' });
    const invalid = input();
    invalid.priceResearchReference!.actualPrice!.value = '0';
    expect(computeSizing(invalid)).toMatchObject({
      status: 'rejected',
      reasonCode: 'INVALID_DECIMAL',
    });
  });
});
