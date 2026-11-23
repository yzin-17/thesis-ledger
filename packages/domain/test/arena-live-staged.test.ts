import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import { arenaExpireOrders, arenaMatchOrders } from '../src/arena-live-match-orders.js';
import { arenaAvailableCash, arenaAvailableShares } from '../src/arena-live-account.js';
import { arenaDecisionPlanLines } from '../src/arena-live-plan-display.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision } from '../src/arena-live-types.js';

const at = (n: number) => `2026-11-13T15:${String(n).padStart(2, '0')}:00.000Z`;
const context = (n = 0, price = '360'): ArenaPaperContext => ({ at: at(n), tradingDate: '2026-11-13',
  fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000, maxActiveSymbols: 50,
  newId: randomUUID, allowedSymbols: new Set(['AAPL.US']), expiresAt: () => '2026-11-16T21:00:00.000Z',
  quotes: [{ symbol: 'AAPL.US', price, marketTime: at(n), observedAt: at(n), tradingDate: '2026-11-13', positionAvailableOn: '2026-11-13', cashAvailableOn: '2026-11-13',
    lot: '1', tick: '0.01', sourceRef: 'synthetic', evidence: {}, buyBlocked: null, sellBlocked: null,
    statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] });
function decision(): ArenaPaperDecision {
  return { summary: '独立分批样本', orders: [{ clientId: 'first', symbol: 'AAPL.US', side: 'buy', kind: 'limit', quantity: '27', price: '359.50', expiresOn: null, exitGroup: null,
    onFill: { activation: 'on_full_fill', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355', quantity: { basis: 'parent_open_quantity' }, reduceOnly: true,
      validUntil: { kind: 'date', expiresOn: '2026-11-16' } }] } }], cancelOrderIds: [], watchedSymbols: [], wakeups: [{ kind: 'fill', symbol: null }] };
}
function pending(d = decision(), cash = '100000') {
  const book: ArenaPaperAccount = { revision: 0, cash, orders: [], positions: [], cashSettlements: [], wakeups: [], watchedSymbols: [], fills: [] };
  return arenaSubmitDecision(book, 0, d, context());
}
describe('动态保护与分批订单', () => {
  it('冻结高水位、向下取整、恢复和重复行情；部分退出触发后反弹也继续退出', () => {
    const d = decision(); d.orders[0]!.onFill!.activateOrders[0]!.trailing = { priceSource: 'executable_quote', reference: 'highest_since_activation',
      distance: { kind: 'percent', value: '2' }, breakEven: { triggerGainPercent: '1', reference: 'gross_average_entry_price' } };
    let book = arenaMatchOrders(pending(d), context(1, '359'), true);
    book = arenaMatchOrders(book, context(2, '400.019'), true);
    expect(book.orders[1]!.trailingState).toMatchObject({ highWater: '400.019', triggerPrice: '392.01', triggered: false });
    expect(arenaMatchOrders(book, context(2, '400.019'), true)).toEqual(book);
    const restored = JSON.parse(JSON.stringify(book)) as ArenaPaperAccount;
    const c = context(3, '390'); c.matching = { kind: 'simulated_volume', maxSharesPerObservation: '4' };
    book = arenaMatchOrders(restored, c, true);
    expect(book.orders[1]!.trailingState!.triggered).toBe(true); expect(book.orders[1]!.remainingQuantity).toBe('23');
    c.at = at(4); c.quotes[0] = { ...c.quotes[0]!, marketTime: at(4), observedAt: at(4), price: '410' };
    book = arenaMatchOrders(book, c, true);
    expect(book.orders[1]!.trailingState!.highWater).toBe('400.019'); expect(book.orders[1]!.remainingQuantity).toBe('19');
  });
  it('无效、暂停和不可交易报价不推进高水位；金额回撤保本以成交均价为底', () => {
    const d = decision(); d.orders[0]!.onFill!.activateOrders[0]!.trailing = { priceSource: 'executable_quote', reference: 'highest_since_activation',
      distance: { kind: 'amount', value: '50' }, breakEven: { triggerGainPercent: '1', reference: 'gross_average_entry_price' } };
    const entered = arenaMatchOrders(pending(d), context(1, '359'), true), c = context(2, '400');
    expect(arenaMatchOrders(entered, c, false)).toBe(entered);
    c.quotes[0]!.sellBlocked = 'suspended'; expect(arenaMatchOrders(entered, c, true)).toEqual(entered);
    c.quotes[0]!.sellBlocked = null; c.quotes[0]!.marketTime = at(0); expect(arenaMatchOrders(entered, c, true)).toEqual(entered);
    const raised = arenaMatchOrders(entered, context(2, '365'), true);
    expect(raised.orders[1]!.trailingState!.triggerPrice).toBe('359');
  });
  it('并行挂两笔；顺序挂单预留全部预算，只在前批全成后的后续行情买第二批', () => {
    const d = decision(); d.orders[0]!.quantity = '10'; d.orders[0]!.onFill = null;
    d.orders.push({ ...d.orders[0]!, clientId: 'second', quantity: '17' });
    const parallel = arenaMatchOrders(pending(d), context(1, '359'), true); expect(parallel.fills).toHaveLength(2);
    d.orders[1]!.entryAfter = { clientId: 'first', activation: 'on_full_fill' };
    const waiting = pending(d); expect(arenaAvailableCash(waiting, '2026-11-13')).toBe('90293.5');
    expect(waiting.orders[1]!.state).toBe('waiting_entry');
    const first = arenaMatchOrders(waiting, context(1, '359'), true); expect(first.fills.map(f => f.quantity)).toEqual(['10']);
    expect(arenaMatchOrders(first, context(1, '359'), true)).toEqual(first);
    expect(arenaMatchOrders(first, context(2, '359'), true).fills.map(f => f.quantity)).toEqual(['10', '17']);
    expect(() => pending(d, '5000')).toThrow('insufficient_cash');
    expect(arenaDecisionPlanLines(d).join('')).toContain('前批 first 全部成交后才激活');
    expect(arenaExpireOrders(waiting, '2026-11-16T21:00:00Z').orders.map(o => o.state)).toEqual(['expired', 'expired']);
  });
  it('前批部分成交后撤余，后批取消，后批保护不挪用前批股份', () => {
    const d = decision(); d.orders.push({ ...d.orders[0]!, clientId: 'second', entryAfter: { clientId: 'first', activation: 'on_full_fill' },
      onFill: { ...d.orders[0]!.onFill!, activateOrders: [{ ...d.orders[0]!.onFill!.activateOrders[0]!, clientId: 'second-stop' }] } });
    const c = context(1, '359'); c.matching = { kind: 'simulated_volume', maxSharesPerObservation: '10' };
    const ten = arenaMatchOrders(pending(d), c, true);
    const stopped = arenaSubmitDecision(ten, ten.revision, { ...d, orders: [], cancelOrderIds: [ten.orders[0]!.id] }, context(2));
    expect(stopped.orders.map(o => o.state)).toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    expect(stopped.fills).toHaveLength(1);
  });
  it('分档卖出27股的三分之一为9，止损同步18；余仓止损后取消未完成档位', () => {
    const d = decision(), protection = d.orders[0]!.onFill!; protection.exitPolicy = 'staged';
    protection.activateOrders.push({ ...protection.activateOrders[0]!, clientId: 'take', kind: 'take_profit', price: '375',
      quantity: { basis: 'parent_filled_fraction', numerator: 1, denominator: 3 } });
    const entered = arenaMatchOrders(pending(d), context(1, '359'), true);
    const profit = arenaMatchOrders(entered, context(2, '380'), true);
    expect(profit.fills.map(f => f.quantity)).toEqual(['27', '9']);
    expect(profit.orders[1]).toMatchObject({ state: 'active', remainingQuantity: '18' });
    expect(profit.orders[2]).toMatchObject({ state: 'filled', remainingQuantity: '0' });
    expect(arenaAvailableShares(profit, 'AAPL.US', '2026-11-13')).toBe('0');
    const stopped = arenaMatchOrders(profit, context(3, '350'), true);
    expect(stopped.fills.map(f => f.quantity)).toEqual(['27', '9', '18']); expect(stopped.positions).toEqual([]);
    const directStop = arenaMatchOrders(entered, context(2, '350'), true);
    expect(directStop.orders[2]!.state).toBe('cancelled');
    expect(arenaDecisionPlanLines(d).join('')).toContain('1/3');
  });
});
