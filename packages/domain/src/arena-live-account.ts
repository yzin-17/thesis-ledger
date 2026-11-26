import { DecimalValue as D } from './decimal.js';
import { arenaRemainingQuantity } from './arena-live-fill-quantity.js';
import type { ArenaPaperAccount, ArenaPaperQuote, ArenaPaperWakeup } from './arena-live-types.js';

export function arenaReservedCash(account: ArenaPaperAccount) {
  return account.orders.filter((o) => o.state === 'active' || o.state === 'waiting_entry')
    .reduce((sum, o) => sum.plus(o.reservedCash), D.from('0')).toString();
}
export function arenaAvailableCash(account: ArenaPaperAccount, day: string) {
  const unsettled = account.cashSettlements.filter((s) => s.availableOn > day)
    .reduce((sum, s) => sum.plus(s.amount), D.from('0'));
  return D.from(account.cash).minus(arenaReservedCash(account)).minus(unsettled).toString();
}
export function arenaAvailableShares(account: ArenaPaperAccount, symbol: string, day: string) {
  const protectedEntries = new Set(account.orders.filter((o) => o.parentOrderId && o.state === 'active').map((o) => o.parentOrderId));
  let quantity = account.positions.filter((p) => p.symbol === symbol && p.availableOn <= day && !protectedEntries.has(p.entryOrderId))
    .reduce((sum, p) => sum.plus(p.quantity), D.from('0'));
  const groups = new Set<string>();
  for (const order of account.orders) {
    if (order.state !== 'active' || order.side !== 'sell' || order.symbol !== symbol || order.parentOrderId) continue;
    if (order.exitGroup) {
      if (groups.has(order.exitGroup)) continue;
      groups.add(order.exitGroup);
    }
    quantity = quantity.minus(arenaRemainingQuantity(account, order));
  }
  return quantity.toString();
}
export function arenaAccountNav(account: ArenaPaperAccount, prices: ReadonlyMap<string, string>) {
  let nav = D.from(account.cash);
  for (const position of account.positions) {
    const price = prices.get(position.symbol);
    if (price === undefined || !D.from(price).isPositive()) return null;
    nav = nav.plus(D.from(position.quantity).times(price));
  }
  return nav.toString();
}
export function arenaPositionTotals(account: Pick<ArenaPaperAccount, 'positions'>) {
  const rows = new Map<string, { symbol: string; quantity: string; availableOn: string[] }>();
  for (const p of account.positions) {
    const row = rows.get(p.symbol) ?? { symbol: p.symbol, quantity: '0', availableOn: [] };
    row.quantity = D.from(row.quantity).plus(p.quantity).toString();
    row.availableOn = [...new Set([...row.availableOn, p.availableOn])].sort();
    rows.set(p.symbol, row);
  }
  return [...rows.values()];
}
/** 已到期但未消费的时间预约会进入研究调度，不能重复手动触发。 */
export function arenaHasDueTimeWakeup(wakeups: readonly ArenaPaperWakeup[], clockAt: string): boolean {
  const now = Date.parse(clockAt);
  return wakeups.some((w) => !w.firedAt && w.condition.kind === 'time' && Date.parse(w.condition.at) <= now);
}

type ArenaNextDecisionInput = {
  wakeups: readonly ArenaPaperWakeup[];
  matchState: 'draft' | 'running' | 'paused' | 'ended';
  agentState: 'waiting' | 'researching' | 'needs_attention' | 'budget_exhausted';
  timeZone: string;
  clockAt?: string;
  pending?: boolean;
};

/**
 * 与具体预约时间无关的决策状态说明；返回 null 表示下一次决策就由最早未触发的时间预约决定，
 * 调用方已单独展示该预约时不必重复文案。
 */
export function arenaNextDecisionNote(input: ArenaNextDecisionInput): string | null {
  if (input.matchState === 'draft') return '尚未启动';
  if (input.matchState === 'ended') return '比赛已结束';
  if (input.agentState === 'researching') return '正在决策';
  if (input.agentState === 'needs_attention') return '需处理研究异常';
  if (input.agentState === 'budget_exhausted') return '模型额度已用尽';
  if (input.pending) return '已触发，等待模型执行';
  const waiting = input.wakeups.filter((w) => !w.firedAt);
  const times = waiting.flatMap((w) => w.condition.kind === 'time' ? [w.condition.at] : []).sort();
  if (!times.length) return waiting.length ? '等待价格或成交事件（时间不固定）' : '尚未预约';
  const now = input.clockAt ?? new Date().toISOString();
  if (Date.parse(times[0]!) > Date.parse(now)) return null;
  return input.matchState === 'paused' ? '预约已到期（恢复后等待研究调度）' : '预约已到期（等待研究调度）';
}

/** UI 中的时间是预约而非确定调用时间；价格和成交事件可能更早触发。 */
export function arenaNextDecisionLabel(input: ArenaNextDecisionInput) {
  const note = arenaNextDecisionNote(input);
  if (note !== null) return note;
  const times = input.wakeups.filter((w) => !w.firedAt)
    .flatMap((w) => (w.condition.kind === 'time' ? [w.condition.at] : [])).sort();
  const events = input.wakeups.some((w) => !w.firedAt && w.condition.kind !== 'time');
  const label = new Intl.DateTimeFormat('zh-CN', {
    timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(times[0]!)) + '（' + input.timeZone + '）';
  return label + (events ? '；事件也可能提前触发' : '');
}

export function arenaDueWakeups(
  wakeups: readonly ArenaPaperWakeup[], quotes: readonly Pick<ArenaPaperQuote, 'symbol' | 'price' | 'marketTime' | 'observedAt'>[],
  fills: readonly { symbol: string; recordedAt: string }[], now: string,
) {
  return wakeups.filter((w) => {
    if (w.firedAt) return false;
    const c = w.condition;
    if (c.kind === 'time') return Date.parse(c.at) <= Date.parse(now);
    if (c.kind === 'fill') return fills.some((f) =>
      Date.parse(f.recordedAt) > Date.parse(w.createdAt) && Date.parse(f.recordedAt) <= Date.parse(now) && (!c.symbol || c.symbol === f.symbol));
    const quote = quotes.find((q) => q.symbol === c.symbol && Date.parse(q.marketTime) > Date.parse(w.createdAt) && Date.parse(q.observedAt) <= Date.parse(now));
    if (!quote) return false;
    const comparison = D.from(quote.price).compareTo(c.price);
    return c.operator === 'gte' ? comparison >= 0 : comparison <= 0;
  }).map((w) => w.id);
}
