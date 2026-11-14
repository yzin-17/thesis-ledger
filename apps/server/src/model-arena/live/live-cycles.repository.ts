import { Inject, Injectable } from '@nestjs/common';
import { arenaLiveAccountSchema, arenaLiveProtocolSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { liveAgents, liveMatch, type LiveCycleRow } from './live-storage.js';
import { liveResearchLeaseMs } from './live-research-control.js';
import { liveTimeline } from './live-timeline.js';

@Injectable()
export class LiveCyclesRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  pending() {
    return this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT c.* FROM "ArenaLiveCycle" c JOIN "ArenaLiveMatch" m ON m.id=c."matchId"
      WHERE c.state='pending' AND m.state='running' ORDER BY c."createdAt" LIMIT 100`;
  }
  async claim(
    id: string,
    attempt: number,
    now = new Date(),
    sessionEnd?: Date,
    replayAt?: string,
    marketSession?: {
      state: 'open' | 'closed' | 'unknown';
      date: string | null;
      reason: string | null;
    },
  ) {
    const [known] = await this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!known) return null;
    return this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, known.matchId, undefined, true);
      const p = arenaLiveProtocolSchema.parse(match.protocol);
      if (match.state !== 'running' || attempt > p.maxInfrastructureAttempts) return null;
      const clock = await liveTimeline(tx, match.id);
      if (!matchesReplayClaim(clock, replayAt)) return null;
      const [cycle] = await tx.$queryRaw<
        LiveCycleRow[]
      >`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid FOR UPDATE`;
      if (!cycle || cycle.state !== 'pending' || cycle.attempt !== attempt - 1 || cycle.requestId)
        return null;
      const agents = await liveAgents(tx, match.id, true);
      const agent = agents.find((a) => a.id === cycle.agentId)!;
      const account = arenaLiveAccountSchema.parse(agent.account);
      const deadline =
        p.resources.maxCycleSeconds === null
          ? null
          : new Date(
              Math.min(
                now.getTime() + p.resources.maxCycleSeconds * 1000,
                sessionEnd?.getTime() ?? Infinity,
              ),
            );
      if (deadline && deadline <= now) return null;
      const lease = new Date(
        Math.min(now.getTime() + liveResearchLeaseMs, deadline?.getTime() ?? Infinity),
      );
      const input = {
        account,
        protocol: p,
        asOf: replayAt ?? now.toISOString(),
        replay: Boolean(replayAt),
        ...(marketSession ? { marketSession } : {}),
      };
      await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET state='running',attempt=${attempt},reason=NULL,
        "bookRevision"=${account.revision},"leaseUntil"=${lease},"deadlineAt"=${deadline},
        input=${JSON.stringify(input)}::jsonb
        WHERE id=${id}::uuid AND state='pending' AND attempt=${attempt - 1}`;
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET state='researching',reason=NULL WHERE id=${agent.id}::uuid`;
      return {
        ...cycle,
        state: 'running',
        attempt,
        bookRevision: account.revision,
        leaseUntil: lease,
        deadlineAt: deadline,
        input,
        match,
        agent,
      };
    });
  }
  async recover(now = new Date()) {
    const expired = await this.db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle"
      WHERE state='running' AND "leaseUntil"<=${now} ORDER BY "leaseUntil" LIMIT 100`;
    for (const known of expired)
      await this.db.$transaction(async (tx) => {
        const match = await liveMatch(tx, known.matchId, undefined, true);
        const p = arenaLiveProtocolSchema.parse(match.protocol);
        const [cycle] = await tx.$queryRaw<
          LiveCycleRow[]
        >`SELECT * FROM "ArenaLiveCycle" WHERE id=${known.id}::uuid FOR UPDATE`;
        if (
          !cycle ||
          cycle.state !== 'running' ||
          cycle.attempt !== known.attempt ||
          !cycle.leaseUntil ||
          cycle.leaseUntil > now
        )
          return;
        let state = 'pending';
        let reason = 'lease_expired';
        if (cycle.requestId) {
          state = 'unknown_usage';
          reason = 'request_outcome_unknown';
        } else if (cycle.attempt >= p.maxInfrastructureAttempts || match.state !== 'running') {
          state = 'failed';
          reason = 'infrastructure_attempts_exhausted';
        }
        await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET state=${state},reason=${reason},"leaseUntil"=NULL,
        "completedAt"=CASE WHEN ${state}='pending' THEN NULL ELSE ${now} END WHERE id=${cycle.id}::uuid`;
        await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET state=${state === 'pending' ? 'waiting' : 'needs_attention'},reason=${reason}
        WHERE id=${cycle.agentId}::uuid`;
      });
  }
  async deliveryFailed(id: string, expectedAttempt: number) {
    const [cycle] = await this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!cycle) return;
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, cycle.matchId, undefined, true);
      const p = arenaLiveProtocolSchema.parse(match.protocol);
      const state = expectedAttempt >= p.maxInfrastructureAttempts ? 'failed' : 'pending';
      const changed =
        await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET state=${state},attempt=${expectedAttempt},
        reason='delivery_ended_before_claim',"completedAt"=CASE WHEN ${state}='failed' THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id=${id}::uuid AND state='pending' AND attempt=${expectedAttempt - 1}`;
      if (changed && state === 'failed')
        await tx.$executeRaw`UPDATE "ArenaLiveAgent"
        SET state='needs_attention',reason='infrastructure_attempts_exhausted' WHERE id=${cycle.agentId}::uuid`;
    });
  }
}

function matchesReplayClaim(clock: Awaited<ReturnType<typeof liveTimeline>>, replayAt?: string) {
  return !(
    (clock?.phase === 'replay' && (clock.status !== 'research' || clock.pendingAt !== replayAt)) ||
    (replayAt && clock?.phase !== 'replay')
  );
}
