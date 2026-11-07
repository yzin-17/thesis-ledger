import { releaseArenaFixture } from './fixture-cleanup.js';
import { ArenaRoundReports } from '../../src/model-arena/arena-round-report.js';
import type { MarketOpenEvidence } from '../../src/market/market-open-evidence.js';
import { ArenaExecutionRunner } from '../../src/model-arena/arena-execution-runner.js';
import { ArenaExecutionStore } from '../../src/model-arena/arena-execution-store.js';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ModelArenaRepository } from '../../src/model-arena/model-arena.repository.js';
import { ArenaRoundAdmission } from '../../src/model-arena/arena-round-admission.js';
import { ArenaResearchPackets } from '../../src/model-arena/arena-research-packets.js';
import { ArenaModelDecisions } from '../../src/model-arena/arena-model-decisions.js';
import { ArenaDecisionRunner } from '../../src/model-arena/arena-decision-runner.js';
import type { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import type { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import type { MarketInstrumentEvidence } from '../../src/market/market-instrument-evidence.js';
const url = process.env.JOURNAL_REVIEW_DATABASE_URL;
it.skipIf(!url)('两模型共用封存材料，各自独立调仓或观望，重复领取不重发', async () => {
  if (
    new URL(url!).hostname !== '127.0.0.1' ||
    new URL(url!).pathname !== '/journal_review_fixture'
  )
    throw Error('需要隔离数据库');
  const db = new PrismaService({ datasourceUrl: url! });
  const owner = randomUUID();
  try {
    const store = new ModelArenaRepository(db),
      instrumentId = randomUUID(),
      symbol = '006987.SZ';
    await db.instrument.create({
      data: {
        id: instrumentId,
        market: 'SZ',
        canonicalCode: '006987',
        instrumentType: 'STOCK',
        displayName: '研究样本',
        generation: 1,
      },
    });
    const day = new Date().toISOString().slice(0, 10);
    const budget = { requests: 2, tokens: 50000, costMicros: 100 };
    const match = await store.create(owner, {
      version: 1,
      title: '决策样本',
      market: 'CN',
      currency: 'CNY',
      timeZone: 'Asia/Shanghai',
      calendarId: 'CN',
      calendarVersion: 'fixture',
      startsOn: day,
      endsOn: day,
      instruments: [{ instrumentId, symbol, assetType: 'STOCK' }],
      entrants: ['first', 'second'].map((model) => ({
        providerId: 'fixture',
        model,
        budget,
        maxInputTokens: 20000,
        maxOutputTokens: 500,
      })),
      initialCash: '1000',
      fees: { version: 'fixture', buyBps: 0, sellBps: 0, minimum: '0', slippageBps: 0 },
      maxPositionBps: 6000,
      benchmarks: ['cash', 'equal_weight_buy_hold'],
      decisionDeadlineMinutes: 60,
      maxInfrastructureAttempts: 2,
      budgetCurrency: 'USD',
      budget,
    });
    await store.transition(owner, match.id, 'running');
    const now = Date.now();
    await db.arenaOccurrence.create({
      data: {
        arenaId: match.id,
        tradingDate: day,
        dueAt: new Date(now - 5000),
        deadlineAt: new Date(now + 60000),
        nextOpenAt: new Date(now + 86400000),
        calendarRevision: 'fixture',
        maxAttempts: 2,
        state: 'complete',
      },
    });
    const entrants = (await store.read(owner, match.id)).entrants;
    const round = await new ArenaRoundAdmission(db).open(
      owner,
      match.id,
      day,
      new Map(entrants.map((e) => [e.id, { maxCostMicros: 10, currency: 'USD' }])),
    );
    const fact = {
      symbol,
      kind: 'daily_bar',
      date: day,
      availableAt: new Date(now - 2000).toISOString(),
      observedAt: new Date(now - 2000).toISOString(),
      open: '10',
      close: '10',
      ref: 'source:close',
    };
    const evidence = vi
      .fn()
      .mockResolvedValue([
        fact,
        { ...fact, availableAt: new Date(now + 86400000).toISOString(), ref: 'future-ref' },
      ]);
    const packets = new ArenaResearchPackets(db, {
      read: evidence,
      recentNews: async () => [
        {
          kind: 'news',
          symbol,
          date: day,
          ref: 'news:qualified',
          availableAt: new Date(now - 1000).toISOString(),
          publishedAt: new Date(now - 2000).toISOString(),
          title: '已发布资讯',
          publisher: null,
          url: 'https://example.org/fixture',
          excerpt: null,
        },
        {
          kind: 'news',
          symbol,
          date: day,
          ref: 'news:late',
          availableAt: new Date(now + 86400000).toISOString(),
          publishedAt: new Date(now - 2000).toISOString(),
          title: '迟到资讯',
          publisher: null,
          url: 'https://example.org/fixture',
          excerpt: null,
        },
      ],
    } as unknown as MarketInstrumentEvidence);
    const sdk = vi.fn(async (request: { model: string; messages: { content: string }[] }) => {
      const context = JSON.parse(request.messages[1]!.content);
      expect(context.facts.map((f: { ref: string }) => f.ref)).toEqual([
        'news:qualified',
        'source:close',
      ]);
      expect(context.ownBook).toMatchObject({ cash: '1000', positions: [] });
      const rationale = {
        symbol,
        references: ['source:close'],
        reason: '受控判断',
        invalidatedBy: '条件改变',
      };
      return {
        output: {
          actions: [
            request.model === 'first'
              ? { ...rationale, action: 'target', weightBps: 5000 }
              : { ...rationale, action: 'observe' },
          ],
        },
        actualModel: request.model,
        usage: { status: 'reported', inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        providerCost: '0',
        providerCostCurrency: 'USD',
      };
    });
    const routes = {
      strictReadyContract: ({ model }: { model: string }) => ({
        provider: {
          metadata: {
            modelPricing: {
              [model]: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
            },
          },
          sdkRuntime: () => ({ baseURL: 'http://127.0.0.1:1', apiKey: '', authMode: 'none' }),
        },
        execution: { mode: 'json_validated', adapter: 'openai-compatible' },
      }),
    };
    const decisions = new ArenaModelDecisions(
      db,
      routes as unknown as AiProviderRegistry,
      { generate: sdk } as unknown as AiSdkGenerationAdapter,
    );
    const runner = new ArenaDecisionRunner(db, packets, decisions);
    await packets.freeze(round.id);
    const record = await db.arenaReservation.findFirstOrThrow({ where: { roundId: round.id } });
    await Promise.all([decisions.execute(record.id), decisions.execute(record.id)]);
    await runner.run();
    await runner.run();
    expect(sdk).toHaveBeenCalledTimes(2);
    const reservations = await db.arenaReservation.findMany({ where: { roundId: round.id } });
    expect(reservations.map((r) => r.decisionState).sort()).toEqual(['decision', 'observe']);
    expect(new Set(reservations.map((r) => r.requestId)).size).toBe(2);
    expect(await db.arenaRound.findUniqueOrThrow({ where: { id: round.id } })).toMatchObject({
      outcome: { state: 'sealed' },
    });
    expect((await store.read(owner, match.id)).remaining).toEqual({
      requests: 0,
      tokens: 49600,
      costMicros: 100,
    });
    expect(evidence).toHaveBeenCalledTimes(1);
    const nextOpen = new Date(now + 86400000);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(nextOpen.getTime() + 1000);
    try {
      const quotes = vi.fn(async () => ({
        status: 'available',
        fact: {
          symbol,
          openAt: nextOpen.toISOString(),
          price: '12',
          lot: '1',
          tick: '0.01',
          sourceRef: 'opening-fixture',
          sellable: '0',
          buyBlocked: null,
          sellBlocked: null,
        },
      }));
      const execution = new ArenaExecutionRunner(
        db,
        { read: quotes } as unknown as MarketOpenEvidence,
        new ArenaExecutionStore(db),
      );
      const protectedCounts = () =>
        Promise.all([db.ledgerEvent.count(), db.position.count(), db.trade.count()]);
      const before = await protectedCounts();
      await db.$executeRawUnsafe(
        'ALTER TABLE "ArenaFill" ADD CONSTRAINT fixture_reject_fill CHECK (price <> 12)',
      );
      try {
        await expect(execution.run()).rejects.toThrow();
        expect(await db.arenaFill.count({ where: { reservation: { arenaId: match.id } } })).toBe(0);
      } finally {
        await db.$executeRawUnsafe('ALTER TABLE "ArenaFill" DROP CONSTRAINT fixture_reject_fill');
      }
      await execution.run();
      await execution.run();
      expect(quotes).toHaveBeenCalledTimes(1);
      const fills = await db.arenaFill.findMany({ where: { reservation: { arenaId: match.id } } });
      expect(fills.map((f) => [f.side, f.quantity.toFixed(), f.cashDelta.toFixed()])).toEqual([
        ['buy', '41', '-492'],
      ]);
      expect(
        (await store.read(owner, match.id)).entrants
          .find((e) => e.model === 'first')
          ?.cash.toFixed(),
      ).toBe('508');
      const reports = new ArenaRoundReports(db);
      const report = await reports.read(owner, match.id, round.id);
      expect(report.entries.find((e) => e.model === 'first')?.fills[0]).toMatchObject({
        price: '12',
        quantity: '41',
        sourceRef: 'opening-fixture',
      });
      expect(report.entries.find((e) => e.model === 'second')?.fills).toEqual([]);
      await expect(
        reports.read('00000000-0000-4000-8000-000000000001', match.id, round.id),
      ).rejects.toThrow('轮次不存在');
      await expect(
        reports.read(owner, '00000000-0000-4000-8000-000000000001', round.id),
      ).rejects.toThrow('轮次不存在');
      expect(await protectedCounts()).toEqual(before);
    } finally {
      clock.mockRestore();
    }
    const lateMatch = await store.create(owner, (await store.read(owner, match.id)).protocol);
    await store.transition(owner, lateMatch.id, 'running');
    const fresh = Date.now();
    await db.arenaOccurrence.create({
      data: {
        arenaId: lateMatch.id,
        tradingDate: day,
        dueAt: new Date(fresh - 1000),
        deadlineAt: new Date(fresh + 60000),
        nextOpenAt: new Date(fresh + 86400000),
        calendarRevision: 'fixture',
        maxAttempts: 2,
        state: 'complete',
      },
    });
    const lateEntrants = (await store.read(owner, lateMatch.id)).entrants;
    const lateRound = await new ArenaRoundAdmission(db).open(
      owner,
      lateMatch.id,
      day,
      new Map(lateEntrants.map((e) => [e.id, { maxCostMicros: 10, currency: 'USD' }])),
    );
    await packets.freeze(lateRound.id);
    const pending = await db.arenaReservation.findFirstOrThrow({
      where: { roundId: lateRound.id },
    });
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let dispatched!: () => void;
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    const heldSdk = vi.fn(async (input: Parameters<typeof sdk>[0]) => {
      dispatched();
      await barrier;
      return sdk(input);
    });
    const delayed = new ArenaModelDecisions(
      db,
      routes as unknown as AiProviderRegistry,
      { generate: heldSdk } as unknown as AiSdkGenerationAdapter,
    );
    const request = delayed.execute(pending.id);
    try {
      await started;
      await store.transition(owner, lateMatch.id, 'paused');
      await new ArenaDecisionRunner(db, packets, delayed).run();
      expect(
        await db.arenaReservation.findUniqueOrThrow({ where: { id: pending.id } }),
      ).toMatchObject({ decisionState: 'unknown_usage', decision: null });
      await delayed.execute(pending.id);
    } finally {
      release();
      await request;
    }
    expect(heldSdk).toHaveBeenCalledTimes(1);
    const late = await db.arenaReservation.findUniqueOrThrow({ where: { id: pending.id } });
    expect(late).toMatchObject({
      decisionState: 'late_receipt',
      decision: null,
      requestAudit: { usage: { totalTokens: 200 } },
    });
    expect((await store.read(owner, lateMatch.id)).remaining).toEqual({
      requests: 1,
      tokens: 49800,
      costMicros: 100,
    });
    expect(await db.arenaFill.count({ where: { reservation: { arenaId: lateMatch.id } } })).toBe(0);
  } finally {
    await releaseArenaFixture(db, owner);
    await db.$disconnect();
  }
});
