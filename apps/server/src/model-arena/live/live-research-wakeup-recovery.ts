import { randomUUID } from 'node:crypto';
import { arenaLiveAccountSchema, arenaWakeupInputSchema, type ArenaLiveAccount } from '@thesis-ledger/schemas';
import { liveRemaining, type LiveAgentRow, type LiveDatabase, type LiveMatchRow } from './live-storage.js';
import { liveTimeline } from './live-timeline.js';

const fallbackDelayMs = 60 * 60 * 1000;
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** 只恢复失败响应中独立合法的未来时间预约，不采纳任何失败的买卖指令。 */
export function recoverInvalidResearchWakeup(audit: unknown, now: Date): { at: string; source: 'model' | 'fallback' } {
  const calls = asRecord(audit)?.calls;
  const latest = Array.isArray(calls) ? asRecord(calls.at(-1)) : null;
  const error = asRecord(latest?.error);
  const diagnostics = asRecord(latest?.diagnostics);
  if (latest?.state === 'settled' && error?.code === 'schema_invalid' &&
    typeof diagnostics?.outputText === 'string' && diagnostics.outputText.length <= 65_536) {
    try {
      const raw = asRecord(JSON.parse(diagnostics.outputText));
      if (raw?.action === 'decision') {
        const conditions = asRecord(raw.decision)?.wakeups;
        if (Array.isArray(conditions) && conditions.length <= 100) {
          const times = conditions.flatMap((condition) => {
            const result = arenaWakeupInputSchema.safeParse(condition);
            return result.success && result.data.kind === 'time' &&
              Date.parse(result.data.at) > now.getTime() ? [result.data.at] : [];
          }).sort();
          if (times.length) return { at: times[0]!, source: 'model' };
        }
      }
    } catch { /* 解析失败时延迟观察，不采纳部分订单。 */ }
  }
  return { at: new Date(now.getTime() + fallbackDelayMs).toISOString(), source: 'fallback' };
}

export interface FailedResearchWakeupPlan {
  account: ArenaLiveAccount | null;
  canContinue: boolean;
  repeatedInvalidOutput: boolean;
  recovery: ReturnType<typeof recoverInvalidResearchWakeup> | null;
}

/** 在周期失败事务内规划下一次观察；重复失败必须人工恢复，避免无界调用。 */
export async function planFailedResearchWakeup(
  db: LiveDatabase, match: LiveMatchRow, agent: LiveAgentRow, cycleId: string, audit: unknown, now: Date,
): Promise<FailedResearchWakeupPlan> {
  const stopped: FailedResearchWakeupPlan = { account: null, canContinue: false, repeatedInvalidOutput: false, recovery: null };
  if (match.state !== 'running') return stopped;
  const [previous] = await db.$queryRaw<{ state: string; reason: string | null }[]>`SELECT state,reason
    FROM "ArenaLiveCycle" WHERE "agentId"=${agent.id}::uuid AND id<>${cycleId}::uuid
    ORDER BY "createdAt" DESC LIMIT 1`;
  if (previous?.state === 'failed' && previous.reason === 'model_output_invalid')
    return { ...stopped, repeatedInvalidOutput: true };
  const remaining = [liveRemaining(agent.remaining), liveRemaining(match.remaining)];
  if (!remaining.every((budget) => (budget.requests === null || budget.requests > 0) &&
    (budget.tokens === null || budget.tokens > 0))) return stopped;
  if ((await liveTimeline(db, match.id))?.phase === 'replay') return stopped;
  const account = arenaLiveAccountSchema.parse(agent.account);
  if (account.wakeups.some((w) => !w.firedAt && w.condition.kind === 'time'))
    return { ...stopped, canContinue: true };
  const recovery = recoverInvalidResearchWakeup(audit, now);
  account.wakeups.push({ id: randomUUID(), condition: { kind: 'time', at: recovery.at },
    createdAt: now.toISOString(), firedAt: null });
  account.revision++;
  return { account, canContinue: true, repeatedInvalidOutput: false, recovery };
}