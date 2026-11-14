import { expect, it } from 'vitest';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import { arenaMatchOrders } from '../src/arena-live-match-orders.js';
import { arenaAvailableCash, arenaAccountNav } from '../src/arena-live-account.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision, ArenaPaperQuote } from '../src/arena-live-types.js';

const created = '2026-11-12T02:00:00Z';
const observed = '2026-11-12T02:01:00Z';
const empty = (): ArenaPaperAccount => ({ revision: 0, cash: '10000', positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] });
const quote = (patch: Partial<ArenaPaperQuote> = {}): ArenaPaperQuote => ({
  symbol: '600036.SH', price: '10', marketTime: '2026-11-12T01:59:59Z', observedAt: created,
  sourceRef: 'controlled-quote', evidence: { fixture: true }, tradingDate: '2026-11-12', positionAvailableOn: '2026-11-13', cashAvailableOn: '2026-11-12',
  lot: '100', tick: '0.01', buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0', ...patch,
});
let sequence = 0;
const context = (patch: Partial<ArenaPaperContext> = {}): ArenaPaperContext => ({
  at: created, tradingDate: '2026-11-12', fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
  maxPositionBps: 10000, maxActiveSymbols: 50, allowedSymbols: new Set(['600036.SH']), quotes: [quote()],
  expiresAt: () => '2026-11-12T07:00:00Z', newId: () => String(++sequence), ...patch,
});
const decision = (): ArenaPaperDecision => ({
  summary: '限价等待', cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol: '600036.SH' }],
  orders: [{ clientId: 'buy', symbol: '600036.SH', side: 'buy', kind: 'limit', quantity: '100', price: '10', expiresOn: null, exitGroup: null }],
});
const tick = (price: string, patch: Partial<ArenaPaperQuote> = {}) => context({
  at: observed, quotes: [quote({ price, marketTime: observed, observedAt: observed, ...patch })],
});
it('统一提交预留资金并保持原账户不变，过时版本拒绝整次提交', () => {
  const original = empty();
  const book = arenaSubmitDecision(original, 0, decision(), context());
  expect(arenaAvailableCash(book, '2026-11-12')).toBe('9000');
  expect(arenaAccountNav(book, new Map())).toBe('10000');
  expect(original.orders).toEqual([]);
  expect(() => arenaSubmitDecision(book, 0, decision(), context())).toThrow('account_conflict');
});
it('一次提交任一指令失败不留下资金预留，取消委托后额度可重用', () => {
  const original = empty(), d = decision();
  d.orders.push({ ...d.orders[0]!, clientId: 'large', quantity: '10000' });
  expect(() => arenaSubmitDecision(original, 0, d, context())).toThrow('insufficient_cash');
  expect(original.orders).toEqual([]);
  const booked = arenaSubmitDecision(original, 0, decision(), context());
  const cancel = { ...decision(), orders: [], cancelOrderIds: [booked.orders[0]!.id] };
  const cancelled = arenaSubmitDecision(booked, 1, cancel, context());
  expect(arenaAvailableCash(cancelled, '2026-11-12')).toBe('10000');
});
it('只观察实际采样，旧报价和限价之外的价格均不成交；重复处理不重复扣款', () => {
  const booked = arenaSubmitDecision(empty(), 0, decision(), context());
  expect(arenaMatchOrders(booked, context(), true).fills).toEqual([]);
  expect(arenaMatchOrders(booked, tick('11'), true).fills).toEqual([]);
  const filled = arenaMatchOrders(booked, tick('9.5'), true);
  expect(filled.cash).toBe('9050');
  expect(filled.fills[0]?.price).toBe('9.5');
  expect(filled.positions[0]?.availableOn).toBe('2026-11-13');
  expect(arenaMatchOrders(filled, tick('9'), true)).toEqual(filled);
});
it('滑点不突破限价，市场单跳空资金不足时拒绝并释放额度', () => {
  const booked = arenaSubmitDecision(empty(), 0, decision(), context());
  const slipped = tick('10'); slipped.fees.slippageBps = 1;
  expect(arenaMatchOrders(booked, slipped, true).fills).toEqual([]);
  const d = decision(); d.orders[0]!.kind = 'market'; d.orders[0]!.price = null;
  const market = arenaSubmitDecision(empty(), 0, d, context());
  const rejected = arenaMatchOrders(market, tick('200'), true);
  expect(rejected.fills).toEqual([]);
  expect(rejected.orders[0]?.state).toBe('rejected');
  expect(arenaAvailableCash(rejected, '2026-11-12')).toBe('10000');
});
it('止损跳空按观察价格成交，成对止盈撤销且不重复卖出', () => {
  const original = empty();
  original.positions.push({ symbol: '600036.SH', quantity: '100', acquiredOn: '2026-11-11', availableOn: '2026-11-12' });
  const d = decision();
  d.orders = [
    { ...d.orders[0]!, clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '9', exitGroup: 'exit' },
    { ...d.orders[0]!, clientId: 'take', side: 'sell', kind: 'take_profit', price: '12', exitGroup: 'exit' },
  ];
  const booked = arenaSubmitDecision(original, 0, d, context());
  const filled = arenaMatchOrders(booked, tick('8'), true);
  expect(filled.fills).toHaveLength(1);
  expect(filled.fills[0]?.price).toBe('8');
  expect(filled.positions).toEqual([]);
  expect(filled.orders.map((o) => o.state)).toEqual(['filled', 'cancelled']);
});
it('暂停不成交也不取消委托，恢复不使用暂停期间的报价', () => {
  const booked = arenaSubmitDecision(empty(), 0, decision(), context());
  expect(arenaMatchOrders(booked, tick('9'), false)).toBe(booked);
  booked.orders[0]!.activeSince = '2026-11-12T02:02:00Z';
  const resumed = tick('9'); resumed.at = '2026-11-12T02:03:00Z';
  expect(arenaMatchOrders(booked, resumed, true).fills).toEqual([]);
  resumed.quotes = [quote({ price: '9', marketTime: resumed.at, observedAt: resumed.at })];
  expect(arenaMatchOrders(booked, resumed, true).fills).toHaveLength(1);
});
it('未结算数量、交易单位、过期与越界标的均受独立约束', () => {
  const original = empty();
  original.positions.push({ symbol: '600036.SH', quantity: '100', acquiredOn: '2026-11-12', availableOn: '2026-11-13' });
  const sell = decision(); sell.orders[0]!.side = 'sell';
  expect(() => arenaSubmitDecision(original, 0, sell, context())).toThrow('insufficient_position');
  const fractional = decision(); fractional.orders[0]!.quantity = '1';
  expect(() => arenaSubmitDecision(empty(), 0, fractional, context())).toThrow('invalid_quantity');
  expect(() => arenaSubmitDecision(empty(), 0, decision(), context({ allowedSymbols: new Set() }))).toThrow('symbol_outside_universe');
  const booked = arenaSubmitDecision(empty(), 0, decision(), context());
  const expired = arenaMatchOrders(booked, context({ at: '2026-11-12T07:00:01Z' }), true);
  expect(expired.orders[0]?.state).toBe('expired');
  expect(arenaAvailableCash(expired, '2026-11-12')).toBe('10000');
});
