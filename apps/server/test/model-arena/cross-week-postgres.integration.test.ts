import { releaseArenaFixture } from './fixture-cleanup.js';
import { ArenaWeekStore } from '../../src/model-arena/arena-week-store.js';
import { ArenaWeekProjector } from '../../src/model-arena/arena-week-project.js';
import { ArenaWeekWorker } from '../../src/model-arena/arena-week-worker.js';
import { RedisService } from '../../src/platform/redis.service.js';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ArenaComparisons } from '../../src/model-arena/arena-comparison.js';
import { ArenaResearchPackets } from '../../src/model-arena/arena-research-packets.js';
import type { MarketInstrumentEvidence } from '../../src/market/market-instrument-evidence.js';
import { ArenaRoundReports } from '../../src/model-arena/arena-round-report.js';
import { ModelArenaRepository } from '../../src/model-arena/model-arena.repository.js';
const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/journal_review_fixture')
)
  throw Error('需要隔离数据库');
it.skipIf(!url)(
  '两模型跨周，周五封存、周一成交，额度未开轮仍冻结持仓，单方失败单独计数',
  async () => {
    const db = new PrismaService({ datasourceUrl: url! });
    const owner = randomUUID();
    try {
      const context = await crossWeekMatch(db, owner);
      const { symbol, friday, monday, tuesday, close, open, match, entrants } = context;
      let firstRound = '';
      for (const [day, next] of [
        [friday, monday],
        [monday, tuesday],
        [tuesday, '2026-11-04'],
      ] as const) {
        const roundId = await crossWeekRound(context, day, next);
        if (roundId) firstRound = roundId;
      }
      const compare = new ArenaComparisons(db);
      const first = await compare.read(
        owner,
        match.id,
        { start: friday, end: friday },
        close(friday),
      );
      const second = await compare.read(
        owner,
        match.id,
        { start: monday, end: tuesday },
        close(tuesday),
      );
      expect(first.rows[0]?.metrics.tradeFees).toBe('0');
      expect(second).toMatchObject({ planned: 2, opened: 1 });
      expect(second.rows.find((r) => r.id === entrants[0]!.id)).toMatchObject({
        decisions: 1,
        rank: 1,
        metrics: { startNav: '1000', endNav: '1039', tradeFees: '1', returnRatio: '0.039' },
      });
      expect(second.rows.find((r) => r.id === entrants[1]!.id)).toMatchObject({
        decisions: 0,
        rank: 2,
      });
      expect(second.rows.find((r) => r.id === 'equal_weight')?.metrics.endNav).toBe('1197');
      expect(
        (await compare.read(owner, match.id, { start: monday, end: monday }, close(monday))).opened,
      ).toBe(0);
      const evidence = await new ArenaRoundReports(db).read(owner, match.id, firstRound);
      expect(
        evidence.entries.find((r) => r.entrantId === entrants[0]!.id)?.fills[0]?.executedAt,
      ).toBe(open(monday).toISOString());
      const reports = new ArenaRoundReports(db);
      const query = { symbol, start: monday, end: tuesday };
      expect(await reports.points(owner, match.id, query)).toMatchObject([
        { roundId: firstRound, symbol, side: 'buy', quantity: '20' },
      ]);
      expect(
        await reports.points(owner, match.id, { ...query, entrantId: entrants[1]!.id }),
      ).toEqual([]);
      await expect(reports.points(randomUUID(), match.id, query)).rejects.toThrow(
        '比赛或模型不存在',
      );
      const projector = new ArenaWeekProjector(db, compare);
      const weeks = new ArenaWeekStore(db, projector);
      await weeks.discover(new Date('2026-11-05T12:00:00Z'));
      const jobs = await db.arenaWeek.findMany({
        where: { arenaId: match.id },
        orderBy: { week: 'asc' },
      });
      expect(jobs.length).toBe(2);
      if (process.env.ARENA_QUEUE_TEST_SCOPE) {
        const redis = new RedisService();
        const worker = new ArenaWeekWorker(db, redis, weeks);
        try {
          worker.start();
          await expect
            .poll(() => weeks.list(owner, match.id).then((r) => r.length), { timeout: 8000 })
            .toBe(2);
        } finally {
          await worker.onModuleDestroy();
          await redis.onModuleDestroy();
        }
      } else {
        await Promise.all(jobs.map((j) => weeks.execute({ id: j.id, attempt: 1 })));
      }
      const published = await weeks.list(owner, match.id);
      const original = published.find((r) => r.week === friday || r.week === '2026-10-26')!;
      const next = published.find((r) => r.week === monday)!;
      expect((await weeks.read(owner, match.id, original.id)).report.fills).toHaveLength(0);
      const secondReport = await weeks.read(owner, match.id, next.id);
      expect(
        secondReport.report.attribution.find((a) => a.entrantId === entrants[0]!.id),
      ).toMatchObject({ symbols: [{ symbol, amount: '40' }], fees: '1', residual: '0' });
      expect(
        (await weeks.read(owner, match.id, original.id)).report.observations.every(
          (o) => o.state === 'pending',
        ),
      ).toBe(true);
      expect(secondReport.report.fills[0]?.roundId).toBe(firstRound);
      expect(secondReport.report.comparison.rows).toEqual(second.rows);
      await weeks.revise(owner, match.id, next.id);
      await Promise.all([
        weeks.execute({ id: jobs[1]!.id, attempt: 2 }),
        weeks.execute({ id: jobs[1]!.id, attempt: 2 }),
      ]);
      expect(await weeks.list(owner, match.id)).toHaveLength(2);
      vi.spyOn(projector, 'build').mockResolvedValueOnce({
        ...secondReport.report,
        calendarVersion: 'controlled-correction',
      });
      await weeks.revise(owner, match.id, next.id);
      await weeks.execute({ id: jobs[1]!.id, attempt: 3 });
      const amended = (await weeks.list(owner, match.id)).find((r) => r.revision === 2);
      expect(amended?.id).toBeTruthy();
      expect((await weeks.read(owner, match.id, next.id)).digest).toEqual(secondReport.digest);
      expect((await weeks.read(owner, match.id, amended!.id)).digest).not.toEqual(
        secondReport.digest,
      );
      await expect(weeks.read(randomUUID(), match.id, next.id)).rejects.toThrow('周报不存在');
      await expect(compare.read(randomUUID(), match.id, {})).rejects.toThrow('比赛不存在');
    } finally {
      await releaseArenaFixture(db, owner);
      await db.$disconnect();
    }
  },
);

async function crossWeekMatch(db: PrismaService, owner: string) {
  const instrumentId = randomUUID(),
    symbol = '001937.SZ';
  const friday = '2026-10-30',
    monday = '2026-11-02',
    tuesday = '2026-11-03';
  const close = (d: string) => new Date(d + 'T07:01:00Z'),
    open = (d: string) => new Date(d + 'T01:30:00Z');
  await db.instrument.create({
    data: {
      id: instrumentId,
      canonicalCode: '001937',
      market: 'SZ',
      instrumentType: 'STOCK',
      displayName: '跨周样本',
      generation: 1,
    },
  });
  const budget = { requests: 10, tokens: 10000, costMicros: 200 };
  const store = new ModelArenaRepository(db);
  const match = await store.create(owner, {
    version: 'arena-historical-match-protocol-v1',
    title: '跨周样本',
    market: 'CN',
    currency: 'CNY',
    calendarId: 'CN',
    calendarVersion: 'fixture',
    timeZone: 'Asia/Shanghai',
    startsOn: friday,
    endsOn: tuesday,
    instruments: [{ instrumentId, symbol, assetType: 'STOCK' }],
    entrants: ['甲', '乙'].map((model) => ({
      providerId: 'fixture',
      model,
      budget,
      maxInputTokens: 120,
      maxOutputTokens: 20,
    })),
    initialCash: '1000',
    maxPositionBps: 10000,
    fees: { version: 'fixture', buyBps: 0, sellBps: 0, minimum: '1', slippageBps: 0 },
    benchmarks: ['cash', 'equal_weight_buy_hold'],
    decisionDeadlineMinutes: 60,
    maxInfrastructureAttempts: 2,
    budgetCurrency: 'USD',
    budget,
  });
  await db.modelArena.update({ where: { id: match.id }, data: { state: 'running' } });
  const entrants = (await store.read(owner, match.id)).entrants.sort((a, b) => {
    if (a.model === '甲') return -1;
    if (b.model === '甲') return 1;
    return 0;
  });
  const packets = new ArenaResearchPackets(db, {
    read: async (_: unknown, day: string) => [
      {
        symbol,
        kind: 'daily_bar',
        date: day,
        availableAt: close(day).toISOString(),
        observedAt: close(day).toISOString(),
        open: '10',
        close: day === friday ? '10' : '12',
        ref: 'bar:' + day,
      },
    ],
  } as unknown as MarketInstrumentEvidence);

  return { db, symbol, friday, monday, tuesday, close, open, budget, match, entrants, packets };
}
async function crossWeekRound(
  context: Awaited<ReturnType<typeof crossWeekMatch>>,
  day: string,
  next: string,
) {
  const { db, symbol, friday, monday, tuesday, close, open, budget, match, entrants, packets } =
    context;

  await db.arenaOccurrence.create({
    data: {
      arenaId: match.id,
      tradingDate: day,
      dueAt: close(day),
      nextOpenAt: open(next),
      deadlineAt: open(next),
      calendarRevision: 'fixture',
      maxAttempts: 2,
      state: 'complete',
    },
  });
  const outcome =
    day === monday
      ? { state: 'unopened', reason: 'participant_budget', entrantId: entrants[0]!.id }
      : { state: 'open' };
  const round = await db.arenaRound.create({
    data: {
      arenaId: match.id,
      tradingDate: day,
      createdAt: close(day),
      corporateActionCoverage: { [symbol]: ['cash', 'split'] },
      outcome,
      ...(day === friday
        ? {
            openingFacts: {
              facts: [
                {
                  symbol,
                  openAt: open(monday).toISOString(),
                  price: '10',
                  lot: '1',
                  tick: '0.01',
                  sellable: '0',
                  buyBlocked: null,
                  sellBlocked: null,
                  sourceRef: 'open:mon',
                },
              ],
            },
          }
        : {}),
    },
  });
  if (day !== monday)
    for (const e of entrants)
      await db.arenaReservation.create({
        data: { roundId: round.id, arenaId: match.id, entrantId: e.id, amount: budget },
      });
  await packets.freeze(round.id);
  if (day === monday) return null;
  await db.arenaRound.update({
    where: { id: round.id },
    data: { outcome: { state: 'sealed' } },
  });
  for (const [i, e] of entrants.entries()) {
    const state = crossWeekDecisionState(day, friday, i);
    const action = i === 1 ? 'observe' : 'target';
    const decision = {
      actions: [
        {
          symbol,
          action,
          ...(action === 'target' && { weightBps: 2000 }),
          reason: '固定输入',
          invalidatedBy: '风险条件',
          references: ['bar:' + day],
        },
      ],
    };
    const reservation = await db.arenaReservation.update({
      where: { roundId_entrantId: { roundId: round.id, entrantId: e.id } },
      data: {
        decisionState: state,
        settledAt: close(day),
        ...(state === 'invalid_output' ? {} : { decision }),
        executionAt: open(next),
        execution:
          day === tuesday ? { state: 'unfilled', reason: 'suspended' } : { state: 'complete' },
      },
    });
    if (day === friday && i === 0)
      await db.arenaFill.create({
        data: {
          reservationId: reservation.id,
          symbol,
          side: 'buy',
          quantity: '20',
          price: '10',
          fee: '1',
          cashDelta: '-201',
          executedAt: open(monday),
          recordedAt: open(monday),
          sourceRef: 'open:mon',
        },
      });
  }
  return day === friday ? round.id : null;
}
function crossWeekDecisionState(day: string, friday: string, index: number) {
  if (day === friday) {
    if (index === 0) return 'decision';
    return 'observe';
  }
  if (index === 0) return 'decision';
  return 'invalid_output';
}
