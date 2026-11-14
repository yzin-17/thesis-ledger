import { Inject, Injectable } from '@nestjs/common';
import { arenaLiveAccountSchema, type ArenaBudget, type ArenaLiveBudget } from '@thesis-ledger/schemas';
import { arenaAdjustLiveBudget } from '@thesis-ledger/domain';
import { PrismaService } from '../../platform/prisma.service.js';
import { liveAgents, liveMatch, liveRemaining, saveLiveAccount, type LiveCycleRow } from './live-storage.js';
import { planFailedResearchWakeup } from './live-research-wakeup-recovery.js';

const auditObject = (raw: unknown): Record<string, unknown> & { calls: Record<string, unknown>[]; tools: Record<string, unknown>[] } => {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
    ? (value as unknown[]).filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];
  return { ...r, calls: records(r.calls), tools: records(r.tools) };
};
function adjust(raw: unknown, reserved: ArenaBudget, used: ArenaBudget | null, refund: boolean) {
  return arenaAdjustLiveBudget(liveRemaining(raw), reserved, used, refund);
}
@Injectable()
export class LiveResearchBudget {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async reserve(id: string, attempt: number, requestId: string, amount: ArenaBudget, input: unknown) {
    const [known] = await this.db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!known) throw new Error('cycle_not_active');
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, known.matchId, undefined, true);
      const agent = (await liveAgents(tx, match.id, true)).find((a) => a.id === known.agentId)!;
      const [c] = await tx.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid FOR UPDATE`;
      const pending = c?.reservation as { settled?: boolean } | null;
      if (match.state !== 'running' || c?.state !== 'running' || c.attempt !== attempt ||
        !c.leaseUntil || c.leaseUntil.getTime() <= Date.now() || c.deadlineAt && c.deadlineAt.getTime() <= Date.now() || pending && !pending.settled) throw new Error('cycle_not_active');
      const agentBudget = adjust(agent.remaining, amount, null, false);
      let matchBudget: ArenaLiveBudget;
      try { matchBudget = adjust(match.remaining, amount, null, false); } catch { throw new Error('competition_budget'); }
      const audit = auditObject(c.requestAudit);
      audit.calls.push({ requestId, reserved: amount, state: 'reserved', input, sentAt: new Date().toISOString() });
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET remaining=${JSON.stringify(agentBudget)}::jsonb WHERE id=${agent.id}::uuid`;
      await tx.$executeRaw`UPDATE "ArenaLiveMatch" SET remaining=${JSON.stringify(matchBudget)}::jsonb WHERE id=${match.id}::uuid`;
      await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=COALESCE("requestId",${requestId}::uuid),
        reservation=${JSON.stringify({ requestId, amount, settled: false })}::jsonb,"requestAudit"=${JSON.stringify(audit)}::jsonb
        WHERE id=${id}::uuid`;
    });
  }
  async settle(id: string, requestId: string, used: ArenaBudget | null, receipt: Record<string, unknown>) {
    const [known] = await this.db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!known) return;
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, known.matchId, undefined, true);
      const agent = (await liveAgents(tx, match.id, true)).find((a) => a.id === known.agentId)!;
      const [cycle] = await tx.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid FOR UPDATE`;
      const reservation = cycle?.reservation as { requestId: string; amount: ArenaBudget; settled: boolean } | null;
      if (!cycle || !reservation || reservation.requestId !== requestId || reservation.settled) return;
      const audit = auditObject(cycle.requestAudit);
      const call = audit.calls.find((c) => c.requestId === requestId);
      if (call) Object.assign(call, receipt, { used, state: used ? 'settled' : 'unknown_usage', receivedAt: new Date().toISOString() });
      const agentBudget = adjust(agent.remaining, reservation.amount, used, true);
      const matchBudget = adjust(match.remaining, reservation.amount, used, true);
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET remaining=${JSON.stringify(agentBudget)}::jsonb WHERE id=${agent.id}::uuid`;
      await tx.$executeRaw`UPDATE "ArenaLiveMatch" SET remaining=${JSON.stringify(matchBudget)}::jsonb WHERE id=${match.id}::uuid`;
      const cancelledLate = used && cycle.state === 'unknown_usage' && ['arena_paused', 'arena_ended'].includes(cycle.reason ?? '');
      const knownLate = used && cycle.state === 'unknown_usage' && !cancelledLate;
      let receiptState = cycle.state;
      if (cancelledLate) receiptState = 'cancelled';
      else if (knownLate) receiptState = 'failed';
      await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestAudit"=${JSON.stringify(audit)}::jsonb,
        reservation=${JSON.stringify({ ...reservation, settled: true })}::jsonb,
        state=${receiptState},
        reason=${knownLate ? 'late_known_receipt' : cycle.reason} WHERE id=${id}::uuid`;
    });
  }
  async tool(id: string, attempt: number, input: unknown, outcome: unknown) {
    const [known] = await this.db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!known) return;
    await this.db.$transaction(async (tx) => {
      await liveMatch(tx, known.matchId, undefined, true);
      const [c] = await tx.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid FOR UPDATE`;
      if (!c || c.attempt !== attempt || c.state !== 'running') return;
      const audit = auditObject(c.requestAudit);
      audit.tools.push({ input, outcome, observedAt: new Date().toISOString() });
      await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestAudit"=${JSON.stringify(audit)}::jsonb WHERE id=${id}::uuid`;
    });
  }
  async fail(id: string, attempt: number, reason: string, detail?: string) {
    const [known] = await this.db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!known) return;
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, known.matchId, undefined, true);
      const [current] = await tx.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid FOR UPDATE`;
      if (!current || current.state !== 'running' || current.attempt !== attempt) return;
      const audit = auditObject(current.requestAudit);
      const now = new Date();
      const agent = (await liveAgents(tx, known.matchId, true)).find((a) => a.id === known.agentId)!;
      const recovery = reason === 'model_output_invalid'
        ? await planFailedResearchWakeup(tx, match, agent, id, audit, now) : null;
      audit.failure = { reason, detail: detail ?? reason, at: now.toISOString(),
        ...(recovery?.recovery ? { recovery: recovery.recovery } : {}),
        ...(recovery?.repeatedInvalidOutput ? { recoveryStopped: 'repeated_invalid_output' } : {}) };
      const state = reason === 'unknown_usage' ? 'unknown_usage' : 'failed';
      const changed = await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET state=${state},reason=${reason},
        "requestAudit"=${JSON.stringify(audit)}::jsonb,"completedAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL
        WHERE id=${id}::uuid AND state='running' AND attempt=${attempt}`;
      if (!changed) return;
      if (recovery?.account) await saveLiveAccount(tx, agent.id, recovery.account);
      const budget = ['participant_budget', 'competition_budget'].includes(reason);
      const hasAppointment = arenaLiveAccountSchema.parse(agent.account).wakeups.some((w) => !w.firedAt);
      const canWait = reason === 'model_output_invalid' ? recovery?.canContinue === true : hasAppointment;
      let agentState = 'needs_attention';
      if (budget) agentState = 'budget_exhausted';
      else if (state !== 'unknown_usage' && canWait) agentState = 'waiting';
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET state=${agentState},reason=${reason}
        WHERE id=${known.agentId}::uuid`;
    });
  }
}
