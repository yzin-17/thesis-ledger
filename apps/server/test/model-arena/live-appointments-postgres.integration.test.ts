import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { arenaLiveAccountSchema } from '@thesis-ledger/schemas';
import type { MarketSessionState } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveAppointments } from '../../src/model-arena/live/live-appointments.js';
import { LiveCyclesRepository } from '../../src/model-arena/live/live-cycles.repository.js';
import { liveAgents, saveLiveAccount } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const repository = new LiveMatchesRepository(db);
const cycles = new LiveCyclesRepository(db);
const matches: string[] = [];
const now = new Date('2026-11-12T15:00:00Z');
let session: MarketSessionState = { state: 'open', tradingDayState: 'open', date: '2026-11-12', evaluatedAt: now.toISOString(), sessions: [] };
const market = { getSession: vi.fn(async () => session), getQuote: vi.fn(async () => { throw new Error('隔离测试无行情'); }) };
const scheduler = new LiveAppointments(db, market);
async function create() {
  const owner = randomUUID();
  const { id } = await repository.create(owner, liveProtocolFixture());
  matches.push(id);
  await repository.transition(owner, id, 'running');
  session = { state: 'open', tradingDayState: 'open', date: '2026-11-12', evaluatedAt: now.toISOString(), sessions: [] };
  for (const agent of await liveAgents(db, id)) {
    const account = arenaLiveAccountSchema.parse(agent.account);
    account.wakeups = [{ id: randomUUID(), condition: { kind: 'time', at: now.toISOString() }, createdAt: now.toISOString(), firedAt: null }];
    await saveLiveAccount(db, agent.id, account);
  }
  return { id, owner };
}
describe.skipIf(!url)('自主预约与持久化领取', () => {
  afterAll(async () => {
    for (const id of matches) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('并发扫描只消费一次预约，同一模型只能领取一次', async () => {
    const { id } = await create();
    const batches = await Promise.all([scheduler.admit(id, now), scheduler.admit(id, now)]);
    expect(batches.flat()).toHaveLength(2);
    expect(await scheduler.admit(id, new Date(now.getTime() + 3600000))).toEqual([]);
    const cycle = batches.flat()[0]!;
    const claims = await Promise.all([cycles.claim(cycle, 1, now), cycles.claim(cycle, 1, now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('只预约事件可跨多个小时休眠；未订阅成交不会唤醒', async () => {
    const { id } = await create();
    for (const agent of await liveAgents(db, id)) {
      const book = arenaLiveAccountSchema.parse(agent.account);
      book.wakeups = [{ id: randomUUID(), condition: { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '300' }, createdAt: now.toISOString(), firedAt: null }];
      await saveLiveAccount(db, agent.id, book);
    }
    expect(await scheduler.admit(id, now)).toEqual([]);
    expect(await scheduler.admit(id, new Date(now.getTime() + 3 * 3600000))).toEqual([]);
  });
  it('已出站周期暂停后恢复仍需显式处理，不恢复已消费预约或自动重发', async () => {
    const { id, owner } = await create();
    const [cycleId] = await scheduler.admit(id, now);
    const claimed = await cycles.claim(cycleId!, 1);
    expect(claimed).not.toBeNull();
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=${randomUUID()}::uuid WHERE id=${cycleId}::uuid`;
    await repository.transition(owner, id, 'paused');
    await repository.transition(owner, id, 'running');
    const agent = (await liveAgents(db, id)).find((a) => a.id === claimed!.agentId)!;
    expect(agent).toMatchObject({ state: 'needs_attention', reason: 'request_outcome_unknown' });
    expect(arenaLiveAccountSchema.parse(agent.account).wakeups.every((w) => w.firedAt !== null)).toBe(true);
    const resumed = await scheduler.admit(id, now);
    expect(resumed).toHaveLength(1);
    const resumedCycles = await db.$queryRaw<{ agentId: string }[]>`SELECT "agentId" FROM "ArenaLiveCycle" WHERE id=${resumed[0]}::uuid`;
    expect(resumedCycles[0]?.agentId).not.toBe(agent.id);
    await repository.retry(owner, id, agent.id);
    expect(await scheduler.admit(id, new Date())).toHaveLength(1);
  });
  it('未知市场日历和休市仍可入队时间研究预约；暂停时不消费预约', async () => {
    const closed = await create();
    session = { state: 'closed', tradingDayState: 'open', date: '2026-11-12', evaluatedAt: now.toISOString(), sessions: [] };
    expect(await scheduler.admit(closed.id, now)).toHaveLength(2);
    const unknown = await create();
    session = { state: 'unknown', tradingDayState: 'unknown', evaluatedAt: now.toISOString(), sessions: [], reason: 'calendar_unavailable' };
    expect(await scheduler.admit(unknown.id, now)).toHaveLength(2);
    const paused = await create();
    await repository.transition(paused.owner, paused.id, 'paused');
    session = { state: 'closed', tradingDayState: 'open', date: '2026-11-12', evaluatedAt: now.toISOString(), sessions: [] };
    expect(await scheduler.admit(paused.id, now)).toEqual([]);
    for (const agent of await liveAgents(db, paused.id))
      expect(arenaLiveAccountSchema.parse(agent.account).wakeups[0]?.firedAt).toBeNull();
  });
  it('盘前价格触发不读取或相信非交易时段报价，时间预约独立触发', async () => {
    const { id } = await create();
    for (const agent of await liveAgents(db, id)) {
      const book = arenaLiveAccountSchema.parse(agent.account);
      book.wakeups = [
        { id: randomUUID(), condition: { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '10' },
          createdAt: now.toISOString(), firedAt: null },
        { id: randomUUID(), condition: { kind: 'time', at: now.toISOString() },
          createdAt: now.toISOString(), firedAt: null },
      ];
      await saveLiveAccount(db, agent.id, book);
    }
    session = { state: 'closed', tradingDayState: 'open', date: '2026-11-12', evaluatedAt: now.toISOString(), sessions: [] };
    market.getQuote.mockClear();
    expect(await scheduler.admit(id, now)).toHaveLength(2);
    expect(market.getQuote).not.toHaveBeenCalled();
    for (const agent of await liveAgents(db, id)) {
      const pending = arenaLiveAccountSchema.parse(agent.account).wakeups;
      expect(pending.map((w) => w.firedAt !== null)).toEqual([false, true]);
    }
  });
  it('未出站租约可有限恢复，已出站失联收敛到未知耗用并不重发', async () => {
    const { id } = await create();
    const ids = await scheduler.admit(id, now);
    await cycles.claim(ids[0]!, 1, now);
    await cycles.claim(ids[1]!, 1, now);
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET "requestId"=${randomUUID()}::uuid WHERE id=${ids[1]}::uuid`;
    const expired = new Date(now.getTime() + 3600000);
    await cycles.recover(expired);
    expect(await cycles.claim(ids[1]!, 2, expired)).toBeNull();
    expect(await cycles.claim(ids[0]!, 2, expired)).not.toBeNull();
    await cycles.recover(new Date(expired.getTime() + 3600000));
    expect(await cycles.claim(ids[0]!, 3, expired)).toBeNull();
    const states = await db.$queryRaw<{ id: string; state: string }[]>`SELECT id,state FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
    expect(states.find((r) => r.id === ids[0])?.state).toBe('failed');
    expect(states.find((r) => r.id === ids[1])?.state).toBe('unknown_usage');
  });
});
