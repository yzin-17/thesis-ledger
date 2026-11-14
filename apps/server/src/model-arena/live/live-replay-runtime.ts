import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  arenaAccountNav,
  arenaCommonMarks,
  arenaDueWakeups,
  arenaEqualWeightBook,
  arenaMatchOrders,
  DecimalValue,
  marketCivilInstant,
} from '@thesis-ledger/domain';
import {
  arenaLiveAccountSchema,
  arenaLiveFrameSchema,
  arenaLiveProtocolSchema,
  type ArenaLiveAccount,
  type ArenaLiveProtocol,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import {
  MarketArenaReplayReader,
  type ArenaReplayObservation,
} from '../../market/market-arena-replay-reader.js';
import {
  liveAgents,
  liveMatch,
  saveLiveAccount,
  type LiveCycleRow,
  type LiveDatabase,
} from './live-storage.js';
import { liveTimeline, saveLiveTimeline } from './live-timeline.js';
import { LiveMatchesRepository } from './live-matches.repository.js';

@Injectable()
export class LiveReplayRuntime {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(MarketArenaReplayReader)
    private readonly reader: Pick<MarketArenaReplayReader, 'next' | 'observe'>,
    @Inject(LiveMatchesRepository)
    private readonly matches: Pick<LiveMatchesRepository, 'transition'>,
  ) {}
  async reconcile(id: string, now = new Date()) {
    const started = Date.now();
    let handled = false;
    // 空闲历史观察有界批量推进；研究屏障、暂停和来源失败立即结束本批。
    for (let count = 0; count < 64; count++) {
      const before = await liveTimeline(this.db, id);
      handled = await this.step(id, now);
      const after = await liveTimeline(this.db, id);
      if (
        !handled ||
        before?.pendingAt ||
        after?.phase !== 'replay' ||
        after.status !== 'ready' ||
        after.pendingAt ||
        after.cursorAt === before?.cursorAt ||
        Date.now() - started >= 1000
      )
        break;
    }
    return handled;
  }
  private async step(id: string, now: Date) {
    const match = await liveMatch(this.db, id),
      clock = await liveTimeline(this.db, id);
    if (!clock || clock.phase !== 'replay') return false;
    if (match.state !== 'running' || clock.status === 'blocked') return true;
    const p = arenaLiveProtocolSchema.parse(match.protocol);
    await this.initial(id, p, clock.originAt);
    if (
      !clock.pendingAt &&
      (await liveAgents(this.db, id)).some(
        (a) => a.state === 'needs_attention' || a.state === 'budget_exhausted',
      )
    ) {
      await this.db.$transaction(async (tx) => {
        const current = await liveMatch(tx, id, undefined, true),
          latest = await liveTimeline(tx, id);
        if (current.state === 'running' && latest?.phase === 'replay' && !latest.pendingAt)
          await saveLiveTimeline(tx, id, {
            ...latest,
            status: 'blocked',
            reason: 'replay_research_attention',
          });
      });
      return true;
    }
    if (clock.pendingAt) {
      await this.db.$transaction(async (tx) => {
        const current = await liveMatch(tx, id, undefined, true),
          timeline = await liveTimeline(tx, id);
        if (current.state !== 'running' || timeline?.pendingAt !== clock.pendingAt) return;
        const active = await tx.$queryRaw<
          LiveCycleRow[]
        >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state IN ('pending','running')`;
        if (active.length) return;
        const agents = await liveAgents(tx, id, true);
        const attention = agents.some(
          (a) => a.state === 'needs_attention' || a.state === 'budget_exhausted',
        );
        await saveLiveTimeline(tx, id, {
          ...timeline,
          status: attention ? 'blocked' : 'ready',
          cursorAt: attention ? timeline.cursorAt : timeline.pendingAt!,
          pendingAt: attention ? timeline.pendingAt : null,
          reason: attention ? 'replay_research_attention' : null,
        });
      });
      return true;
    }
    const end = replayEnd(p);

    if (Date.parse(clock.cursorAt) >= Math.min(now.getTime() - 60000, end)) {
      if (Date.parse(clock.cursorAt) >= end)
        await this.matches.transition(match.ownerId, id, 'ended');
      else
        await this.db.$transaction(async (tx) => {
          const current = await liveMatch(tx, id, undefined, true),
            latest = await liveTimeline(tx, id);
          if (
            current.state === 'running' &&
            latest?.status === 'ready' &&
            latest.cursorAt === clock.cursorAt
          )
            await saveLiveTimeline(tx, id, { ...latest, phase: 'live' });
        });
      return true;
    }
    try {
      const target = new Date(Math.min(end, now.getTime())).toISOString();
      const at = await this.reader.next(p, clock.cursorAt, target);
      if (Date.parse(at) <= Date.parse(clock.cursorAt) || Date.parse(at) > Date.parse(target))
        throw new Error('replay_source_unavailable');
      const books = (await liveAgents(this.db, id)).map((a) =>
        arenaLiveAccountSchema.parse(a.account),
      );
      const benchmarkSymbols = p.benchmarks.includes('equal_weight_buy_hold')
        ? p.instruments.map((i) => i.symbol)
        : [];
      const symbols = [
        ...new Set([
          ...benchmarkSymbols,
          ...books.flatMap((b) => [
            ...b.watchedSymbols,
            ...b.positions.map((s) => s.symbol),
            ...b.orders.filter((o) => o.state === 'active').map((o) => o.symbol),
            ...b.wakeups.flatMap((w) =>
              !w.firedAt && w.condition.kind !== 'time' && w.condition.symbol
                ? [w.condition.symbol]
                : [],
            ),
          ]),
        ]),
      ];
      const executionSymbols = [
        ...benchmarkSymbols,
        ...books.flatMap((b) => b.orders.filter((o) => o.state === 'active').map((o) => o.symbol)),
      ];
      const observation = await this.reader.observe(
        p,
        at,
        symbols,
        books.flatMap((b) => b.positions),
        executionSymbols,
      );
      if (
        observation.at !== at ||
        observation.context.at !== at ||
        [...observation.context.quotes, ...(observation.observations ?? [])].some(
          (q) =>
            Date.parse(q.marketTime) > Date.parse(at) || Date.parse(q.observedAt) > Date.parse(at),
        )
      )
        throw new Error('replay_source_unavailable');
      await this.apply(id, p, clock.cursorAt, observation);
    } catch (error) {
      const reason =
        error instanceof Error &&
        /^replay_(calendar|prices|rules|tools|universe)_unavailable$/.test(error.message)
          ? error.message
          : 'replay_source_unavailable';
      await this.db.$transaction(async (tx) => {
        const current = await liveMatch(tx, id, undefined, true),
          latest = await liveTimeline(tx, id);
        if (current.state === 'running' && latest?.cursorAt === clock.cursorAt && !latest.pendingAt)
          await saveLiveTimeline(tx, id, { ...latest, status: 'blocked', reason });
      });
    }
    return true;
  }
  private async initial(id: string, p: ArenaLiveProtocol, at: string) {
    await this.db.$transaction(async (tx) => {
      await liveMatch(tx, id, undefined, true);
      const agents = await liveAgents(tx, id);
      const marks = agents.map((a) => ({
        agentId: a.id,
        nav: p.initialCash,
        returnRatio: '0',
        peakNav: p.initialCash,
        drawdown: '0',
        rank: 1,
        complete: true,
        reason: null,
      }));
      const frame = arenaLiveFrameSchema.parse({
        at,
        marketTime: null,
        complete: true,
        reason: null,
        marks,
        benchmarks: p.benchmarks.map((baseline) => ({
          id: baseline,
          nav: p.initialCash,
          returnRatio: '0',
        })),
      });
      await this.frame(tx, id, frame, { kind: 'initial_capital' });
    });
  }
  private async apply(
    id: string,
    p: ArenaLiveProtocol,
    cursorAt: string,
    observed: ArenaReplayObservation,
  ) {
    await this.db.$transaction(async (tx) => {
      const match = await liveMatch(tx, id, undefined, true),
        clock = await liveTimeline(tx, id);
      if (
        match.state !== 'running' ||
        clock?.phase !== 'replay' ||
        clock.status !== 'ready' ||
        clock.cursorAt !== cursorAt ||
        clock.pendingAt
      )
        return;
      const agents = await liveAgents(tx, id, true);
      const [previous] = await tx.$queryRaw<
        { frame: unknown; evidence: unknown }[]
      >`SELECT frame,evidence FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid ORDER BY at DESC LIMIT 1`;
      const old = previous ? arenaLiveFrameSchema.parse(previous.frame) : null;
      let pending = false;
      const accounts = agents.map((agent) => {
        const book = arenaLiveAccountSchema.parse(agent.account);
        return {
          ...agent,
          account: arenaLiveAccountSchema.parse(
            arenaMatchOrders(book, observed.context, observed.session.state === 'open'),
          ),
        };
      });
      for (const agent of accounts)
        pending = (await this.advanceReplayAgent(tx, id, agent, observed)) || pending;
      const { marks, basket, basketNav, complete } = replayCommonValuation(
        accounts,
        p,
        old,
        previous,
        observed,
      );
      await this.frame(
        tx,
        id,
        arenaLiveFrameSchema.parse({
          at: observed.at,
          marketTime: observed.at,
          complete,
          reason: complete ? null : 'common_valuation_incomplete',
          marks,
          benchmarks: p.benchmarks.map((baselineId) => {
            const nav = baselineId === 'cash' ? p.initialCash : basketNav;
            return {
              id: baselineId,
              nav,
              returnRatio: nav
                ? DecimalValue.from(nav).dividedBy(p.initialCash).minus('1').toString()
                : null,
            };
          }),
        }),
        { ...observed.evidence, benchmarkAccount: basket },
      );
      await saveLiveTimeline(tx, id, {
        ...clock,
        cursorAt: pending ? cursorAt : observed.at,
        pendingAt: pending ? observed.at : null,
        status: pending ? 'research' : 'ready',
        reason: null,
      });
    });
  }

  private async advanceReplayAgent(
    tx: LiveDatabase,
    id: string,
    agent: Pick<Awaited<ReturnType<typeof liveAgents>>[number], 'id' | 'state'> & {
      account: ArenaLiveAccount;
    },
    observed: ArenaReplayObservation,
  ) {
    let pending = false;

    const book = agent.account;
    for (const order of book.orders)
      if (order.state === 'active' && Date.parse(order.expiresAt) <= Date.parse(observed.at)) {
        order.state = 'expired';
        order.reason = 'order_expired';
        book.revision++;
      }
    if (agent.state === 'waiting' && observed.session.state === 'open') {
      const fired = arenaDueWakeups(
        book.wakeups,
        observed.observations ?? observed.context.quotes,
        book.fills,
        observed.at,
      );
      if (fired.length) {
        for (const wakeup of book.wakeups)
          if (fired.includes(wakeup.id)) wakeup.firedAt = observed.at;
        await tx.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision")
              VALUES (${randomUUID()}::uuid,${id}::uuid,${agent.id}::uuid,${JSON.stringify(fired)},${book.revision})`;
        pending = true;
      }
    }
    await saveLiveAccount(tx, agent.id, book);

    return pending;
  }
  private frame(tx: LiveDatabase, id: string, frame: unknown, evidence: unknown) {
    const value = arenaLiveFrameSchema.parse(frame);
    return tx.$executeRaw`INSERT INTO "ArenaLiveValuation" (id,"matchId",at,frame,evidence)
      VALUES (${randomUUID()}::uuid,${id}::uuid,${new Date(value.at)},${JSON.stringify(value)}::jsonb,${JSON.stringify(evidence)}::jsonb)
      ON CONFLICT ("matchId",at) DO NOTHING`;
  }
}

function replayEnd(p: ArenaLiveProtocol) {
  return p.endsOn
    ? Date.parse(
        marketCivilInstant(
          new Date(Date.parse(p.endsOn + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10),
          0,
          p.timeZone,
        ),
      ) - 1
    : Infinity;
}

function replayBenchmarkAccount(
  previous: { evidence: unknown } | undefined,
  p: ArenaLiveProtocol,
  observed: ArenaReplayObservation,
) {
  const baseline = (previous?.evidence as { benchmarkAccount?: ArenaLiveAccount } | undefined)
    ?.benchmarkAccount;
  const basket =
    baseline ??
    (p.benchmarks.includes('equal_weight_buy_hold') && observed.session.state === 'open'
      ? arenaEqualWeightBook(
          p.initialCash,
          p.maxPositionBps,
          observed.context.quotes,
          p.fees,
          observed.at,
          randomUUID,
        )
      : null);

  return basket;
}

function replayCommonValuation(
  accounts: { id: string; account: ArenaLiveAccount }[],
  p: ArenaLiveProtocol,
  old: ReturnType<typeof arenaLiveFrameSchema.parse> | null,
  previous: { evidence: unknown } | undefined,
  observed: ArenaReplayObservation,
) {
  const marks = arenaCommonMarks(accounts, observed.prices, p.initialCash, old?.marks ?? []);
  const basket = replayBenchmarkAccount(previous, p, observed);
  const basketNav = basket ? arenaAccountNav(basket, observed.prices) : null;
  const complete =
    marks.every((m) => m.complete) &&
    (!p.benchmarks.includes('equal_weight_buy_hold') || basketNav !== null);
  if (!complete) for (const mark of marks) mark.rank = null;

  return { marks, basket, basketNav, complete };
}
