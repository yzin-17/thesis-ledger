import { describe, expect, it } from 'vitest';
import {
  normalizeSymbol,
  projectAverageCost,
  projectFifo,
  type LedgerEvent,
  projectCashBalance,
} from '../src/index.js';

const trades: LedgerEvent[] = [
  {
    id: '1',
    accountId: 'a',
    type: 'BUY',
    symbol: '600519.SH',
    quantity: 100,
    price: 10,
    fee: 5,
    occurredAt: '2025-01-01T00:00:00Z',
  },
  {
    id: '2',
    accountId: 'a',
    type: 'BUY',
    symbol: '600519.SH',
    quantity: 100,
    price: 20,
    fee: 5,
    occurredAt: '2025-01-02T00:00:00Z',
  },
  {
    id: '3',
    accountId: 'a',
    type: 'SELL',
    symbol: '600519.SH',
    quantity: 100,
    price: 30,
    fee: 5,
    tax: 3,
    occurredAt: '2025-01-03T00:00:00Z',
  },
];

describe('证券代码标准化', () => {
  it.each([
    ['600519', '600519.SH', 'stock'],
    ['SZ000001', '000001.SZ', 'stock'],
    ['510300.SH', '510300.SH', 'etf'],
    ['159919', '159919.SZ', 'etf'],
    ['830799', '830799.BJ', 'stock'],
  ])('%s → %s', (input, symbol, assetType) =>
    expect(normalizeSymbol(input)).toMatchObject({ symbol, assetType }),
  );
  it.each(['123', 'ABCDEF', '700000', '600519.HK'])('拒绝非法代码 %s', (input) =>
    expect(() => normalizeSymbol(input)).toThrow(),
  );
});

describe('Ledger 投影', () => {
  it('AVG 成本和已实现收益可重建', () =>
    expect(projectAverageCost(trades)[0]).toEqual({
      accountId: 'a',
      symbol: '600519.SH',
      quantity: 100,
      averageCost: 15.05,
      realizedPnl: 1487,
    }));
  it('FIFO 成本和已实现收益可重建', () =>
    expect(projectFifo(trades)[0]).toEqual({
      accountId: 'a',
      symbol: '600519.SH',
      quantity: 100,
      averageCost: 20.05,
      realizedPnl: 1987,
    }));
  it('拒绝超卖', () =>
    expect(() => projectAverageCost([{ ...trades[0]!, type: 'SELL' }])).toThrow('超过持仓'));
  it('公司行动保持总成本并调整数量', () => {
    const actions: LedgerEvent[] = [
      trades[0]!,
      {
        ...trades[0]!,
        id: 'bonus',
        type: 'BONUS',
        quantity: 10,
        occurredAt: '2025-01-02T00:00:00Z',
      },
      {
        ...trades[0]!,
        id: 'split',
        type: 'SPLIT',
        quantity: 2,
        occurredAt: '2025-01-03T00:00:00Z',
      },
      {
        ...trades[0]!,
        id: 'merge',
        type: 'MERGE',
        quantity: 2,
        occurredAt: '2025-01-04T00:00:00Z',
      },
    ];
    expect(projectAverageCost(actions)[0]).toMatchObject({
      quantity: 110,
      averageCost: 9.1364,
    });
    expect(projectFifo(actions)[0]).toMatchObject({ quantity: 110, averageCost: 9.1364 });
  });
  it('开仓与回滚通过受控 Adjustment 重建持仓', () => {
    const events: LedgerEvent[] = [
      {
        id: 'opening',
        accountId: 'a',
        type: 'ADJUSTMENT',
        symbol: '600519.SH',
        quantity: 100,
        price: 12,
        correctionOf: 'draft',
        occurredAt: '2025-01-01T00:00:00Z',
        metadata: { kind: 'opening-balance', quantity: 100, costPrice: 12 },
      },
      {
        id: 'rollback',
        accountId: 'a',
        type: 'ADJUSTMENT',
        symbol: '600519.SH',
        quantity: 80,
        price: 10,
        correctionOf: 'opening',
        occurredAt: '2025-01-02T00:00:00Z',
        metadata: { kind: 'rollback', quantity: 80, costPrice: 10 },
      },
    ];
    expect(projectAverageCost(events)[0]).toMatchObject({ quantity: 80, averageCost: 10 });
    expect(projectFifo(events)[0]).toMatchObject({ quantity: 80, averageCost: 10 });
  });
  it('从 Ledger 重建现金余额并区分买卖费用', () =>
    expect(
      projectCashBalance([
        {
          id: 'deposit',
          accountId: 'a',
          type: 'CASH_DEPOSIT',
          amount: 1000,
          occurredAt: '2025-01-01T00:00:00Z',
        },
        { ...trades[0]!, accountId: 'a' },
        { ...trades[2]!, accountId: 'a' },
      ]).get('a'),
    ).toBe(2987));
});
