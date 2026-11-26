import type { ArenaPaperAccount, ArenaPaperContext, ArenaPaperOrder, ArenaPaperQuote } from './arena-live-types.js';

/** 顺序入场的预算在提交时预留；前批全成后才允许后批使用下一份行情。 */
export function arenaActivateNextEntries(book: ArenaPaperAccount, parent: ArenaPaperOrder, q: ArenaPaperQuote, c: ArenaPaperContext) {
  if (parent.state !== 'filled') return;
  for (const next of book.orders) if (next.state === 'waiting_entry' && next.activationOrderId === parent.id) {
    next.state = 'active'; next.reason = null;
    next.activeSince = new Date(Math.max(Date.parse(c.at), Date.parse(q.marketTime))).toISOString();
  }
}
export function arenaEndWaitingEntries(book: ArenaPaperAccount) {
  let changed = false;
  // 引用只能指向先前委托；固定点传播覆盖其保护单也可能位于前批之后的情况。
  for (let count = 0; count < book.orders.length; count++) {
    let pass = false;
    for (const next of book.orders) {
      if (next.state !== 'waiting_entry') continue;
      const parent = book.orders.find(o => o.id === next.activationOrderId);
      if (!parent || ['cancelled', 'expired', 'rejected'].includes(parent.state)) {
        next.state = 'cancelled'; next.reason = 'previous_entry_incomplete'; pass = true; changed = true;
      }
    }
    if (!pass) break;
  }
  return changed;
}
