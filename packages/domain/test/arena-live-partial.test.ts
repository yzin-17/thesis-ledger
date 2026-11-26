import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { arenaSubmitDecision } from '../src/arena-live-submit.js';
import { arenaExpireOrders, arenaMatchOrders } from '../src/arena-live-match-orders.js';
import { arenaAvailableShares } from '../src/arena-live-account.js';
import { arenaOrderProtectionText } from '../src/arena-live-plan-display.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperDecision } from '../src/arena-live-types.js';

const day = '2026-11-13';
const at = (n: number) => `${day}T15:${String(n).padStart(2, '0')}:00.000Z`;
function context(n = 0, price = '360', cap = '2'): ArenaPaperContext {
  return { at: at(n), tradingDate: day, matching: { kind: 'simulated_volume', maxSharesPerObservation: cap },
    fees: { buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 }, maxPositionBps: 10000,
    maxActiveSymbols: 50, allowedSymbols: new Set(['AAPL.US']), newId: randomUUID,
    expiresAt: d => (d ?? day) + 'T21:00:00.000Z',
    quotes: [{ symbol: 'AAPL.US', price, marketTime: at(n), observedAt: at(n), sourceRef: 'controlled', evidence: {},
      tradingDate: day, positionAvailableOn: day, cashAvailableOn: day, lot: '1', tick: '0.01',
      buyBlocked: null, sellBlocked: null, statutoryBuyFee: () => '0', statutorySellFee: () => '0' }] };
}
function decision(): ArenaPaperDecision {
  return { summary: '独立部分成交模拟样本', orders: [{ clientId: 'entry', symbol: 'AAPL.US', side: 'buy', kind: 'limit',
    quantity: '27', price: '359.50', expiresOn: day, exitGroup: null,
    onFill: { activation: 'on_each_fill', afterExit: 'keep_entry_remainder', activateOrders: [{ clientId: 'stop', side: 'sell', kind: 'stop_loss', price: '355',
      quantity: { basis: 'parent_open_quantity' }, reduceOnly: true, validUntil: { kind: 'date', expiresOn: '2026-11-16' } }] } }],
    watchedSymbols: [], cancelOrderIds: [], wakeups: [{ kind: 'time', at: '2026-11-16T15:00:00Z' }] };
}
function pending(d = decision()) {
  const book: ArenaPaperAccount = { revision: 0, cash: '100000', positions: [{ symbol: 'AAPL.US', quantity: '50', acquiredOn: '2026-11-12', availableOn: day }],
    cashSettlements: [], orders: [], fills: [], watchedSymbols: [], wakeups: [] };
  return arenaSubmitDecision(book, 0, d, context());
}
function enterTen(d = decision()) {
  let book = pending(d);
  for (let n = 1; n <= 5; n++) book = arenaMatchOrders(book, context(n, '359'), true);
  return book;
}
const cancel = (book: ArenaPaperAccount, ids = [book.orders[0]!.id]) => arenaSubmitDecision(book, book.revision,
  { ...decision(), orders: [], cancelOrderIds: ids }, context(8));

describe('显式模拟额度与本批按量保护', () => {
  it('买10撤17仍保护10；已退出4后撤余只保护6，老仓50不混入', () => {
    const ten = enterTen();
    expect(ten.orders[0]).toMatchObject({ state: 'active', filledQuantity: '10', remainingQuantity: '17' });
    expect(cancel(ten).orders[1]).toMatchObject({ state: 'active', remainingQuantity: '10' });
    let exited = arenaMatchOrders(ten, context(6, '354'), true);
    exited = arenaMatchOrders(exited, context(7, '350'), true);
    const six = cancel(exited);
    expect(six.orders[1]).toMatchObject({ state: 'active', filledQuantity: '4', remainingQuantity: '6' });
    expect(arenaOrderProtectionText(six, six.orders[1]!, day)).toContain('已保护 6 股');
    expect(arenaOrderProtectionText(six, six.orders[1]!, day)).toContain('本批已退出 4 股');
    expect(arenaAvailableShares(six, 'AAPL.US', day)).toBe('50');
    expect(six.positions.filter(p => !p.entryOrderId).map(p => p.quantity)).toEqual(['50']);
  });
  it('零成交撤余结束子单；部分到期保留10股，单撤保护释放本批份额', () => {
    expect(cancel(pending()).orders.map(o => o.state)).toEqual(['cancelled', 'cancelled']);
    const ten = enterTen();
    expect(arenaExpireOrders(ten, day + 'T21:00:00Z').orders.map(o => o.state)).toEqual(['expired', 'active']);
    const unprotected = cancel(ten, [ten.orders[1]!.id]);
    expect(arenaAvailableShares(unprotected, 'AAPL.US', day)).toBe('60');
    expect(cancel(ten, ten.orders.map(o => o.id)).orders.map(o => o.state)).toEqual(['cancelled', 'cancelled']);
  });
  it('全成模式不会把中间10股标为保护，全部成交后才激活', () => {
    const d = decision(); d.orders[0]!.onFill!.activation = 'on_full_fill';
    let book = enterTen(d);
    expect(book.orders[1]!.state).toBe('waiting_parent');
    for (let n = 6; n <= 14; n++) book = arenaMatchOrders(book, context(n, '359'), true);
    expect(book.orders[0]!.state).toBe('filled'); expect(book.orders[1]!.remainingQuantity).toBe('27');
  });
  it('恢复、重复行情、换来源不再发额度；不同委托按既定顺序共享，按手数向下取整', () => {
    const d = decision(); d.orders.push({ ...d.orders[0]!, clientId: 'second', onFill: null });
    let book = pending(d); const c = context(1, '359', '5.9'); c.quotes[0]!.lot = '2';
    book = arenaMatchOrders(book, c, true);
    expect(book.fills.map(f => f.quantity)).toEqual(['4']);
    const restored = JSON.parse(JSON.stringify(book)) as ArenaPaperAccount;
    c.at = at(2); c.quotes[0]!.observedAt = at(2); c.quotes[0]!.sourceRef = 'different-source';
    c.quotes[0]!.marketTime = at(1).replace('.000Z', 'Z');
    expect(arenaMatchOrders(restored, c, true)).toEqual(restored);
  });
  it('退出后撤余阻止重开；保留余量允许同一保护身份再次激活', () => {
    const d = decision(); d.orders[0]!.onFill!.afterExit = 'cancel_entry_remainder';
    const book = arenaMatchOrders(enterTen(d), context(6, '354'), true);
    expect(book.orders[0]).toMatchObject({ state: 'cancelled', reason: 'protection_exit_cancelled_entry' });
    let kept = arenaMatchOrders(pending(), context(1, '359'), true);
    kept = arenaMatchOrders(kept, context(2, '350'), true);
    expect(kept.orders[1]!.state).toBe('waiting_parent');
    kept = arenaMatchOrders(kept, context(3, '359'), true);
    expect(kept.orders[1]).toMatchObject({ state: 'active', remainingQuantity: '2' });
    expect(kept.orders).toHaveLength(2);
  });
  it('附属OCO共享保护份额，首次部分退出取消另一腿；单腿继续退出本批余量', () => {
    const d = decision(), legs = d.orders[0]!.onFill!.activateOrders;
    legs[0]!.exitGroup = 'oco'; legs.push({ ...legs[0]!, clientId: 'take', kind: 'take_profit', price: '370' });
    let book = enterTen(d); expect(arenaAvailableShares(book, 'AAPL.US', day)).toBe('50');
    book = arenaMatchOrders(book, context(6, '375'), true);
    expect(book.orders[1]!.state).toBe('cancelled');
    expect(book.orders[2]).toMatchObject({ state: 'active', remainingQuantity: '8' });
    expect(arenaAvailableShares(book, 'AAPL.US', day)).toBe('50');
    const same = arenaMatchOrders(book, context(6, '375'), true); expect(same).toEqual(book);
  });
  it('止损触发后部分退出，价格反弹仍继续退出；倒序行情不消耗新额度', () => {
    const ten = enterTen();
    const first = arenaMatchOrders(ten, context(6, '354'), true);
    expect(first.orders[1]!.triggeredAt).toBe(at(6));
    const old = context(7, '350'); old.quotes[0]!.marketTime = at(4);
    expect(arenaMatchOrders(first, old, true)).toEqual(first);
    const bounced = arenaMatchOrders(first, context(7, '360'), true);
    expect(bounced.orders[1]).toMatchObject({ remainingQuantity: '6', filledQuantity: '4' });
    expect(bounced.fills.at(-1)!.price).toBe('360');
  });
  it('逐笔最低手续费按最小手数保守预留，不挪用其他委托资金', () => {
    const d = decision(), c = context(); c.fees.minimum = '1';
    const original = pending(); original.orders = []; original.revision = 0;
    const book = arenaSubmitDecision(original, 0, d, c);
    expect(book.orders[0]!.reservedCash).toBe('9733.5');
    const entered = arenaMatchOrders(book, { ...context(1, '359'), fees: c.fees }, true);
    expect(entered.fills[0]!.fee).toBe('1'); expect(entered.orders[0]!.reservedCash).toBe('9012.5');
  });
});
