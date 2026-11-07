import { ArenaQueue } from '../../src/model-arena/arena-queue.js';
import { releaseArenaFixture } from './fixture-cleanup.js';
import type { MarketInstrumentEvidence } from '../../src/market/market-instrument-evidence.js';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { RedisService } from '../../src/platform/redis.service.js';
import { ArenaSchedule } from '../../src/model-arena/arena-schedule.js';
import { ModelArenaRepository } from '../../src/model-arena/model-arena.repository.js';
import { ArenaRoundAdmission } from '../../src/model-arena/arena-round-admission.js';
import { ArenaRoundWorker } from '../../src/model-arena/arena-round-worker.js';
import type { MarketPeriodCalendarReader } from '../../src/market/market-period-calendar-reader.js';
import type { AiProviderRegistry } from '../../src/ai/provider-registry.js';
const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
it.skipIf(!url || !process.env.ARENA_QUEUE_TEST_SCOPE)(
  '到期计划经隔离 Redis 投递，Worker 领取并提交全员开轮事务',
  async () => {
    if (
      new URL(url!).hostname !== '127.0.0.1' ||
      new URL(url!).pathname !== '/journal_review_fixture'
    )
      throw Error('需要隔离数据库');
    const db = new PrismaService({ datasourceUrl: url! });
    const redis = new RedisService();
    const arenas = new ModelArenaRepository(db);
    const owner = randomUUID(),
      instrumentId = randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    const at = (ms: number) => new Date(ms).toISOString();
    const now = Date.now();
    const nextDay = at(now + 86400000).slice(0, 10);
    const calendar = {
      market: 'CN',
      timezone: 'Asia/Shanghai',
      revision: 'test-calendar',
      availableAt: at(now - 86400000),
      coverageStart: day,
      coverageEnd: nextDay,
      sessions: [
        { tradingDate: day, startAt: at(now - 3600000), endAt: at(now - 1000) },
        { tradingDate: nextDay, startAt: at(now + 86400000), endAt: at(now + 90000000) },
      ],
    };
    const source = {
      read: async () => ({ status: 'ready', calendar }),
    } as unknown as MarketPeriodCalendarReader;
    const schedule = new ArenaSchedule(db, arenas, source);
    const routes = {
      strict: (_provider: string, model: string) => ({
        metadata: {
          modelPricing: {
            [model]: { costPer1kInput: 0.01, costPer1kOutput: 0.02, costCurrency: 'USD' },
          },
        },
      }),
    } as unknown as AiProviderRegistry;
    const worker = new ArenaRoundWorker(db, redis, new ArenaRoundAdmission(db), routes, {
      prepare: async () => undefined,
    } as unknown as MarketInstrumentEvidence);
    try {
      await db.instrument.create({
        data: {
          id: instrumentId,
          market: 'SZ',
          canonicalCode: '006789',
          instrumentType: 'STOCK',
          displayName: '调度样本',
          generation: 1,
        },
      });
      const budget = { requests: 5, tokens: 10000, costMicros: 100000 };
      const match = await arenas.create(owner, {
        version: 1,
        title: '后台轮次',
        market: 'CN',
        currency: 'CNY',
        timeZone: calendar.timezone,
        calendarId: 'CN',
        calendarVersion: calendar.revision,
        startsOn: day,
        endsOn: day,
        instruments: [{ instrumentId, symbol: '006789.SZ', assetType: 'STOCK' }],
        entrants: ['first', 'second'].map((model) => ({
          providerId: 'fixture',
          model,
          budget,
          maxInputTokens: 100,
          maxOutputTokens: 20,
        })),
        initialCash: '100000',
        fees: { version: 'fixture', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
        maxPositionBps: 5000,
        benchmarks: ['cash', 'equal_weight_buy_hold'],
        decisionDeadlineMinutes: 60,
        maxInfrastructureAttempts: 2,
        budgetCurrency: 'USD',
        budget,
      });
      await schedule.start(owner, match.id, new Date(now - 2000));
      expect(
        await db.arenaOccurrence.count({ where: { arenaId: match.id, state: 'scheduled' } }),
      ).toBe(1);
      worker.start();
      await expect
        .poll(
          () =>
            db.arenaOccurrence
              .findFirstOrThrow({ where: { arenaId: match.id } })
              .then((v) => v.state),
          { timeout: 12000 },
        )
        .toBe('complete');
      const round = await db.arenaRound.findFirstOrThrow({ where: { arenaId: match.id } });
      expect(round.outcome).toEqual({ state: 'open' });
      expect(await db.arenaReservation.count({ where: { roundId: round.id } })).toBe(2);
      await worker.reconcile();
      expect(await db.arenaRound.count({ where: { arenaId: match.id } })).toBe(1);
      const future = new Date(now + 3600000);
      const slot = {
        arenaId: match.id,
        dueAt: new Date(now - 2000),
        deadlineAt: future,
        nextOpenAt: new Date(now + 86400000),
        calendarRevision: 'fixture',
        maxAttempts: 1,
      };
      const expired = await db.arenaOccurrence.create({
        data: {
          ...slot,
          tradingDate: '2098-01-01',
          state: 'running',
          attempt: 1,
          leaseUntil: new Date(now - 1500),
        },
      });
      const waiting = await db.arenaOccurrence.create({
        data: { ...slot, tradingDate: '2098-01-02' },
      });
      const unavailable = vi
        .spyOn(ArenaQueue.prototype, 'ensure')
        .mockRejectedValueOnce(new Error('隔离测试的队列查询中断'));
      try {
        await expect(worker.reconcile()).rejects.toThrow('队列查询中断');
      } finally {
        unavailable.mockRestore();
      }
      expect(
        await db.arenaOccurrence.findUniqueOrThrow({ where: { id: expired.id } }),
      ).toMatchObject({ state: 'failed', attempt: 1, reason: 'lease_expired' });
      expect(
        await db.arenaOccurrence.findUniqueOrThrow({ where: { id: waiting.id } }),
      ).toMatchObject({ state: 'scheduled', attempt: 0 });
      await arenas.transition(owner, match.id, 'paused');
      await worker.execute({ id: waiting.id, attempt: 1 });
      expect(await db.arenaRound.count({ where: { arenaId: match.id } })).toBe(1);
    } finally {
      await worker.onModuleDestroy();
      await redis.onModuleDestroy();
      await releaseArenaFixture(db, owner);
      await db.$disconnect();
    }
  },
  25000,
);
