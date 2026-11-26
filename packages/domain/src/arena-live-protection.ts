import { DecimalValue as D } from './decimal.js';
import { arenaFilledQuantity, arenaFractionQuantity, arenaRecordOrderQuantities, arenaRemainingQuantity } from './arena-live-fill-quantity.js';
import { arenaInitialTrailingState } from './arena-live-trailing-stop.js';
import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

/** 提交即保存子单；等待期间不预留账户原有股份。 */
export function arenaCreateProtection(book: ArenaPaperAccount, parent: ArenaPaperOrder, q: ArenaPaperQuote, c: ArenaPaperContext) {
  if (!parent.onFill) return;
  assertProtectionShape(parent, parent.onFill);
  for (const input of parent.onFill.activateOrders) {
    assertProtectionLeg(book, input, q);
    const expiresOn = input.validUntil.kind === 'date' ? input.validUntil.expiresOn : null;
    const expiresAt = expiresOn ? c.expiresAt(expiresOn, 'stop_loss') : parent.expiresAt;
    if (Date.parse(expiresAt) <= Date.parse(c.at)) throw new Error('order_expired');
    if (expiresOn && Date.parse(expiresAt) < Date.parse(parent.expiresAt)) throw new Error('protection_expires_before_parent');
    const quantity = input.quantity.basis === 'parent_filled_fraction' ? arenaFractionQuantity(D.from(parent.quantity), input.quantity, q.lot).toString() : parent.quantity;
    if (!D.from(quantity).isPositive()) throw new Error('exit_quantity_below_lot');
    book.orders.push({ id: c.newId(), clientId: input.clientId, symbol: parent.symbol, side: 'sell', kind: input.kind,
      quantity, quantityLot: q.lot, exitQuantity: input.quantity, trailing: input.trailing,
      price: input.price, expiresOn, exitGroup: input.exitGroup ?? null, parentOrderId: parent.id,
      validUntil: input.validUntil, createdAt: c.at, activeSince: c.at, expiresAt,
      state: 'waiting_parent', reservedCash: '0', filledQuantity: '0', remainingQuantity: '0', reason: 'awaiting_parent_fill' });
  }
}

/** 与父单成交落在同一次账户写入；屏障同时覆盖市场证据及记账时点。 */
export function arenaActivateProtection(book: ArenaPaperAccount, parent: ArenaPaperOrder, q: ArenaPaperQuote, c: ArenaPaperContext) {
  if (parent.onFill?.activation === 'on_full_fill' && !arenaRemainingQuantity(book, parent).isZero()) return;
  for (const child of book.orders) {
    if (child.parentOrderId !== parent.id || !['waiting_parent', 'active'].includes(child.state)) continue;
    const firstActivation = child.reason === 'awaiting_parent_fill';
    const reactivation = child.reason === 'awaiting_next_entry';
    if (reactivation) delete child.triggeredAt;
    child.state = 'active'; child.reason = null;
    child.activeSince = new Date(Math.max(Date.parse(c.at), Date.parse(q.marketTime))).toISOString();
    child.remainingQuantity = arenaRemainingQuantity(book, child).toString();
    if (child.trailing) arenaInitialTrailingState(book, parent, child, q, firstActivation || reactivation);
    if (firstActivation && child.validUntil?.kind === 'activation_session_close') child.expiresAt = c.expiresAt(null, 'stop_loss');
    if (Date.parse(child.expiresAt) <= Date.parse(c.at)) { child.state = 'expired'; child.reason = 'order_expired'; }
    else if (D.from(child.remainingQuantity).isZero()) settleProtectionQuota(book, parent, child);
  }
}

/** 退出后只同步本批份额；OCO 的另一腿由撮合器在首次成交时取消。 */
export function arenaProtectionAfterExit(book: ArenaPaperAccount, order: ArenaPaperOrder) {
  if (!order.parentOrderId) return;
  const parent = book.orders.find(o => o.id === order.parentOrderId)!;
  if (parent.state === 'active' && parent.onFill?.afterExit === 'cancel_entry_remainder') {
    parent.state = 'cancelled'; parent.reason = 'protection_exit_cancelled_entry';
  }
  for (const sibling of book.orders) if (sibling.parentOrderId === parent.id) {
    arenaRecordOrderQuantities(book, sibling);
    if (['active', 'filled', 'waiting_parent'].includes(sibling.state) && D.from(sibling.remainingQuantity!).isZero())
      settleProtectionQuota(book, parent, sibling);
  }
}

export function arenaEndWaitingProtection(book: ArenaPaperAccount): boolean {
  let changed = false;
  for (const child of book.orders) {
    if (child.state !== 'waiting_parent') continue;
    const parent = book.orders.find((o) => o.id === child.parentOrderId);
    if (!parent || ['filled', 'cancelled', 'expired', 'rejected'].includes(parent.state)) {
      if (parent && child.reason !== 'awaiting_parent_fill') settleProtectionQuota(book, parent, child);
      else { child.state = 'cancelled'; child.reason = 'parent_unfilled'; }
      changed = true;
    }
  }
  return changed;
}

/** 已卖完当前额度也保留稳定身份；后续入场只补累计额度与本档已退出量之差。 */
function settleProtectionQuota(book: ArenaPaperAccount, parent: ArenaPaperOrder, child: ArenaPaperOrder) {
  if (parent.state === 'active') {
    const held = book.positions.some(p => p.entryOrderId === parent.id && D.from(p.quantity).isPositive());
    child.state = 'waiting_parent'; child.reason = held ? 'awaiting_parent_quantity' : 'awaiting_next_entry';
  } else if (arenaFilledQuantity(book, child).isPositive()) {
    child.state = 'filled'; child.reason = null;
  } else {
    child.state = 'cancelled'; child.reason = 'plan_position_closed';
  }
}

/** 独立卖出不能挪用其他仍受保护的入场批次。 */
export function arenaPositionBelongsToOrder(book: ArenaPaperAccount, position: ArenaPaperAccount['positions'][number], order: ArenaPaperOrder) {
  if (position.symbol !== order.symbol) return false;
  if (order.parentOrderId) return position.entryOrderId === order.parentOrderId;
  return !position.entryOrderId || !book.orders.some((o) => o.parentOrderId === position.entryOrderId && o.state === 'active');
}

export function arenaOrderSellableShares(book: ArenaPaperAccount, order: ArenaPaperOrder, day: string) {
  return book.positions.filter((p) => p.availableOn <= day && arenaPositionBelongsToOrder(book, p, order))
    .reduce((sum, p) => sum.plus(p.quantity), D.from('0'));
}

function assertProtectionShape(parent: ArenaPaperOrder, protection: NonNullable<ArenaPaperOrder['onFill']>) {
  const legs = protection.activateOrders;
  const single = legs.length === 1 && legs[0]!.kind === 'stop_loss' && !legs[0]!.exitGroup;
  const pair = legs.length === 2 && new Set(legs.map(l => l.kind)).size === 2 &&
    !!legs[0]!.exitGroup && legs[0]!.exitGroup === legs[1]!.exitGroup &&
    JSON.stringify(legs[0]!.validUntil) === JSON.stringify(legs[1]!.validUntil);
  const staged = isStagedProtection(protection);
  const validSingle = (!protection.exitPolicy || protection.exitPolicy === 'single') && single;
  const validPair = (!protection.exitPolicy || protection.exitPolicy === 'oco') && pair;
  if (parent.side !== 'buy' || !(staged || validSingle || validPair) ||
    (protection.activation === 'on_each_fill' && !protection.afterExit))
    throw new Error('unsupported_fill_protection');
}

function isStagedProtection(protection: NonNullable<ArenaPaperOrder['onFill']>) {
  const legs = protection.activateOrders;
  return protection.exitPolicy === 'staged' && legs.length >= 2 &&
    legs.filter(l => l.kind === 'stop_loss').length === 1 && legs.every(l => !l.exitGroup &&
      (l.kind === 'stop_loss' ? l.quantity.basis === 'parent_open_quantity' : l.quantity.basis === 'parent_filled_fraction'));
}

function assertProtectionLeg(book: ArenaPaperAccount, input: NonNullable<ArenaPaperOrder['onFill']>['activateOrders'][number], q: ArenaPaperQuote) {
  if (input.side !== 'sell' || !['stop_loss', 'take_profit'].includes(input.kind) || input.reduceOnly !== true || (input.trailing && input.kind !== 'stop_loss'))
    throw new Error('unsupported_fill_protection');
  if (book.orders.some((o) => o.clientId === input.clientId)) throw new Error('duplicate_order');
  if (!D.from(input.price).isPositive() || !D.from(input.price).isMultipleOf(q.priceStep?.(input.price) ?? q.tick))
    throw new Error('invalid_tick');
}
