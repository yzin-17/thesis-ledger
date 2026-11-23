import { describe, expect, it } from 'vitest';
import { arenaDecisionPlanLines } from '../src/arena-live-plan-display.js';
import type {
  ArenaPaperAccount,
  ArenaPaperDecision,
  ArenaPaperOrder,
} from '../src/arena-live-types.js';

function order(overrides: Partial<ArenaPaperOrder> = {}): ArenaPaperOrder {
  return {
    id: 'order-id',
    clientId: 'entry',
    symbol: 'TOPT.US',
    side: 'buy',
    kind: 'limit',
    quantity: '300',
    price: '34',
    expiresOn: null,
    exitGroup: null,
    createdAt: '2026-11-15T00:00:00Z',
    activeSince: '2026-11-15T00:00:00Z',
    expiresAt: '2026-11-16T21:00:00Z',
    state: 'active',
    reservedCash: '10200',
    reason: null,
    ...overrides,
  };
}
function account(orders: ArenaPaperOrder[]): ArenaPaperAccount {
  return {
    revision: 0,
    cash: '20000',
    positions: [],
    cashSettlements: [],
    orders,
    wakeups: [],
    watchedSymbols: [],
    fills: [],
  };
}
const protection = { activation: 'on_each_fill' as const, activateOrders: [] };
const cases: Array<{ label: string; book: ArenaPaperAccount | undefined; expected: string }> = [
  {
    label: '账户不可用时保留原委托标识',
    book: undefined,
    expected: '撤销委托 order-id：撤销该委托尚未成交的余量。',
  },
  {
    label: '账户没有对应委托时保留原标识',
    book: account([order({ id: 'other-id' })]),
    expected: '撤销委托 order-id：撤销该委托尚未成交的余量。',
  },
  {
    label: '普通委托只撤销未成交余量',
    book: account([order()]),
    expected: '撤销委托 entry：撤销该委托尚未成交的余量。',
  },
  {
    label: '父委托撤销余量时保留已激活保护',
    book: account([order({ onFill: protection })]),
    expected: '撤销委托 entry：撤销入场余量；已激活的按量保护保留，未激活保护结束。',
  },
  {
    label: '撤销保护子单时说明余仓失去保护',
    book: account([
      order({ clientId: 'stop', parentOrderId: 'parent-id', side: 'sell', kind: 'stop_loss' }),
    ]),
    expected: '撤销委托 stop：撤销本条保护；已持有余仓失去该单保护，入场余量继续有效。',
  },
];

describe('竞技场撤单计划回读', () => {
  it.each(cases)('$label', ({ book, expected }) => {
    const decision: ArenaPaperDecision = {
      summary: '摘要不作为执行配置',
      orders: [],
      cancelOrderIds: ['order-id'],
      watchedSymbols: [],
      wakeups: [],
    };
    const original = structuredClone({ decision, book });
    expect(arenaDecisionPlanLines(decision, undefined, book)).toEqual([
      '自动卖出委托 0 张（含待激活保护）',
      expected,
    ]);
    expect({ decision, book }).toEqual(original);
  });

  it('撤单顺序和新委托回读顺序保持，名称解析只用于新委托', () => {
    const decision: ArenaPaperDecision = {
      summary: '独立样本',
      orders: [
        {
          clientId: 'buy',
          symbol: 'TOPT.US',
          side: 'buy',
          kind: 'limit',
          quantity: '20',
          price: '33',
          expiresOn: '2026-11-16',
          exitGroup: null,
        },
      ],
      cancelOrderIds: ['second-id', 'order-id'],
      watchedSymbols: [],
      wakeups: [],
    };
    const book = account([
      order(),
      order({ id: 'second-id', clientId: 'second-entry', onFill: protection }),
    ]);
    expect(arenaDecisionPlanLines(decision, (symbol) => `受控标的 ${symbol}`, book)).toEqual([
      '自动卖出委托 0 张（含待激活保护）',
      '撤销委托 second-entry：撤销入场余量；已激活的按量保护保留，未激活保护结束。',
      '撤销委托 entry：撤销该委托尚未成交的余量。',
      '受控标的 TOPT.US · 买入 20 股 · 限价 33 · 有效至2026-11-16 收盘。',
    ]);
  });
});
