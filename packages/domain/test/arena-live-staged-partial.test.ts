import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import { arenaExpireOrders, arenaMatchOrders } from '../src/arena-live-match-orders.js';
import { arenaAvailableShares } from '../src/arena-live-account.js';
import { arenaDecisionPlanLines, arenaOrderProtectionText } from '../src/arena-live-plan-display.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision } from '../src/arena-live-types.js';

const day = '2026-11-13';
const at = (n: number) => `${day}T15:${String(n).padStart(2, '0')}:00.000Z`;
function context(n = 0, price = '360', cap = '10'): ArenaPaperContext {
  return { at: at(n), tradingDate: day, matching: { kind: 'simulated_volume', maxSharesPerObservation: cap },
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000,
    maxActiveSymbols: 50, allowedSymbols: new Set(['AAPL.US']), newId: randomUUID,
    expiresAt: d => (d ?? day) + 'T21:00:00.000Z',
    quotes: [{ symbol: 'AAPL.US', price, marketTime: at(n), observedAt: at(n), sourceRef: 'independent-staged-partial', evidence: {},
      tradingDate: day, positionAvailableOn: day, cashAvailableOn: day, lot: '1', tick: '0.01',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
}
function decision(): ArenaPaperDecision {
  return { summary: '逐次激活与分档退出独立模拟', orders: [{ clientId: 'entry', symbol: 'AAPL.US', side: 'buy', kind: 'limit',
    quantity: '27', price: '359.50', expiresOn: day, exitGroup: null,
    onFill: { activation: 'on_each_fill', afterExit: 'keep_entry_remainder', exitPolicy: 'staged', activateOrders: [
      { clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355', quantity: { basis: 'parent_open_quantity' }, reduceOnly: true,
        validUntil: { kind: 'date', expiresOn: '2026-11-16' } },
      { clientId: 'take', side: 'sell', kind: 'take_profit', price: '375', quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 },
        reduceOnly: true, validUntil: { kind: 'date', expiresOn: '2026-11-16' } },
    ] } }], watchedSymbols: [], cancelOrderIds: [], wakeups: [{ kind: 'time', at: '2026-11-16T15:00:00Z' }] };
}
function pending(d = decision()) {
  const b: ArenaPaperAccount = { revision: 0, cash: '100000', positions: [{ symbol: 'AAPL.US', quantity: '50', acquiredOn: '2026-11-12', availableOn: day }],
    cashSettlements: [], orders: [], fills: [], watchedSymbols: [], wakeups: [] };
  return arenaSubmitDecision(b, 0, d, context());
}
const match = (b: ArenaPaperAccount, n: number, p: string, cap = '10') => arenaMatchOrders(b, context(n, p, cap), true);
const cancel = (b: ArenaPaperAccount, n: number, ids = [b.orders[0]!.id]) => arenaSubmitDecision(b, b.revision,
  { ...decision(), orders: [], cancelOrderIds: ids }, context(n));
const restored = (b: ArenaPaperAccount) => JSON.parse(JSON.stringify(b)) as ArenaPaperAccount;

describe('逐次激活的累计分档额度', () => {
  it('买10只卖3，撤17后保护7，再退出4仅保护3；已有50股不混入', () => {
    const ten = match(pending(), 1, '359');
    expect(ten.orders[2]).toMatchObject({ state: 'active', remainingQuantity: '3' });
    const profit = match(ten, 2, '380');
    expect(profit.orders[2]).toMatchObject({ state: 'waiting_parent', filledQuantity: '3', reason: 'awaiting_parent_quantity' });
    expect(profit.orders[1]!.remainingQuantity).toBe('7');
    const stopped = cancel(profit, 3);
    expect(stopped.orders[2]!.state).toBe('filled');
    const exited = match(stopped, 4, '350', '4');
    expect(exited.orders[1]!.remainingQuantity).toBe('3');
    expect(arenaAvailableShares(exited, 'AAPL.US', day)).toBe('50');
    expect(exited.positions.filter(p => !p.entryOrderId).map(p => p.quantity)).toEqual(['50']);
    expect(exited.orders.map(o => o.id)).toEqual(ten.orders.map(o => o.id));
  });
  it('累计10卖3再买10仅新增3，买满27累计只卖9，重复和恢复不重置额度', () => {
    let b = match(match(pending(), 1, '359'), 2, '380');
    expect(match(restored(b), 2, '380')).toEqual(b);
    b = match(restored(b), 3, '359');
    expect(b.orders[2]).toMatchObject({ state: 'active', filledQuantity: '3', remainingQuantity: '3' });
    expect(b.orders[1]!.remainingQuantity).toBe('17');
    b = match(b, 4, '380'); expect(b.orders[2]!.filledQuantity).toBe('6');
    b = match(b, 5, '359'); expect(b.orders[0]!.state).toBe('filled');
    expect(b.orders[2]!.remainingQuantity).toBe('3');
    b = match(b, 6, '380');
    expect(b.orders[2]).toMatchObject({ state: 'filled', filledQuantity: '9' });
    expect(b.orders[1]!.remainingQuantity).toBe('18');
    expect(match(b, 7, '380')).toEqual(b);
  });
  it('买2不足一手等待，继续买1才有1股额度；首激活期限不延长', () => {
    const d = decision(); d.orders[0]!.onFill!.activateOrders.forEach(l => { l.validUntil = { kind: 'activation_session_close' }; });
    let b = match(pending(d), 1, '359', '2');
    expect(b.orders[2]).toMatchObject({ state: 'waiting_parent', remainingQuantity: '0', reason: 'awaiting_parent_quantity', expiresAt: day + 'T21:00:00.000Z' });
    expect(arenaOrderProtectionText(b, b.orders[2]!, day)).toContain('等待新增入场额度');
    b = match(b, 2, '359', '1'); expect(b.orders[2]!.remainingQuantity).toBe('1');
    const c = context(3, '359', '1'); c.expiresAt = () => '2026-11-16T21:00:00.000Z';
    b = arenaMatchOrders(b, c, true); expect(b.orders[2]!.expiresAt).toBe(day + 'T21:00:00.000Z');
    expect(arenaExpireOrders(b, day + 'T21:00:00Z').orders.map(o => o.state)).toEqual(['expired', 'expired', 'expired']);
  });
  it('首次分档退出撤入场余量；零额度等待不提前取消该档', () => {
    const d = decision(); d.orders[0]!.onFill!.afterExit = 'cancel_entry_remainder';
    let b = match(pending(d), 1, '359', '2'); expect(b.orders[2]!.state).toBe('waiting_parent');
    b = match(b, 2, '359', '1'); b = match(b, 3, '380');
    expect(b.orders[0]!.state).toBe('cancelled'); expect(b.orders[1]!.remainingQuantity).toBe('2');
    expect(match(b, 4, '359').fills).toEqual(b.fills);
  });
  it('等待额度的档位可单独撤销或到期，后续入场不复活', () => {
    const d = decision(); d.orders[0]!.onFill!.activateOrders[1]!.validUntil = { kind: 'activation_session_close' };
    let b = match(pending(d), 1, '359', '2');
    const cancelled = cancel(b, 2, [b.orders[2]!.id]);
    expect(match(cancelled, 3, '359').orders[2]!.state).toBe('cancelled');
    b = arenaExpireOrders(b, day + 'T21:00:00Z'); expect(b.orders[2]!.state).toBe('expired');
    expect(b.orders[1]!.state).toBe('active');
  });
  it('止损清空当前持仓后后续买入仍沿用累计档位；保护过程重启但不重置已退出量', () => {
    let b = match(match(pending(), 1, '359'), 2, '380');
    b = match(b, 3, '350', '7'); expect(b.orders[1]!.reason).toBe('awaiting_next_entry');
    b = match(restored(b), 4, '359');
    expect(b.orders[1]).toMatchObject({ state: 'active', remainingQuantity: '10' });
    expect(b.orders[1]!.triggeredAt).toBeUndefined();
    expect(b.orders[2]).toMatchObject({ state: 'active', filledQuantity: '3', remainingQuantity: '3' });
  });
  it('多档各自取整与扣减，单份行情共享额度，尾差仍由止损覆盖', () => {
    const d = decision(), legs = d.orders[0]!.onFill!.activateOrders;
    legs.push({ ...legs[1]!, clientId: 'take2', price: '385' });
    let b = match(pending(d), 1, '359'); b = match(b, 2, '390', '4');
    expect(b.orders[2]!.filledQuantity).toBe('3'); expect(b.orders[3]!.filledQuantity).toBe('1');
    expect(b.orders[1]!.remainingQuantity).toBe('6');
    expect(match(restored(b), 2, '390', '4')).toEqual(b);
    b = match(b, 3, '390'); expect(b.orders[3]!.filledQuantity).toBe('3');
    expect(b.orders[1]!.remainingQuantity).toBe('4');
  });
  it('逐次分档与移动止损共享余仓，触发后的退出不重复额度，新入场才开始新保护过程', () => {
    const d = decision();
    d.orders[0]!.onFill!.activateOrders[0]!.trailing = { priceSource: 'executable_quote', reference: 'highest_since_activation',
      distance: { kind: 'percent', value: '2' }, breakEven: null };
    let b = match(match(pending(d), 1, '359'), 2, '400');
    expect(b.orders[1]!.trailingState!.triggerPrice).toBe('392');
    b = match(b, 3, '350', '4'); expect(b.orders[1]!.remainingQuantity).toBe('3');
    b = match(restored(b), 4, '359', '3'); expect(b.orders[1]!.reason).toBe('awaiting_next_entry');
    b = match(b, 5, '359');
    expect(b.orders[1]!.trailingState).toMatchObject({ highWater: '359', triggered: false });
    expect(b.orders[2]).toMatchObject({ filledQuantity: '3', remainingQuantity: '3' });
  });
  it('全成与逐次中文回读明确累计基数、扣减及新增额度', () => {
    const d = decision();
    const each = arenaDecisionPlanLines(d).join('');
    expect(each).toContain('累计实际成交量'); expect(each).toContain('扣除本档累计已退出量'); expect(each).toContain('等待新增入场');
    d.orders[0]!.onFill!.activation = 'on_full_fill';
    expect(arenaDecisionPlanLines(d).join('')).not.toContain('等待新增入场');
  });
});
