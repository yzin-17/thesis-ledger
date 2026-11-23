import { createHash } from 'node:crypto';
import type { ArenaLiveDecision } from '@thesis-ledger/schemas';

/** 保留短标识的可读性；最长合法输入也必须能通过持久化合同。 */
function scoped(cycleId: string, value: string) {
  const readable = cycleId + ':' + value;
  return readable.length <= 200 ? readable : cycleId + ':sha256:' + createHash('sha256').update(value).digest('hex');
}
export function liveOrderCommand(cycleId: string, decision: ArenaLiveDecision) {
  return { ...decision, orders: decision.orders.map(o => ({ ...o,
    clientId: scoped(cycleId, o.clientId), exitGroup: o.exitGroup ? scoped(cycleId, o.exitGroup) : null,
    entryAfter: o.entryAfter ? { ...o.entryAfter, clientId: scoped(cycleId, o.entryAfter.clientId) } : null,
    onFill: o.onFill ? { ...o.onFill, activateOrders: o.onFill.activateOrders.map(child => ({ ...child,
      clientId: scoped(cycleId, child.clientId), exitGroup: child.exitGroup ? scoped(cycleId, child.exitGroup) : null,
    })) } : null,
  })) };
}
