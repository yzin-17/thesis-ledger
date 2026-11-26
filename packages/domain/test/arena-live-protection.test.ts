import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import { arenaExpireOrders, arenaMatchOrders } from '../src/arena-live-match-orders.js';
import { arenaAvailableShares, arenaDueWakeups } from '../src/arena-live-account.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision } from '../src/arena-live-types.js';

const day = '2026-11-13';
const at = (minute: number) => `2026-11-13T15:${String(minute).padStart(2, '0')}:00.000Z`;
const empty = (): ArenaPaperAccount => ({ revision: 0, cash: '100000', positions: [], orders: [], fills: [], wakeups: [], watchedSymbols: [], cashSettlements: [] });
const context = (minute = 0, price = '360', patch: Partial<ArenaPaperContext> = {}): ArenaPaperContext => ({
  at: at(minute), tradingDate: day, maxPositionBps: 10000, maxActiveSymbols: 50,
  fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, allowedSymbols: new Set(['AAPL.US']),
  expiresAt: (date) => (date ?? day) + 'T21:00:00.000Z', newId: randomUUID,
  quotes: [{ symbol: 'AAPL.US', price, marketTime: at(minute), observedAt: at(minute), sourceRef: 'fixture', evidence: {},
    tradingDate: day, positionAvailableOn: day, cashAvailableOn: day, lot: '1', tick: '0.01', buyBlocked: null,
    sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }], ...patch,
});
const decision = (): ArenaPaperDecision => ({ summary: '独立模拟样本', orders: [{
  clientId: 'entry', side: 'buy', symbol: 'AAPL.US', kind: 'limit', price: '359.50', quantity: '27', expiresOn: day, exitGroup: null,
  onFill: { activation: 'on_full_fill', activateOrders: [{ clientId: 'protect', side: 'sell', kind: 'stop_loss', price: '355',
    quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'activation_session_close' } }] },
}], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'time', at: '2026-11-16T15:00:00Z' }] });
const submit = (book = empty(), d = decision()) => arenaSubmitDecision(book, book.revision, d, context());

describe('父单整笔成交保护', () => {
  it('空仓保存父子且只留入场资金；跌穿时先买入，下一份行情才可退出', () => {
    const pending = submit();
    expect(pending.orders.map((o) => o.state)).toEqual(['active', 'waiting_parent']);
    expect(pending.orders.map((o) => o.reservedCash)).toEqual(['9706.5', '0']);
    expect(pending.fills).toEqual([]);
    const entered = arenaMatchOrders(pending, context(1, '354'), true);
    expect(entered.fills.map((f) => f.side)).toEqual(['buy']);
    expect(entered.orders[1]).toMatchObject({ state: 'active', quantity: '27', parentOrderId: entered.orders[0]!.id, activeSince: at(1) });
    expect(arenaMatchOrders(entered, context(1, '354'), true)).toEqual(entered);
    const exited = arenaMatchOrders(entered, context(2, '350'), true);
    expect(exited.fills.map((f) => [f.side, f.quantity, f.price])).toEqual([['buy', '27', '354'], ['sell', '27', '350']]);
    expect(exited.positions).toEqual([]);
    expect(arenaMatchOrders(exited, context(3, '349'), true)).toEqual(exited);
  });
  it('父单没有成交时，取消、到期或拒绝均终止子单', () => {
    const pending = submit();
    const cancel = { ...decision(), orders: [], cancelOrderIds: [pending.orders[0]!.id] };
    expect(arenaSubmitDecision(pending, pending.revision, cancel, context()).orders.map((o) => o.state)).toEqual(['cancelled', 'cancelled']);
    const expired = arenaExpireOrders(pending, day + 'T21:00:00Z');
    expect(expired.orders.map((o) => o.state)).toEqual(['expired', 'cancelled']);
    expect(expired.fills).toEqual([]);
    const d = decision(); d.orders[0]!.kind = 'market'; d.orders[0]!.price = null; d.orders[0]!.expiresOn = null;
    const rejected = arenaMatchOrders(submit(empty(), d), context(1, '99999'), true);
    expect(rejected.orders.map((o) => o.state)).toEqual(['rejected', 'cancelled']);
  });
  it('原有50股和其他同标的成交不计入本次保护；交收前不能借老仓退出', () => {
    const original = empty(); original.positions.push({ symbol: 'AAPL.US', quantity: '50', acquiredOn: '2026-11-12', availableOn: day });
    const d = decision(); d.orders[0]!.onFill!.activateOrders[0]!.validUntil = { kind: 'date', expiresOn: '2026-11-16' };
    const pending = submit(original, d);
    expect(arenaAvailableShares(pending, 'AAPL.US', day)).toBe('50');
    const c = context(1, '359'); c.quotes[0]!.positionAvailableOn = '2026-11-16';
    const entered = arenaMatchOrders(pending, c, true);
    expect(arenaAvailableShares(entered, 'AAPL.US', day)).toBe('50');
    expect(arenaMatchOrders(entered, context(2, '354'), true).fills).toHaveLength(1);
    const settled = context(3, '350'); settled.tradingDate = '2026-11-16'; settled.at = '2026-11-16T15:03:00.000Z';
    settled.quotes[0] = { ...settled.quotes[0]!, marketTime: settled.at, observedAt: settled.at, tradingDate: settled.tradingDate };
    const exited = arenaMatchOrders(entered, settled, true);
    expect(exited.positions).toEqual(original.positions);
    expect(exited.fills[1]?.quantity).toBe('27');
  });
  it('同一行情下价格研究只唤醒研究，摘要中的止损不创建卖单', () => {
    const d = decision(); d.summary = '跌到355美元止损'; d.orders[0]!.onFill = null;
    d.wakeups = [{ kind: 'price', symbol: 'AAPL.US', operator: 'lte', price: '355' }];
    const entered = arenaMatchOrders(submit(empty(), d), context(1, '359'), true);
    const c = context(2, '350'), observed = arenaMatchOrders(entered, c, true);
    expect(observed.fills.map(f => f.side)).toEqual(['buy']);
    expect(observed.positions[0]?.quantity).toBe('27');
    expect(arenaDueWakeups(observed.wakeups, c.quotes, observed.fills, c.at)).toHaveLength(1);
  });
  it('独立卖出不能消耗保护批次；撤保护才释放这批份额', () => {
    const entered = arenaMatchOrders(submit(), context(1, '359'), true);
    expect(arenaAvailableShares(entered, 'AAPL.US', day)).toBe('0');
    const d = decision(); d.orders = [{ ...d.orders[0]!, clientId: 'manual', side: 'sell', onFill: null }];
    expect(() => arenaSubmitDecision(entered, entered.revision, d, context(2))).toThrow('insufficient_position');
    d.cancelOrderIds = [entered.orders[1]!.id];
    const cancelled = arenaSubmitDecision(entered, entered.revision, d, context(2));
    expect(cancelled.orders[1]?.state).toBe('cancelled');
    expect(cancelled.orders[2]?.state).toBe('active');
  });
  it('暂停、无有效行情及不可卖时保留保护，恢复后仍要求后续行情', () => {
    const entered = arenaMatchOrders(submit(), context(1, '359'), true);
    expect(arenaMatchOrders(entered, context(2, '350'), false)).toBe(entered);
    const stale = context(2, '350'); stale.quotes[0]!.marketTime = at(0);
    expect(arenaMatchOrders(entered, stale, true)).toEqual(entered);
    const halted = context(2, '350'); halted.quotes[0]!.sellBlocked = 'suspended';
    expect(arenaMatchOrders(entered, halted, true)).toEqual(entered);
  });
  it('显式跨夜期限持久化；次日可继续保护，截止时刻到期', () => {
    const d = decision(); d.orders[0]!.onFill!.activateOrders[0]!.validUntil = { kind: 'date', expiresOn: '2026-11-16' };
    const entered = arenaMatchOrders(submit(empty(), d), context(1, '359'), true);
    const restored = JSON.parse(JSON.stringify(entered)) as ArenaPaperAccount;
    expect(restored.orders[1]?.expiresAt).toBe('2026-11-16T21:00:00.000Z');
    expect(arenaExpireOrders(restored, day + 'T21:00:00Z').orders[1]?.state).toBe('active');
    expect(arenaExpireOrders(restored, '2026-11-16T21:00:00Z').orders[1]?.state).toBe('expired');
  });
});
