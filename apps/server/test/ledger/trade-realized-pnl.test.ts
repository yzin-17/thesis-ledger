import { describe, expect, it } from 'vitest';
import { summarizeTradeRealizedPnl } from '../../src/ledger/trade-realized-pnl.js';

const slice = (overrides: Record<string, unknown> = {}) => ({
  currency: 'CNY',
  quantity: '2',
  netRealizedPnl: '4',
  costEstimated: false,
  allocations: [{ originalCost: '20', allocatedBuyCharges: [] }],
  ...overrides,
});

describe('Trade 已实现盈亏聚合', () => {
  it('无卖出记录时返回真实零值，并区分收益率无分母', () => {
    expect(summarizeTradeRealizedPnl([])).toEqual({
      hasClosedTrades: false,
      complete: true,
      missingCurrencies: [],
      pnl: [],
      cost: [],
    });
  });

  it('聚合部分卖出、全部卖出和多次卖出的 Close Slice', () => {
    const result = summarizeTradeRealizedPnl([
      slice(),
      slice({
        quantity: '3',
        netRealizedPnl: '-5',
        allocations: [
          {
            originalCost: '30',
            allocatedBuyCharges: [{ category: 'COMMISSION', amount: '1', currency: 'CNY' }],
          },
        ],
      }),
    ]);

    expect(result).toEqual({
      hasClosedTrades: true,
      complete: true,
      missingCurrencies: [],
      pnl: [{ currency: 'CNY', amount: -1 }],
      cost: [{ currency: 'CNY', amount: 51 }],
    });
  });

  it('成本或净实现盈亏不可确认时不生成可用的组合结果', () => {
    const result = summarizeTradeRealizedPnl([
      slice(),
      slice({
        netRealizedPnl: null,
        allocations: [{ originalCost: null, allocatedBuyCharges: [] }],
      }),
    ]);

    expect(result.complete).toBe(false);
    expect(result.missingCurrencies).toEqual(['CNY']);
    expect(result.pnl).toEqual([{ currency: 'CNY', amount: 4 }]);
  });

  it('费用币种不一致时保持不可用，不把异币费用混入收益', () => {
    const result = summarizeTradeRealizedPnl([
      slice({
        allocations: [
          {
            originalCost: '20',
            allocatedBuyCharges: [{ category: 'LEVY', amount: '1', currency: 'HKD' }],
          },
        ],
      }),
    ]);

    expect(result.complete).toBe(false);
    expect(result.pnl).toEqual([]);
    expect(result.cost).toEqual([]);
  });

  it('领域标记为估算成本时保持不可用', () => {
    const result = summarizeTradeRealizedPnl([slice({ costEstimated: true })]);

    expect(result.complete).toBe(false);
    expect(result.pnl).toEqual([]);
    expect(result.cost).toEqual([]);
  });
});
