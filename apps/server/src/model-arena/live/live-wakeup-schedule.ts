import { randomUUID } from 'node:crypto';
import type { ArenaLiveAccount } from '@thesis-ledger/schemas';

/** 已有到期的时间预约足以触发一轮决策，不重复积压自动/手动预约。 */
export function scheduleImmediateObservation(account: ArenaLiveAccount, at: string): boolean {
  const due = account.wakeups.some((w) =>
    !w.firedAt && w.condition.kind === 'time' && Date.parse(w.condition.at) <= Date.parse(at));
  if (due) return false;
  account.wakeups.push({
    id: randomUUID(), condition: { kind: 'time', at },
    createdAt: at, firedAt: null,
  });
  return true;
}
