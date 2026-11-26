import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { arenaExpireOrders, arenaMatchOrders, arenaSubmitDecision } from '@thesis-ledger/domain';
import {
  arenaLiveAccountSchema,
  arenaLiveDecisionSchema,
  arenaLiveProtocolSchema,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { LiveExecutionContext } from './live-execution-context.js';
import { liveAgents, liveMatch, saveLiveAccount, type LiveCycleRow } from './live-storage.js';
import { liveTimeline } from './live-timeline.js';
import { liveOrderCommand } from './live-order-identities.js';

@Injectable()
export class LiveOrdersRepository {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LiveExecutionContext) private readonly execution: Pick<LiveExecutionContext, 'build'>,
  ) {}
  async submit(cycleId: string, attempt: number, raw: unknown) {
    const decision = arenaLiveDecisionSchema.parse(raw);
    const [known] = await this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid`;
    if (!known) throw new ConflictException('研究周期不存在');
    const match = await liveMatch(this.db, known.matchId);
    const p = arenaLiveProtocolSchema.parse(match.protocol);
    const observed = (await liveAgents(this.db, match.id)).find((a) => a.id === known.agentId)!;
    const frozen = known.input as { replay?: boolean; asOf?: string } | null;
    const replayAt = frozen?.replay ? frozen.asOf : undefined;
    const prepared = await this.execution.build(
      p,
      [arenaLiveAccountSchema.parse(observed.account)],
      decision,
      [],
      replayAt,
    );
    return this.db.$transaction(async (tx) => {
      const current = await liveMatch(tx, match.id, undefined, true);
      const agents = await liveAgents(tx, match.id, true);
      const [cycle] = await tx.$queryRaw<
        LiveCycleRow[]
      >`SELECT * FROM "ArenaLiveCycle" WHERE id=${cycleId}::uuid FOR UPDATE`;
      if (current.state !== 'running' || !activeOrderSubmissionCycle(cycle, attempt))
        throw new ConflictException('cycle_not_active');
      const agent = agents.find((a) => a.id === cycle.agentId)!;
      const account = arenaLiveAccountSchema.parse(agent.account);
      const clock = await liveTimeline(tx, match.id);
      if (
        replayAt &&
        (clock?.phase !== 'replay' || clock.pendingAt !== replayAt || clock.status !== 'research')
      )
        throw new ConflictException('cycle_not_active');
      const now = replayAt ? new Date(replayAt) : new Date();
      const open =
        prepared.session.state === 'open' &&
        prepared.session.sessions.some(
          (s) => Date.parse(s.startAt) <= now.getTime() && Date.parse(s.endAt) > now.getTime(),
        );
      if (decision.orders.length && !open) throw new ConflictException('market_closed');
      const command = liveOrderCommand(cycleId, decision);
      const next = arenaSubmitDecision(account, cycle.bookRevision, command, {
        ...prepared.context,
        at: now.toISOString(),
        quotes: prepared.context.quotes.filter(
          (q) => now.getTime() - Date.parse(q.marketTime) <= p.resources.maxQuoteAgeSeconds * 1000,
        ),
      });
      if (replayAt)
        for (const order of next.orders)
          if (order.createdAt === replayAt)
            order.activeSince = new Date(Date.parse(replayAt) + 1).toISOString();
      await saveLiveAccount(tx, agent.id, next);
      await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET state='succeeded',decision=${JSON.stringify(decision)}::jsonb,
        "completedAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL WHERE id=${cycleId}::uuid AND state='running' AND attempt=${attempt}`;
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET state='waiting',reason=NULL WHERE id=${agent.id}::uuid`;
      return next;
    });
  }
  async match(id: string) {
    if ((await liveTimeline(this.db, id))?.phase === 'replay') return;
    const match = await liveMatch(this.db, id);
    if (match.state !== 'running') return;
    const p = arenaLiveProtocolSchema.parse(match.protocol);
    const observed = await liveAgents(this.db, id);
    const prepared = await this.execution.build(
      p,
      observed.map((a) => arenaLiveAccountSchema.parse(a.account)),
    );
    if (prepared.session.state !== 'open') return;
    await this.db.$transaction(async (tx) => {
      const current = await liveMatch(tx, id, undefined, true);
      if (current.state !== 'running') return;
      const now = new Date();
      if (
        !prepared.session.sessions.some(
          (s) => Date.parse(s.startAt) <= now.getTime() && Date.parse(s.endAt) > now.getTime(),
        )
      )
        return;
      const context = {
        ...prepared.context,
        at: now.toISOString(),
        quotes: prepared.context.quotes.filter(
          (q) => now.getTime() - Date.parse(q.marketTime) <= p.resources.maxQuoteAgeSeconds * 1000,
        ),
      };
      for (const agent of await liveAgents(tx, id, true)) {
        const book = arenaLiveAccountSchema.parse(agent.account);
        const next = arenaMatchOrders(book, context, true);
        if (next.revision !== book.revision) await saveLiveAccount(tx, agent.id, next);
      }
    });
  }
  async expire(id: string, now = new Date()) {
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, id, undefined, true);
      if ((await liveTimeline(tx, id))?.phase === 'replay') return;
      if (match.state !== 'running') return;
      for (const agent of await liveAgents(tx, id, true)) {
        const book = arenaLiveAccountSchema.parse(agent.account);
        const next = arenaExpireOrders(book, now.toISOString());
        if (next.revision !== book.revision) await saveLiveAccount(tx, agent.id, next);
      }
    });
  }
}

function activeOrderSubmissionCycle(
  cycle: LiveCycleRow | undefined,
  attempt: number,
): cycle is LiveCycleRow {
  return !(
    !cycle ||
    cycle.state !== 'running' ||
    cycle.attempt !== attempt ||
    !cycle.requestId ||
    !cycle.leaseUntil ||
    cycle.leaseUntil.getTime() <= Date.now() ||
    (cycle.deadlineAt && cycle.deadlineAt.getTime() <= Date.now())
  );
}
