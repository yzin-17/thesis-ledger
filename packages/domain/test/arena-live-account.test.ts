import { expect, it } from 'vitest';
import { arenaAccountNav, arenaAvailableCash, arenaAvailableShares, arenaDueWakeups, arenaPositionTotals } from '../src/arena-live-account.js';
import type { ArenaPaperAccount, ArenaPaperOrder, ArenaPaperWakeup } from '../src/arena-live-types.js';

const at = '2026-11-12T02:00:00.000Z';
it('持仓展示按标的汇总精确数量，保留分批可卖日期并保持原始份额不变', () => {
  const positions = [
    { symbol: 'A.US', quantity: '0.000000000000000001', acquiredOn: '2026-11-11', availableOn: '2026-11-13' },
    { symbol: 'A.US', quantity: '100000000000000000', acquiredOn: '2026-11-10', availableOn: '2026-11-12' },
  ];
  expect(arenaPositionTotals({ positions })).toEqual([{ symbol: 'A.US', quantity: '100000000000000000.000000000000000001', availableOn: ['2026-11-12', '2026-11-13'] }]);
  expect(positions[0]?.quantity).toBe('0.000000000000000001');
});
const order = (patch: Partial<ArenaPaperOrder> = {}): ArenaPaperOrder => ({
  id: 'order', clientId: 'client', symbol: '600036.SH', side: 'buy', kind: 'limit',
  quantity: '100', price: '40', expiresOn: null, exitGroup: null,
  createdAt: at, activeSince: at, expiresAt: '2026-11-12T07:00:00Z', state: 'active', reservedCash: '4005', reason: null,
  ...patch,
});
const account = (patch: Partial<ArenaPaperAccount> = {}): ArenaPaperAccount => ({
  revision: 1, cash: '10000.000000000000000001', positions: [], cashSettlements: [],
  orders: [order()], wakeups: [], watchedSymbols: [], fills: [], ...patch,
});
it('挂单冻结资金影响可用现金，不能降低净值或丢失十进制精度', () => {
  expect(arenaAvailableCash(account(), '2026-11-12')).toBe('5995.000000000000000001');
  expect(arenaAccountNav(account(), new Map())).toBe('10000.000000000000000001');
  expect(arenaAvailableCash(account({ cashSettlements: [{ amount: '100', availableOn: '2026-11-13' }] }), '2026-11-12'))
    .toBe('5895.000000000000000001');
});
it('未结算持仓不能卖出，成对退出只预留一次数量', () => {
  const a = account({ positions: [
    { symbol: '600036.SH', quantity: '300', acquiredOn: '2026-11-11', availableOn: '2026-11-12' },
    { symbol: '600036.SH', quantity: '100', acquiredOn: '2026-11-12', availableOn: '2026-11-13' },
  ], orders: [
    order({ side: 'sell', kind: 'stop_loss', exitGroup: 'exit', reservedCash: '0' }),
    order({ id: 'paired', side: 'sell', kind: 'take_profit', exitGroup: 'exit', reservedCash: '0' }),
  ] });
  expect(arenaAvailableShares(a, '600036.SH', '2026-11-12')).toBe('200');
  expect(arenaAccountNav(a, new Map())).toBeNull();
  expect(arenaAccountNav(a, new Map([['600036.SH', '40']]))).toBe('26000.000000000000000001');
});
const wake = (condition: ArenaPaperWakeup['condition'], id = 'wake'): ArenaPaperWakeup => ({
  id, condition, createdAt: at, firedAt: null,
});
it('事件预约可以长期休眠，不产生固定周期研究', () => {
  const w = [wake({ kind: 'price', symbol: '600036.SH', operator: 'gte', price: '42' })];
  expect(arenaDueWakeups(w, [], [], '2027-01-01T00:00:00Z')).toEqual([]);
  expect(arenaDueWakeups([wake({ kind: 'fill', symbol: null })], [], [], '2027-01-01T00:00:00Z')).toEqual([]);
});
it('只使用预约后的真实观察；已消费预约不会再次触发', () => {
  const w = wake({ kind: 'price', symbol: '600036.SH', operator: 'lte', price: '38' });
  const quote = { symbol: '600036.SH', price: '37', marketTime: '2026-11-12T01:59:59Z', observedAt: at };
  const now = '2026-11-12T03:00:00Z';
  expect(arenaDueWakeups([w], [quote], [], now)).toEqual([]);
  quote.marketTime = '2026-11-12T02:01:00Z';
  quote.observedAt = '2026-11-12T02:01:01Z';
  expect(arenaDueWakeups([w], [quote], [], now)).toEqual(['wake']);
  expect(arenaDueWakeups([{ ...w, firedAt: now }], [quote], [], now)).toEqual([]);
});
it('成交事件仅唤醒已订阅的模型，时间预约使用实际时间比较', () => {
  const fill = { symbol: '600036.SH', recordedAt: '2026-11-12T02:10:00Z' };
  const ws = [wake({ kind: 'time', at: '2026-11-12T04:00:00Z' }, 'time'), wake({ kind: 'fill', symbol: '600036.SH' }, 'fill')];
  expect(arenaDueWakeups(ws, [], [fill], '2026-11-12T03:00:00Z')).toEqual(['fill']);
  expect(arenaDueWakeups(ws, [], [], '2026-11-12T04:00:00.000Z')).toEqual(['time']);
});
