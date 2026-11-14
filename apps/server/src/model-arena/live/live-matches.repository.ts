import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  arenaCanTransition,
  arenaLiveAccountSchema,
  arenaLiveProtocolSchema,
  arenaStateSchema,
  type ArenaState,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import {
  liveAgents,
  liveMatch,
  liveSummary,
  saveLiveAccount,
  type LiveMatchRow,
  type LiveCycleRow,
  type LiveDatabase,
} from './live-storage.js';
import { arenaInitialTimeline } from '@thesis-ledger/domain';
import { liveTimeline, saveLiveTimeline } from './live-timeline.js';
import { scheduleImmediateObservation } from './live-wakeup-schedule.js';

@Injectable()
export class LiveMatchesRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async create(ownerId: string, raw: unknown) {
    const p = arenaLiveProtocolSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      const directory = await tx.instrument.findMany({
        where: { id: { in: p.instruments.map((i) => i.instrumentId) }, active: true },
        select: { id: true, canonicalCode: true, market: true, instrumentType: true },
      });
      for (const item of p.instruments) {
        const known = directory.find((i) => i.id === item.instrumentId);
        if (
          !known ||
          known.canonicalCode + '.' + known.market !== item.symbol ||
          known.instrumentType !== item.assetType
        )
          throw new BadRequestException('参赛标的与当前目录身份不一致');
      }
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO "ArenaLiveMatch" (id,"ownerId",protocol,remaining)
        VALUES (${id}::uuid,${ownerId}::uuid,${JSON.stringify(p)}::jsonb,${JSON.stringify(p.budget)}::jsonb)`;
      const account = arenaLiveAccountSchema.parse({
        revision: 0,
        cash: p.initialCash,
        positions: [],
        cashSettlements: [],
        orders: [],
        wakeups: [],
        watchedSymbols: [],
        fills: [],
      });
      for (const entrant of p.entrants) {
        await tx.$executeRaw`INSERT INTO "ArenaLiveAgent" (id,"matchId","providerId",model,account,remaining)
          VALUES (${randomUUID()}::uuid,${id}::uuid,${entrant.providerId},${entrant.model},
          ${JSON.stringify(account)}::jsonb,${JSON.stringify(entrant.budget)}::jsonb)`;
      }
      return { id, state: 'draft' as const };
    });
  }
  async list(ownerId: string) {
    const rows = await this.db.$queryRaw<LiveMatchRow[]>`SELECT * FROM "ArenaLiveMatch"
      WHERE "ownerId"=${ownerId}::uuid ORDER BY "createdAt" DESC,id LIMIT 200`;
    return rows.map(liveSummary);
  }
  async transition(ownerId: string, id: string, next: ArenaState) {
    return this.db.$transaction(async (tx) => {
      const row = await liveMatch(tx, id, ownerId, true);
      if (!arenaCanTransition(arenaStateSchema.parse(row.state), next))
        throw new ConflictException('比赛状态已变化');
      const p = arenaLiveProtocolSchema.parse(row.protocol);
      const now = new Date();
      const at = now.toISOString();
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: p.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      if (pastResumeWindow(next, row, p, day) && (await liveTimeline(tx, id))?.phase !== 'replay')
        throw new ConflictException('赛期已结束，请新建比赛');
      const initial = row.state === 'draft' ? arenaInitialTimeline(p, now) : null;
      if (initial) await saveLiveTimeline(tx, id, initial);
      const businessAt = initial?.cursorAt ?? at;
      const agents = await liveAgents(tx, id, true);
      const resuming = row.state === 'paused' && next === 'running';
      const resumeClock = resuming ? await liveTimeline(tx, id) : null;
      const resumeAt = resumeClock?.phase === 'replay' ? resumeClock.cursorAt : at;
      for (const agent of agents)
        await this.transitionAgent(tx, agent, {
          row,
          next,
          now,
          at,
          businessAt,
          resuming,
          resumeClock,
          resumeAt,
        });
      await tx.$executeRaw`UPDATE "ArenaLiveMatch" SET state=${next},
        "startedAt"=CASE WHEN "startedAt" IS NULL AND ${next}='running' THEN ${now} ELSE "startedAt" END,
        "endedAt"=CASE WHEN ${next}='ended' THEN ${now} ELSE "endedAt" END WHERE id=${id}::uuid`;
      const timeline = await liveTimeline(tx, id);
      if (next === 'paused' && timeline?.phase === 'replay' && timeline.pendingAt)
        await saveLiveTimeline(tx, id, {
          ...timeline,
          pendingAt: null,
          status: 'ready',
          reason: null,
        });
      return { id, state: next };
    });
  }

  private async transitionAgent(
    tx: LiveDatabase,
    agent: Awaited<ReturnType<typeof liveAgents>>[number],
    context: {
      row: LiveMatchRow;
      next: ArenaState;
      now: Date;
      at: string;
      businessAt: string;
      resuming: boolean;
      resumeClock: Awaited<ReturnType<typeof liveTimeline>>;
      resumeAt: string;
    },
  ) {
    const { row, next, now, at, businessAt, resuming, resumeClock, resumeAt } = context;

    const book = arenaLiveAccountSchema.parse(agent.account);
    let attentionReason =
      agent.state === 'needs_attention' ? (agent.reason ?? 'research_failed') : null;
    if (row.state === 'draft') {
      book.wakeups = [
        {
          id: randomUUID(),
          condition: { kind: 'time', at: businessAt },
          createdAt: businessAt,
          firedAt: null,
        },
      ];
    }
    if (resuming) {
      for (const order of book.orders)
        if (order.state === 'active')
          order.activeSince =
            resumeClock?.phase === 'replay' ? (resumeClock.pendingAt ?? resumeClock.cursorAt) : at;
      if (agent.state === 'waiting' && !attentionReason)
        scheduleImmediateObservation(book, resumeAt);
    }
    if (next === 'paused' || next === 'ended') {
      attentionReason = await this.stopAgentResearch(
        tx,
        agent.id,
        book,
        next,
        now,
        attentionReason,
      );
    }
    if (next === 'ended') {
      book.wakeups = [];
      for (const order of book.orders)
        if (order.state === 'active') {
          order.state = 'cancelled';
          order.reason = 'arena_ended';
        }
    }
    book.revision += 1;
    await saveLiveAccount(tx, agent.id, book);
    if (agent.state !== 'budget_exhausted')
      await tx.$executeRaw`UPDATE "ArenaLiveAgent"
          SET state=${attentionReason ? 'needs_attention' : 'waiting'},reason=${attentionReason} WHERE id=${agent.id}::uuid`;
  }
  private async stopAgentResearch(
    tx: LiveDatabase,
    agentId: string,
    book: ReturnType<typeof arenaLiveAccountSchema.parse>,
    next: ArenaState,
    now: Date,
    attentionReason: string | null,
  ) {
    const active = await tx.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle"
            WHERE "agentId"=${agentId}::uuid AND state IN ('pending','running') FOR UPDATE`;
    for (const cycle of active) {
      if (cycle.requestId) {
        attentionReason = 'request_outcome_unknown';
        continue;
      }
      // 未出站的原预约可以恢复；出站结果不明必须等待显式处理。
      const ids: unknown = JSON.parse(cycle.trigger);
      if (Array.isArray(ids))
        for (const w of book.wakeups) if (ids.includes(w.id)) w.firedAt = null;
    }
    await tx.$executeRaw`UPDATE "ArenaLiveCycle" SET
            state=CASE WHEN "requestId" IS NULL THEN 'cancelled' ELSE 'unknown_usage' END,
            reason=${'arena_' + next},"completedAt"=${now},"leaseUntil"=NULL
            WHERE "agentId"=${agentId}::uuid AND state IN ('pending','running')`;
    return attentionReason;
  }
  async trigger(ownerId: string, id: string, agentId: string) {
    return this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, id, ownerId, true);
      if (match.state !== 'running') throw new ConflictException('比赛未运行');
      const clock = await liveTimeline(tx, id);
      if (clock?.phase === 'replay' && (clock.status === 'blocked' || clock.pendingAt))
        throw new ConflictException('历史回放尚未准备好新的决策');
      const agent = (await liveAgents(tx, id, true)).find((a) => a.id === agentId);
      if (!agent) throw new NotFoundException('参赛模型不存在');
      if (agent.state !== 'waiting' && agent.state !== 'researching')
        throw new ConflictException('当前模型无法安排新的决策');
      const pending = await tx.$queryRaw<LiveCycleRow[]>`SELECT id FROM "ArenaLiveCycle"
        WHERE "agentId"=${agentId}::uuid AND state IN ('pending','running') LIMIT 1`;
      // 页面状态可能落后于研究调度；已有周期时只确认现状，不重复预约，也不报竞态 409。
      if (agent.state === 'researching' || pending.length)
        return { id: agentId, state: agent.state, appointment: 'already_in_progress' as const };
      const account = arenaLiveAccountSchema.parse(agent.account);
      const at = clock?.phase === 'replay' ? clock.cursorAt : new Date().toISOString();
      const scheduled = scheduleImmediateObservation(account, at);
      if (scheduled) {
        account.revision++;
        await saveLiveAccount(tx, agentId, account);
      }
      return {
        id: agentId,
        state: 'waiting' as const,
        appointment: scheduled ? ('scheduled' as const) : ('already_scheduled' as const),
      };
    });
  }
  async retry(ownerId: string, id: string, agentId: string) {
    return this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, id, ownerId, true);
      if (match.state !== 'running') throw new ConflictException('比赛未运行');
      const agent = (await liveAgents(tx, id, true)).find((a) => a.id === agentId);
      if (!agent || agent.state !== 'needs_attention')
        throw new ConflictException('参赛者当前无需重试');
      const active = await tx.$queryRaw<
        LiveCycleRow[]
      >`SELECT id FROM "ArenaLiveCycle" WHERE "agentId"=${agentId}::uuid AND state IN ('pending','running')`;
      if (active.length) throw new ConflictException('研究正在执行');
      const timeline = await liveTimeline(tx, id);
      const book = arenaLiveAccountSchema.parse(agent.account),
        at =
          timeline?.phase === 'replay'
            ? (timeline.pendingAt ?? timeline.cursorAt)
            : new Date().toISOString();
      book.wakeups = [
        { id: randomUUID(), condition: { kind: 'time', at }, createdAt: at, firedAt: null },
      ];
      book.revision++;
      await saveLiveAccount(tx, agentId, book);
      if (timeline?.phase === 'replay')
        await saveLiveTimeline(tx, id, {
          ...timeline,
          status: 'ready',
          pendingAt: null,
          reason: null,
        });
      await tx.$executeRaw`UPDATE "ArenaLiveAgent" SET state='waiting',reason=NULL WHERE id=${agentId}::uuid`;
      return { id: agentId, state: 'waiting' as const };
    });
  }
  async retryReplay(ownerId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, id, ownerId, true),
        clock = await liveTimeline(tx, id);
      if (match.state !== 'running' || clock?.phase !== 'replay' || clock.status !== 'blocked')
        throw new ConflictException('回放当前无需重试');
      const active = await tx.$queryRaw<
        LiveCycleRow[]
      >`SELECT id FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state IN ('pending','running')`;
      if (
        active.length ||
        (await liveAgents(tx, id, true)).some(
          (a) => a.state === 'needs_attention' || a.state === 'budget_exhausted',
        )
      )
        throw new ConflictException('请先在模型账户处理研究状态与额度');
      await saveLiveTimeline(tx, id, { ...clock, status: 'ready', reason: null });
      return { id, state: 'running' as const };
    });
  }
}

function pastResumeWindow(
  next: ArenaState,
  row: LiveMatchRow,
  p: ReturnType<typeof arenaLiveProtocolSchema.parse>,
  day: string,
) {
  return Boolean(next === 'running' && row.state !== 'draft' && p.endsOn && day > p.endsOn);
}
