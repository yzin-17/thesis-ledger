import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { liveActiveMatches, liveMatch, liveAgents, liveSummary } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture'))
  throw new Error('自主竞技场存储测试必须使用专属隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const matches: string[] = [];
const owner = randomUUID();
const account = { revision: 0, cash: '10000.000000000000000001', positions: [], cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] };
async function createAgent() {
  const match = randomUUID(), agent = randomUUID();
  matches.push(match);
  await db.$executeRaw`INSERT INTO "ArenaLiveMatch" (id,"ownerId",protocol,remaining)
    VALUES (${match}::uuid,${owner}::uuid,${JSON.stringify(liveProtocolFixture())}::jsonb,'{}'::jsonb)`;
  await db.$executeRaw`INSERT INTO "ArenaLiveAgent" (id,"matchId","providerId",model,account,remaining)
    VALUES (${agent}::uuid,${match}::uuid,'fixture','fixture',${JSON.stringify(account)}::jsonb,'{}'::jsonb)`;
  return { match, agent };
}
describe.skipIf(!url)('自主竞技场持久化升级', () => {
  afterAll(async () => {
    for (const id of matches) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('活动比赛超过一页且创建时间相同时仍全部进入调度读取，暂停过滤保持独立', async () => {
    const added = await db.$queryRaw<{ id: string }[]>`INSERT INTO "ArenaLiveMatch" (id,"ownerId",protocol,remaining,state,"startedAt","createdAt")
      SELECT gen_random_uuid(),${owner}::uuid,${JSON.stringify(liveProtocolFixture())}::jsonb,'{}'::jsonb,
        CASE WHEN i=102 THEN 'paused' ELSE 'running' END,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM generate_series(1,102) i RETURNING id`;
    matches.push(...added.map((r) => r.id));
    const all: string[] = [], running: string[] = [];
    for await (const row of liveActiveMatches(db)) all.push(row.id);
    for await (const row of liveActiveMatches(db, false)) running.push(row.id);
    expect(added.every((r) => all.includes(r.id))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(added.filter((r) => running.includes(r.id))).toHaveLength(101);
  });
  it('账户高精度字符串可原样重读，新表写入不影响旧比赛', async () => {
    const before = await db.modelArena.count();
    const { agent } = await createAgent();
    const [saved] = await db.$queryRaw<{ account: typeof account }[]>`SELECT account FROM "ArenaLiveAgent" WHERE id=${agent}::uuid`;
    expect(saved?.account).toEqual(account);
    expect(await db.modelArena.count()).toBe(before);
  });
  it('数据库部分唯一索引禁止同一模型同时有两个活动周期', async () => {
    const { agent, match } = await createAgent();
    const first = randomUUID(), second = randomUUID();
    await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision")
      VALUES (${first}::uuid,${match}::uuid,${agent}::uuid,'initial',0)`;
    await expect(db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision")
      VALUES (${second}::uuid,${match}::uuid,${agent}::uuid,'price',0)`).rejects.toThrow();
    await db.$executeRaw`UPDATE "ArenaLiveCycle" SET state='succeeded' WHERE id=${first}::uuid`;
    await expect(db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision")
      VALUES (${second}::uuid,${match}::uuid,${agent}::uuid,'price',0)`).resolves.toBe(1);
  });
  it('周期不能引用另一场比赛的模型，估值批次不能覆盖同一时点', async () => {
    const a = await createAgent(), b = await createAgent();
    await expect(db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision")
      VALUES (${randomUUID()}::uuid,${a.match}::uuid,${b.agent}::uuid,'initial',0)`).rejects.toThrow();
    const at = new Date('2026-11-12T03:00:00Z');
    await db.$executeRaw`INSERT INTO "ArenaLiveValuation" (id,"matchId",at,frame,evidence)
      VALUES (${randomUUID()}::uuid,${a.match}::uuid,${at},'{}'::jsonb,'{}'::jsonb)`;
    await expect(db.$executeRaw`INSERT INTO "ArenaLiveValuation" (id,"matchId",at,frame,evidence)
      VALUES (${randomUUID()}::uuid,${a.match}::uuid,${at},'{}'::jsonb,'{}'::jsonb)`).rejects.toThrow();
  });
  it('创建与读取按 owner 隔离，开始只建立一次首次预约', async () => {
    const repository = new LiveMatchesRepository(db);
    const created = await repository.create(owner, liveProtocolFixture());
    matches.push(created.id);
    expect((await repository.list(owner)).map((r) => r.id)).toContain(created.id);
    expect((await repository.list(randomUUID())).map((r) => r.id)).not.toContain(created.id);
    await expect(repository.transition(randomUUID(), created.id, 'running')).rejects.toThrow('比赛不存在');
    await repository.transition(owner, created.id, 'running');
    const agents = await liveAgents(db, created.id);
    expect(agents).toHaveLength(2);
    for (const agent of agents) expect((agent.account as typeof account & { wakeups: unknown[] }).wakeups).toHaveLength(1);
    expect(liveSummary(await liveMatch(db, created.id, owner)).state).toBe('running');
    await expect(repository.transition(owner, created.id, 'running')).rejects.toThrow('比赛状态已变化');
  });
  it('暂停后恢复为等待中的模型安排新观察；手动请求去重且只允许本人运行中的比赛', async () => {
    const repository = new LiveMatchesRepository(db);
    const created = await repository.create(owner, liveProtocolFixture());
    matches.push(created.id);
    await repository.transition(owner, created.id, 'running');
    const [agent] = await liveAgents(db, created.id);
    const event = { id: randomUUID(), condition: { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '100' },
      createdAt: new Date().toISOString(), firedAt: null };
    await db.$executeRaw`UPDATE "ArenaLiveAgent" SET account=jsonb_set(account,'{wakeups}',${JSON.stringify([event])}::jsonb)
      WHERE id=${agent!.id}::uuid`;
    await repository.transition(owner, created.id, 'paused');
    await expect(repository.trigger(owner, created.id, agent!.id)).rejects.toThrow('比赛未运行');
    await repository.transition(owner, created.id, 'running');
    let [saved] = await liveAgents(db, created.id);
    const wakeups = (saved!.account as { wakeups: { condition: { kind: string }; firedAt: string | null }[] }).wakeups;
    expect(wakeups.map((w) => w.condition.kind)).toEqual(['price', 'time']);
    await repository.trigger(owner, created.id, agent!.id);
    [saved] = await liveAgents(db, created.id);
    expect((saved!.account as { wakeups: unknown[] }).wakeups).toHaveLength(2);
    await expect(repository.trigger(randomUUID(), created.id, agent!.id)).rejects.toThrow('比赛不存在');
  });
  it('暂停保留委托并取消运行中周期；未知用量需人工处理；结束撤单保留持仓', async () => {
    const repository = new LiveMatchesRepository(db);
    const created = await repository.create(owner, liveProtocolFixture());
    matches.push(created.id);
    await repository.transition(owner, created.id, 'running');
    const [agent] = await liveAgents(db, created.id);
    const initial = agent!.account as { wakeups: { id: string; firedAt: string | null }[] };
    const book = { ...account, wakeups: initial.wakeups, positions: [{ symbol: 'AAPL.US', quantity: '10', acquiredOn: '2026-11-01', availableOn: '2026-11-01' }], orders: [{
      id: randomUUID(), clientId: 'buy', symbol: 'AAPL.US', side: 'buy', kind: 'limit', quantity: '1', price: '100',
      expiresOn: null, exitGroup: null, createdAt: new Date().toISOString(), activeSince: new Date().toISOString(), expiresAt: '2030-12-31T20:00:00Z', state: 'active', reservedCash: '100', reason: null,
    }] };
    await db.$executeRaw`UPDATE "ArenaLiveAgent" SET account=${JSON.stringify(book)}::jsonb WHERE id=${agent!.id}::uuid`;
    const cycle = randomUUID();
    await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision",state,"requestId")
      VALUES (${cycle}::uuid,${created.id}::uuid,${agent!.id}::uuid,${JSON.stringify(book.wakeups.map((w) => w.id))},0,'running',${randomUUID()}::uuid)`;
    await repository.transition(owner, created.id, 'paused');
    let [saved] = await liveAgents(db, created.id);
    expect((saved!.account as typeof book).orders[0]?.state).toBe('active');
    const [run] = await db.$queryRaw<{ state: string }[]>`SELECT state FROM "ArenaLiveCycle" WHERE id=${cycle}::uuid`;
    expect(run!.state).toBe('unknown_usage');
    await repository.transition(owner, created.id, 'running');
    [saved] = await liveAgents(db, created.id);
    expect((saved!.account as typeof book).wakeups.map((w) => w.id)).toEqual(book.wakeups.map((w) => w.id));
    await repository.transition(owner, created.id, 'ended');
    [saved] = await liveAgents(db, created.id);
    expect((saved!.account as typeof book).orders[0]?.state).toBe('cancelled');
    expect((saved!.account as typeof book).positions).toEqual(book.positions);
  });
});
