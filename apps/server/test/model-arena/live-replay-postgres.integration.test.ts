import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { arenaInitialTimeline } from '@thesis-ledger/domain';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveReplayRuntime } from '../../src/model-arena/live/live-replay-runtime.js';
import { LiveCyclesRepository } from '../../src/model-arena/live/live-cycles.repository.js';
import { LiveOrdersRepository } from '../../src/model-arena/live/live-orders.repository.js';
import { LiveMatchesQuery } from '../../src/model-arena/live/live-matches.query.js';
import { InstrumentDisplayService } from '../../src/market/instruments/instrument-display.service.js';
import {
  liveAgents,
  liveMatch,
  type LiveCycleRow,
} from '../../src/model-arena/live/live-storage.js';
import { liveTimeline } from '../../src/model-arena/live/live-timeline.js';
import type { ArenaReplayObservation } from '../../src/market/market-arena-replay-reader.js';
import { liveProtocolFixture } from './live-fixture.js';
import { MarketArenaReplayReader } from '../../src/market/market-arena-replay-reader.js';
import { LiveExecutionContext } from '../../src/model-arena/live/live-execution-context.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== '127.0.0.1' ||
    new URL(url).pathname !== '/ai_provider_concurrency_fixture')
)
  throw new Error('回放验证必须使用专属隔离库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const matches = new LiveMatchesRepository(db),
  cycles = new LiveCyclesRepository(db),
  ids: string[] = [];
const instrumentIds: string[] = [];
const owner = randomUUID(),
  first = '2026-11-02T14:31:00.000Z',
  second = '2026-11-02T14:32:00.000Z';
const p = liveProtocolFixture({
  startsOn: '2026-11-02',
  entrants: [liveProtocolFixture().entrants[0]!],
});
const observation = (at: string): ArenaReplayObservation => ({
  at,
  prices: new Map([['AAPL.US', '10']]),
  evidence: { controlled: true },
  session: {
    state: 'open',
    tradingDayState: 'open',
    date: '2026-11-02',
    evaluatedAt: at,
    latestTradingDate: '2026-11-02',
    latestCompletedTradingDate: '2026-10-30',
    market: 'US',
    timezone: 'America/New_York',
    calendarRevision: 'controlled',
    sessions: [
      {
        tradingDate: '2026-11-02',
        startAt: '2026-11-02T14:30:00.000Z',
        endAt: '2026-11-02T21:00:00.000Z',
      },
    ],
  },
  context: {
    at,
    tradingDate: '2026-11-02',
    maxPositionBps: 10000,
    maxActiveSymbols: 50,
    fees: p.fees,
    allowedSymbols: new Set(['AAPL.US']),
    quotes: [
      {
        symbol: 'AAPL.US',
        price: '10',
        marketTime: at,
        observedAt: at,
        tradingDate: '2026-11-02',
        positionAvailableOn: '2026-11-02',
        cashAvailableOn: '2026-11-02',
        lot: '1',
        tick: '0.01',
        sourceRef: 'controlled-historical',
        evidence: { controlled: true },
        buyBlocked: null,
        sellBlocked: null,
        statutoryBuyFee: () => '0',
        statutorySellFee: () => '0',
      },
    ],
    expiresAt: () => '2026-11-02T21:00:00.000Z',
    newId: randomUUID,
  },
});
async function create(protocol = p) {
  const receipt = await matches.create(owner, protocol);
  ids.push(receipt.id);
  await matches.transition(owner, receipt.id, 'running');
  return receipt.id;
}
const source = {
  next: async (_: unknown, after: string, target: string) => {
    if (after < first) return first;
    if (after < second) return second;
    return target;
  },
  observe: async (_: unknown, at: string) => observation(at),
};
const runtime = new LiveReplayRuntime(db, source, matches);
const orders = new LiveOrdersRepository(db, {
  build: async (_p, _books, _decision, _symbols, at) => ({ ...observation(at!), missing: {} }),
});
async function decide(id: string, buy: boolean) {
  const [cycle] = await db.$queryRaw<
    LiveCycleRow[]
  >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state='pending'`;
  expect(cycle).toBeDefined();
  const clock = await liveTimeline(db, id);
  const claim = await cycles.claim(cycle!.id, 1, new Date(), undefined, clock!.pendingAt!);
  expect(claim!.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
  expect(claim!.input.asOf).toBe(clock!.pendingAt);
  await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=${randomUUID()}::uuid WHERE id=${cycle!.id}::uuid`;
  await orders.submit(cycle!.id, 1, {
    summary: buy ? '历史时点买入' : '成交后继续等待',
    orders: buy
      ? [
          {
            clientId: 'buy',
            symbol: 'AAPL.US',
            side: 'buy',
            kind: 'market',
            quantity: '1',
            price: null,
            expiresOn: null,
            exitGroup: null,
          },
        ]
      : [],
    cancelOrderIds: [],
    watchedSymbols: ['AAPL.US'],
    wakeups: buy
      ? [{ kind: 'fill', symbol: 'AAPL.US' }]
      : [{ kind: 'time', at: '2099-01-01T00:00:00.000Z' }],
  });
}
describe.skipIf(!url)('自主比赛持久化回放', () => {
  liveReplayDatabaseLifecycle();
  registerReplayHistoricalSourceCases();
  registerReplayClockFailureAndOwnershipCases();
  registerReplayFrozenDetailAndPauseCases();
});

function liveReplayDatabaseLifecycle() {
  afterAll(async () => {
    for (const id of ids) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.instrument.deleteMany({ where: { id: { in: instrumentIds } } });
    await db.$disconnect();
  });
}
function registerReplayHistoricalSourceCases() {
  it('先启动 AI 周期，再仅为选中的观察证券读取历史；价格预约不要求成交规则', async () => {
    const protocol = {
      ...p,
      universe: 'fixed' as const,
      instruments: [{ instrumentId: randomUUID(), symbol: 'AAPL.US', assetType: 'STOCK' as const }],
    };
    instrumentIds.push(protocol.instruments[0]!.instrumentId);
    await db.instrument.create({
      data: {
        id: protocol.instruments[0]!.instrumentId,
        canonicalCode: 'AAPL',
        market: 'US',
        instrumentType: 'STOCK',
        displayName: '受控苹果',
        generation: 1,
      },
    });
    const calendar = {
      market: 'US' as const,
      timezone: 'America/New_York',
      revision: 'controlled',
      availableAt: '2026-01-01T00:00:00.000Z',
      coverageStart: '2026-10-01',
      coverageEnd: '2026-12-01',
      sessions: observation(first).session.sessions,
    };
    const bars = {
      readRetainedResearch: vi.fn(async () => ({
        status: 'selected',
        selection: {
          response: {
            bars: [first, second].map((timestamp) => ({
              timestamp,
              availableAt: timestamp,
              completionStatus: 'complete',
              open: 12,
              high: 12,
              low: 12,
              close: 12,
              volume: 1,
              amount: 12,
            })),
          },
        },
        evidence: {},
        seriesVersion: 'controlled',
      })) as never,
    };
    const facts = { backtestInstrumentFacts: vi.fn() };
    const reader = new MarketArenaReplayReader(
      { read: async () => ({ status: 'ready', calendar }) },
      bars,
      facts,
      { readComposition: vi.fn() },
      { read: vi.fn() },
    );
    const observe = vi.spyOn(reader, 'observe');
    const replay = new LiveReplayRuntime(
      db,
      { ...source, observe: reader.observe.bind(reader) },
      matches,
    );
    const id = await create(protocol);
    await replay.reconcile(id);
    expect((await liveTimeline(db, id))!.pendingAt).toBe(first);
    expect(observe.mock.calls[0]?.[2]).toEqual([]);
    expect(bars.readRetainedResearch).not.toHaveBeenCalled();
    const [cycle] = await db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state='pending'`;
    await cycles.claim(cycle!.id, 1, new Date(), undefined, first);
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=${randomUUID()}::uuid WHERE id=${cycle!.id}::uuid`;
    const execution = new LiveExecutionContext(
      db,
      { getSession: vi.fn() },
      { read: vi.fn() },
      reader,
    );
    await new LiveOrdersRepository(db, execution).submit(cycle!.id, 1, {
      summary: '选择苹果，预约价格观察',
      orders: [],
      cancelOrderIds: [],
      watchedSymbols: ['AAPL.US'],
      wakeups: [{ kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '11' }],
    });
    await replay.reconcile(id);
    await replay.reconcile(id);
    expect((await liveTimeline(db, id))!.pendingAt).toBe(second);
    expect(
      observe.mock.calls
        .slice(1)
        .every((call) => call[2].length === 1 && call[2][0] === 'AAPL.US' && call[4]?.length === 0),
    ).toBe(true);
    expect(bars.readRetainedResearch).toHaveBeenCalled();
    expect(facts.backtestInstrumentFacts).not.toHaveBeenCalled();
    expect(arenaLiveAccountSchema.parse((await liveAgents(db, id))[0]!.account).fills).toEqual([]);
  });
  it('过去日期按市场午夜初始化，空日期使用实时；美股夏令时切换保留正确偏移', () => {
    expect(arenaInitialTimeline(p, new Date('2026-11-12T00:00:00Z')).originAt).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    expect(
      arenaInitialTimeline({ ...p, startsOn: '2026-10-30' }, new Date('2026-11-12T00:00:00Z'))
        .originAt,
    ).toBe('2026-10-30T04:00:00.000Z');
    expect(arenaInitialTimeline({ ...p, startsOn: null }, new Date()).phase).toBe('live');
  });
}
function registerReplayClockFailureAndOwnershipCases() {
  it('历史研究冻结业务时点、租约使用真实时间，后续观察仅成交一次并沿用账户切到实时', async () => {
    const id = await create();
    await runtime.reconcile(id);
    expect((await liveTimeline(db, id))!.pendingAt).toBe(first);
    const waiting = (await liveTimeline(db, id))!.cursorAt;
    await runtime.reconcile(id);
    expect((await liveTimeline(db, id))!.cursorAt).toBe(waiting);
    await decide(id, true);
    await runtime.reconcile(id);
    await runtime.reconcile(id);
    expect((await liveTimeline(db, id))!.pendingAt).toBe(second);
    const book = arenaLiveAccountSchema.parse((await liveAgents(db, id))[0]!.account);
    expect(book.fills).toHaveLength(1);
    expect(book.fills[0]!.marketTime).toBe(second);
    expect(book.cash).toBe('9990');
    await decide(id, false);
    await runtime.reconcile(id);
    await Promise.all([runtime.reconcile(id), runtime.reconcile(id)]);
    await runtime.reconcile(id);
    expect((await liveTimeline(db, id))!.phase).toBe('live');
    expect(arenaLiveAccountSchema.parse((await liveAgents(db, id))[0]!.account).fills).toHaveLength(
      1,
    );
    const frames = await db.$queryRaw<
      { at: Date }[]
    >`SELECT at FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid ORDER BY at`;
    expect(frames[0]!.at.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(new Set(frames.map((f) => f.at.toISOString())).size).toBe(frames.length);
  });
  it('来源失败固定游标并停止重读，显式恢复且 owner 隔离，暂停不推进', async () => {
    const id = await create();
    let reads = 0;
    const blocked = new LiveReplayRuntime(
      db,
      {
        ...source,
        observe: async () => {
          reads++;
          throw new Error('replay_prices_unavailable');
        },
      },
      matches,
    );
    const before = (await liveTimeline(db, id))!.cursorAt;
    await blocked.reconcile(id);
    await blocked.reconcile(id);
    expect(reads).toBe(1);
    expect(await liveTimeline(db, id)).toMatchObject({
      cursorAt: before,
      status: 'blocked',
      reason: 'replay_prices_unavailable',
    });
    await expect(matches.retryReplay(randomUUID(), id)).rejects.toThrow('比赛不存在');
    await matches.retryReplay(owner, id);
    await matches.transition(owner, id, 'paused');
    await runtime.reconcile(id);
    expect((await liveTimeline(db, id))!.cursorAt).toBe(before);
    await matches.transition(owner, id, 'running');
    await runtime.reconcile(id);
    expect((await liveTimeline(db, id))!.pendingAt).toBe(first);
    expect((await liveMatch(db, id)).state).toBe('running');
  });
  it('未来时点的观察不能进入历史账户或推进游标', async () => {
    const id = await create(),
      bad = observation(first);
    bad.context = {
      ...bad.context,
      quotes: bad.context.quotes.map((q) => ({ ...q, marketTime: second })),
    };
    await new LiveReplayRuntime(db, { ...source, observe: async () => bad }, matches).reconcile(id);
    expect((await liveTimeline(db, id))!.status).toBe('blocked');
    expect(
      await db.$queryRaw<
        LiveCycleRow[]
      >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`,
    ).toHaveLength(0);
  });
}
function registerReplayFrozenDetailAndPauseCases() {
  it('回放详情只读取冻结日历；来源阻塞后的轮询不重新读取当前或历史来源', async () => {
    const id = await create();
    const blocked = new LiveReplayRuntime(
      db,
      {
        ...source,
        observe: async () => {
          throw new Error('replay_prices_unavailable');
        },
      },
      matches,
    );
    await blocked.reconcile(id);
    const market = { getSession: vi.fn() },
      query = new LiveMatchesQuery(db, new InstrumentDisplayService(db), market);
    const detail = await query.read(owner, id);
    expect(market.getSession).not.toHaveBeenCalled();
    expect(detail.timeline!.status).toBe('blocked');
    expect(detail.session).toMatchObject({ state: 'unknown' });
    expect(detail.agents[0]!.availability.tradingDate).toBeNull();
  });
  it('未出站研究暂停后从同一观察恢复；已出站结果不明时保留游标等待处理', async () => {
    for (const sent of [false, true]) {
      const id = await create();
      await runtime.reconcile(id);
      const before = (await liveTimeline(db, id))!.cursorAt;
      const [cycle] = await db.$queryRaw<
        LiveCycleRow[]
      >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state='pending'`;
      await cycles.claim(cycle!.id, 1, new Date(), undefined, first);
      if (sent)
        await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=${randomUUID()}::uuid WHERE id=${cycle!.id}::uuid`;
      await matches.transition(owner, id, 'paused');
      await matches.transition(owner, id, 'running');
      await runtime.reconcile(id);
      expect((await liveTimeline(db, id))!.cursorAt).toBe(before);
      if (sent)
        expect(await liveTimeline(db, id)).toMatchObject({
          status: 'blocked',
          reason: 'replay_research_attention',
        });
      else {
        expect((await liveTimeline(db, id))!.pendingAt).toBe(first);
        const active = await db.$queryRaw<
          LiveCycleRow[]
        >`SELECT * FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid AND state IN ('pending','running')`;
        expect(active).toHaveLength(1);
        expect(active[0]!.id).not.toBe(cycle!.id);
      }
    }
  });
}
