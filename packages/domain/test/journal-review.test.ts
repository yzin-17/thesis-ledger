import { describe, expect, it } from 'vitest';
import { projectCompletedTrades, type LedgerEvent } from '../src/index.js';

const events: LedgerEvent[] = [
  {
    id: 'buy-1',
    accountId: 'account',
    type: 'BUY',
    symbol: '600519.SH',
    quantity: 100,
    price: 10,
    fee: 5,
    occurredAt: '2025-01-01T09:30:00.000Z',
  },
  {
    id: 'buy-2',
    accountId: 'account',
    type: 'BUY',
    symbol: '600519.SH',
    quantity: 100,
    price: 20,
    fee: 5,
    occurredAt: '2025-01-02T09:30:00.000Z',
  },
  {
    id: 'sell-1',
    accountId: 'account',
    type: 'SELL',
    symbol: '600519.SH',
    quantity: 100,
    price: 30,
    fee: 5,
    tax: 3,
    occurredAt: '2025-01-03T09:30:00.000Z',
  },
];

describe('已平仓交易生命周期投影', () => {
  it('按平均成本生成已平仓候选并保留实际事实', () => {
    expect(projectCompletedTrades(events, 'AVG')).toEqual([
      expect.objectContaining({
        accountId: 'account',
        symbol: '600519.SH',
        quantity: 100,
        entryAt: '2025-01-01T09:30:00.000Z',
        exitAt: '2025-01-03T09:30:00.000Z',
        entryPrice: 15,
        exitPrice: 30,
        actualExit: 30,
        pnl: 1487,
        turnover: 4500,
        entryEventIds: ['buy-1', 'buy-2'],
        exitEventIds: ['sell-1'],
      }),
    ]);
  });

  it('按 FIFO 生成候选并使用实际匹配的买入批次', () => {
    expect(projectCompletedTrades(events, 'FIFO')[0]).toMatchObject({
      quantity: 100,
      entryPrice: 10,
      pnl: 1987,
      entryEventIds: ['buy-1'],
    });
  });

  it('支持部分平仓并在超卖时拒绝不一致流水', () => {
    expect(
      projectCompletedTrades([events[0]!, { ...events[2]!, id: 'sell-partial', quantity: 40 }])[0],
    ).toMatchObject({ quantity: 40, exitEventIds: ['sell-partial'] });
    expect(() => projectCompletedTrades([{ ...events[2]!, quantity: 101 }])).toThrow(
      '卖出数量超过持仓',
    );
  });

  it.each(['AVG', 'FIFO'] as const)('quantity=0 的持仓校正会切断旧 lot（%s）', (method) => {
    const resetEvents: LedgerEvent[] = [
      {
        id: 'old-buy',
        accountId: 'account',
        type: 'BUY',
        symbol: '600519.SH',
        quantity: 100,
        price: 10,
        occurredAt: '2025-01-01T09:30:00.000Z',
      },
      {
        id: 'manual-clear',
        accountId: 'account',
        type: 'ADJUSTMENT',
        symbol: '600519.SH',
        occurredAt: '2025-01-02T09:30:00.000Z',
        metadata: { kind: 'position-balance', quantity: 0, costPrice: 10 },
      },
      {
        id: 'new-buy',
        accountId: 'account',
        type: 'BUY',
        symbol: '600519.SH',
        quantity: 20,
        price: 30,
        occurredAt: '2025-01-03T09:30:00.000Z',
      },
      {
        id: 'new-sell',
        accountId: 'account',
        type: 'SELL',
        symbol: '600519.SH',
        quantity: 20,
        price: 35,
        occurredAt: '2025-01-04T09:30:00.000Z',
      },
    ];

    expect(projectCompletedTrades(resetEvents, method)).toEqual([
      expect.objectContaining({
        entryAt: '2025-01-03T09:30:00.000Z',
        entryEventIds: ['new-buy'],
        exitEventIds: ['new-sell'],
        quantity: 20,
        entryPrice: 30,
        pnl: 100,
      }),
    ]);
  });
});
