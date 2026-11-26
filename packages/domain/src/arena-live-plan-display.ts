import { DecimalValue as D } from './decimal.js';
import { arenaLiveLabel } from './arena-live-display.js';
import { arenaFilledQuantity, arenaRemainingQuantity } from './arena-live-fill-quantity.js';
import type { ArenaPaperAccount, ArenaPaperDecision, ArenaPaperOrder, ArenaProtectionValidity } from './arena-live-types.js';

export function arenaProtectionValidityText(validity: ArenaProtectionValidity) {
  if (validity.kind === 'date') return '保护至 ' + validity.expiresOn + ' 收盘（可跨夜）';
  return '保护至激活当日收盘（不跨夜）';
}

/** 只读取有执行效力的配置，摘要由客户端单列。 */
export function arenaDecisionPlanLines(decision: ArenaPaperDecision, name: (symbol: string) => string = (s) => s, book?: ArenaPaperAccount): string[] {
  const automatic = decision.orders.filter((o) => o.side === 'sell').length +
    decision.orders.reduce((sum, o) => sum + (o.onFill?.activateOrders.length ?? 0), 0);
  const lines = ['自动卖出委托 ' + automatic + ' 张（含待激活保护）'];
  for (const id of decision.cancelOrderIds) lines.push(cancellationPlanLine(id, book));
  for (const order of decision.orders) {
    const price = order.price ? ' ' + order.price : '';
    const defaultExpiry = order.kind === 'market' ? '当前交易时段结束' : '当前交易日收盘';
    const expiry = order.expiresOn ? order.expiresOn + ' 收盘' : defaultExpiry;
    lines.push(`${name(order.symbol)} · ${order.side === 'buy' ? '买入' : '卖出'} ${order.quantity} 股 · ${arenaLiveLabel(order.kind)}${price} · 有效至${expiry}。`);
    if (order.entryAfter) lines.push(`等待前批 ${order.entryAfter.clientId} 全部成交后才激活，使用后续行情；本批预算在提交时预留，前批未全成就撤销或到期时本批取消。`);
    appendProtectionPlanLines(lines, order);
    if (order.onFill?.activation === 'on_each_fill' && order.onFill.afterExit) lines.push(order.onFill.afterExit === 'cancel_entry_remainder'
      ? '保护首次退出后撤销尚未成交的入场余量。' : '保护退出后仍保留入场余量，后续成交会再次建立本批保护。');
    if (order.exitGroup) lines.push('配对退出组 ' + order.exitGroup + '：一腿成交后取消另一腿，共享份额预留。');
  }
  return lines;
}

function cancellationPlanLine(id: string, book?: ArenaPaperAccount): string {
  const target = book?.orders.find(o => o.id === id);
  let impact = '撤销该委托尚未成交的余量。';
  if (target?.parentOrderId) impact = '撤销本条保护；已持有余仓失去该单保护，入场余量继续有效。';
  else if (target?.onFill) impact = '撤销入场余量；已激活的按量保护保留，未激活保护结束。';
  return `撤销委托 ${target?.clientId ?? id}：${impact}`;
}

export function arenaMatchingText(matching?: { kind: 'simulated_volume'; maxSharesPerObservation: string }) {
  return matching ? `模拟成交上限：每份新行情，每个账户、标的共享 ${matching.maxSharesPerObservation} 股；按手数向下取整，同时间先卖后买、按提交顺序分配，重复行情不补额度。`
    : '撮合方式：整笔成交。';
}

export function arenaOrderQuantityText(book: ArenaPaperAccount, order: ArenaPaperOrder) {
  return `目标 ${order.quantity} 股 · 已成交 ${arenaFilledQuantity(book, order).toString()} 股 · 余量 ${arenaRemainingQuantity(book, order).toString()} 股`;
}

export function arenaOrderProtectionText(book: ArenaPaperAccount, order: ArenaPaperOrder, day: string | null): string | null {
  if (!order.parentOrderId) return null;
  const parent = book.orders.find((o) => o.id === order.parentOrderId);
  const positions = book.positions.filter((p) => p.entryOrderId === order.parentOrderId);
  const held = positions.reduce((sum, p) => sum.plus(p.quantity), D.from('0'));
  const sellable = positions.filter((p) => day && p.availableOn <= day).reduce((sum, p) => sum.plus(p.quantity), D.from('0'));
  const protectedQuantity = order.state === 'active' ? arenaRemainingQuantity(book, order).toString() : '0';
  const quotaLabel = order.exitQuantity?.basis === 'parent_filled_fraction' ? '本档可退出' : '已保护';
  const parts = [`父单 ${parent?.clientId ?? order.parentOrderId}`, `本批持有 ${held.toString()} 股`, `${quotaLabel} ${protectedQuantity} 股`];
  const exited = book.fills.filter(f => f.side === 'sell' && book.orders.some(o => o.id === f.orderId && o.parentOrderId === order.parentOrderId))
    .reduce((sum, f) => sum.plus(f.quantity), D.from('0'));
  parts.push(`本批已退出 ${exited.toString()} 股`);
  if (order.state === 'active') parts.push(day ? `等待可卖 ${held.minus(sellable).toString()} 股` : '可卖数量待确认');
  if (held.isPositive() && ['cancelled', 'expired', 'rejected'].includes(order.state)) parts.push(`本批 ${held.toString()} 股已失去该单保护`);
  if (order.validUntil) parts.push(arenaProtectionValidityText(order.validUntil));
  if (order.reason === 'awaiting_parent_quantity') parts.push('本档当前额度已完成或不足一手，等待新增入场额度');
  if (order.exitQuantity?.basis === 'parent_filled_fraction') parts.push(`本档累计已退出 ${arenaFilledQuantity(book, order).toString()} 股，新增额度扣除已退出量`);
  if (order.trailingState) parts.push(`高水位 ${order.trailingState.highWater}`, `当前保护线 ${order.trailingState.triggerPrice}`, order.trailingState.triggered ? '已触发，等待可执行行情退出' : '随合格行情更新');
  return parts.join(' · ');
}

function appendProtectionPlanLines(lines: string[], order: ArenaPaperDecision['orders'][number]) {
  for (const child of order.onFill?.activateOrders ?? []) {
    const activation = order.onFill!.activation === 'on_each_fill' ? '每次成交后按已买数量' : '全部成交后';
    const scope = child.quantity.basis === 'parent_filled_fraction' ? `本批累计成交量的 ${child.quantity.numerator}/${child.quantity.denominator}` : `本批仍持有的最多 ${order.quantity} 股`;
    lines.push(`父单 ${order.clientId} ${activation}，自动为${scope}设置 ${child.price} 触发的${arenaLiveLabel(child.kind)}卖单 ${child.clientId}；${arenaProtectionValidityText(child.validUntil)}。未成交撤单或到期时保护结束；已激活的按量保护保留；触发后按后续有效行情撮合，成交价可能不同于触发价。`);
    if (child.exitGroup) lines.push(`附属退出组 ${child.exitGroup}：共享本批份额，一腿首次成交即取消另一腿，余仓由已成交腿继续执行。`);
    if (child.quantity.basis === 'parent_filled_fraction') {
      const continuation = order.onFill!.activation === 'on_each_fill' ? '不足一手或当前额度已完成时等待新增入场；' : '';
      lines.push(`分档 ${child.clientId} 卖出本批累计实际成交量的 ${child.quantity.numerator}/${child.quantity.denominator}，按手数向下取整并扣除本档累计已退出量；${continuation}尾差留在余仓止损中，不重复预留。`);
    }
    if (child.trailing) {
      const distance = child.trailing.distance;
      lines.push(`移动止损 ${child.clientId}：激活后合格可执行报价高点回撤 ${distance.value}${distance.kind === 'percent' ? '%' : '价格单位'}，初始最低保护线 ${child.price}，按价格步长向下取整；触发后锁定退出。`);
      if (child.trailing.breakEven) lines.push(`高点较本批成交均价上涨 ${child.trailing.breakEven.triggerGainPercent}% 后，保护线至少提高到本批成交均价（不含费用）。`);
    }
  }
}
