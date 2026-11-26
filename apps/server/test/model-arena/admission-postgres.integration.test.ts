import { releaseArenaFixture } from './fixture-cleanup.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ModelArenaRepository } from '../../src/model-arena/model-arena.repository.js';
import { ArenaRoundAdmission } from '../../src/model-arena/arena-round-admission.js';

const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/journal_review_fixture')
)
  throw Error('需要隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const arenas = new ModelArenaRepository(db);
const gate = new ArenaRoundAdmission(db);
const per = { requests: 1, tokens: 120, costMicros: 500 };
const total = { requests: 2, tokens: 240, costMicros: 1000 };
const owner = randomUUID(),
  instrumentId = randomUUID();
describe.skipIf(!url)('比赛开轮事务', () => {
  beforeAll(async () => {
    await db.instrument.create({
      data: {
        id: instrumentId,
        market: 'SZ',
        canonicalCode: '003456',
        instrumentType: 'STOCK',
        displayName: '隔离样本',
        generation: 1,
      },
    });
  });
  afterAll(async () => {
    await releaseArenaFixture(db, owner);
    await db.$disconnect();
  });
  async function start(budget = total, second = per) {
    const created = await arenas.create(owner, {
      version: 'arena-historical-match-protocol-v1',
      title: '隔离比赛',
      market: 'CN',
      currency: 'CNY',
      timeZone: 'Asia/Shanghai',
      calendarId: 'fixture-market',
      calendarVersion: '1',
      startsOn: '2026-11-05',
      endsOn: '2026-11-30',
      instruments: [{ instrumentId, symbol: '003456.SZ', assetType: 'STOCK' }],
      entrants: ['a', 'b'].map((model, i) => ({
        providerId: 'fixture',
        model,
        budget: i === 0 ? per : second,
        maxInputTokens: 100,
        maxOutputTokens: 20,
      })),
      initialCash: '100000',
      fees: { version: 'test', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
      maxPositionBps: 9000,
      benchmarks: ['cash', 'equal_weight_buy_hold'],
      decisionDeadlineMinutes: 30,
      maxInfrastructureAttempts: 2,
      budgetCurrency: 'USD',
      budget,
    });
    await expect(arenas.read(randomUUID(), created.id)).rejects.toThrow();
    await expect(arenas.transition(randomUUID(), created.id, 'running')).rejects.toThrow();
    await arenas.transition(owner, created.id, 'running');
    const { entrants } = await arenas.read(owner, created.id);
    return {
      id: created.id,
      pricing: new Map(entrants.map((e) => [e.id, { currency: 'USD', maxCostMicros: 500 }])),
      entrants,
    };
  }
  it.each(['participant_budget', 'competition_budget', 'unknown_pricing'] as const)(
    '%s 整轮零预留且余额不变',
    async (reason) => {
      const arena = await start(
        reason === 'competition_budget' ? { ...total, requests: 1 } : total,
        reason === 'participant_budget' ? { ...per, tokens: 119 } : per,
      );
      if (reason === 'unknown_pricing') arena.pricing.delete(arena.entrants[1]!.id);
      const before = await arenas.read(owner, arena.id);
      const round = await gate.open(owner, arena.id, '2026-11-05', arena.pricing);
      expect(round.outcome).toMatchObject({ state: 'unopened', reason });
      expect(await db.arenaReservation.count({ where: { arenaId: arena.id } })).toBe(0);
      const after = await arenas.read(owner, arena.id);
      expect(after.remaining).toEqual(before.remaining);
      expect(after.entrants).toEqual(before.entrants);
      expect((await gate.open(owner, arena.id, '2026-11-05', arena.pricing)).id).toBe(round.id);
    },
  );
  it('恰好够时重复调度只开一轮；余量耗尽后不派发', async () => {
    const arena = await start();
    const before = await Promise.all([
      db.account.count(),
      db.position.count(),
      db.trade.count(),
      db.ledgerEvent.count(),
    ]);
    const ids = await Promise.all(
      [arena.pricing, new Map([...arena.pricing].reverse())].map((p) =>
        gate.open(owner, arena.id, '2026-11-05', p),
      ),
    );
    expect(ids[0]!.id).toBe(ids[1]!.id);
    expect(ids[0]!.outcome).toEqual({ state: 'open' });
    expect(await db.arenaReservation.count({ where: { arenaId: arena.id } })).toBe(2);
    const after = await arenas.read(owner, arena.id);
    expect(after.remaining).toEqual({ requests: 0, tokens: 0, costMicros: 0 });
    expect(after.entrants.every((e) => e.cash.toFixed() === '100000')).toBe(true);
    expect((await gate.open(owner, arena.id, '2026-11-06', arena.pricing)).outcome).toMatchObject({
      state: 'unopened',
    });
    await arenas.transition(owner, arena.id, 'paused');
    await expect(gate.open(owner, arena.id, '2026-11-09', arena.pricing)).rejects.toThrow();
    expect(
      await Promise.all([
        db.account.count(),
        db.position.count(),
        db.trade.count(),
        db.ledgerEvent.count(),
      ]),
    ).toEqual(before);
  });
  it('事务中途被数据库拒绝后，重试只扣一次', async () => {
    const arena = await start();
    const hold = arena.entrants[1]!.id;
    // 受限于本测试唯一参赛者，隔离库中并行运行的其他比赛不受影响。
    await db.$executeRawUnsafe(
      `ALTER TABLE "ArenaReservation" ADD CONSTRAINT fixture_reject_entrant CHECK ("entrantId" <> '${hold}'::uuid)`,
    );
    try {
      await expect(gate.open(owner, arena.id, '2026-11-05', arena.pricing)).rejects.toThrow();
      expect(await db.arenaRound.count({ where: { arenaId: arena.id } })).toBe(0);
      expect(await db.arenaReservation.count({ where: { arenaId: arena.id } })).toBe(0);
      expect((await arenas.read(owner, arena.id)).remaining).toEqual(total);
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "ArenaReservation" DROP CONSTRAINT fixture_reject_entrant',
      );
    }
    expect((await gate.open(owner, arena.id, '2026-11-05', arena.pricing)).outcome).toEqual({
      state: 'open',
    });
  });
});
