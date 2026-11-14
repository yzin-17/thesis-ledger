import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { ArenaLiveBudget } from '@thesis-ledger/schemas';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveResearchBudget } from '../../src/model-arena/live/live-research-budget.js';
import { liveAgents, liveMatch, type LiveCycleRow } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要专属隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const unlimited = { requests: null, tokens: null, costMicros: null }, amount = { requests: 1, tokens: 10, costMicros: 5 };
const ids: string[] = [], accounting = new LiveResearchBudget(db);
async function setup(matchBudget: ArenaLiveBudget = unlimited, agentBudget: ArenaLiveBudget = unlimited) {
  const p = liveProtocolFixture({ startsOn: null, endsOn: null, budget: matchBudget });
  p.entrants = p.entrants.map((e) => ({ ...e, budget: agentBudget }));
  const store = new LiveMatchesRepository(db), owner = randomUUID(), created = await store.create(owner, p);
  ids.push(created.id); await store.transition(owner, created.id, 'running');
  const cycles: string[] = [];
  for (const agent of await liveAgents(db, created.id)) {
    const id = randomUUID(); cycles.push(id);
    const lease = new Date(Date.now() + 60000);
    await db.$executeRaw`INSERT INTO "ArenaLiveCycle" (id,"matchId","agentId",trigger,"bookRevision",state,attempt,"deadlineAt","leaseUntil")
      VALUES (${id}::uuid,${created.id}::uuid,${agent.id}::uuid,'controlled',0,'running',1,${lease},${lease})`;
  }
  return { id: created.id, cycles };
}
async function cycle(id: string) { return (await db.$queryRaw<LiveCycleRow[]>`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`)[0]!; }
describe.skipIf(!url)('不限额预算事务与审计', () => {
  afterAll(async () => {
    for (const id of ids) {
      await db.$executeRaw`DELETE FROM "ArenaLiveCycle" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('多次模型与工具预留结算不耗尽不限额，实际用量仍逐笔保存，重复结算不改账', async () => {
    const f = await setup(), id = f.cycles[0]!;
    for (let i = 0; i < 3; i++) {
      const request = randomUUID(); await accounting.reserve(id, 1, request, amount, { kind: i ? 'research_tool' : 'model' });
      await accounting.settle(id, request, amount, { actualModel: 'controlled' });
      await accounting.settle(id, request, { requests: 0, tokens: 0, costMicros: 0 }, {});
    }
    expect((await liveMatch(db, f.id)).remaining).toEqual(unlimited);
    for (const agent of await liveAgents(db, f.id)) expect(agent.remaining).toEqual(unlimited);
    const calls = (await cycle(id)).requestAudit as { calls: { used: unknown; state: string }[] };
    expect(calls.calls).toHaveLength(3); for (const call of calls.calls) expect(call).toMatchObject({ state: 'settled', used: amount });
  });
  it('有限全场额度并发只允许一笔，不限额模型不绕过全场保护', async () => {
    const f = await setup({ ...unlimited, requests: 1 });
    const results = await Promise.allSettled(f.cycles.map((id) => accounting.reserve(id, 1, randomUUID(), amount, {})));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: new Error('competition_budget') });
    expect((await liveMatch(db, f.id)).remaining).toEqual({ ...unlimited, requests: 0 });
    for (const agent of await liveAgents(db, f.id)) expect(agent.remaining).toEqual(unlimited);
  });
  it('全场不限额仍遵守模型的零请求额度，拒绝时事务不留预留或审计', async () => {
    const f = await setup(unlimited, { ...unlimited, requests: 0 });
    await expect(accounting.reserve(f.cycles[0]!, 1, randomUUID(), amount, {})).rejects.toThrow('participant_budget');
    expect((await cycle(f.cycles[0]!)).reservation).toBeNull(); expect((await liveMatch(db, f.id)).remaining).toEqual(unlimited);
  });
  it('混合维度退回已知差额，未知结果继续阻止补发并标记待处理', async () => {
    const f = await setup({ ...unlimited, costMicros: 10 }), id = f.cycles[0]!;
    const first = randomUUID(); await accounting.reserve(id, 1, first, amount, {});
    await accounting.settle(id, first, { requests: 1, tokens: 8, costMicros: 3 }, {});
    expect((await liveMatch(db, f.id)).remaining).toEqual({ ...unlimited, costMicros: 7 });
    const second = randomUUID(); await accounting.reserve(id, 1, second, amount, {});
    await expect(accounting.reserve(id, 1, randomUUID(), amount, {})).rejects.toThrow('cycle_not_active');
    await accounting.settle(id, second, null, {}); await accounting.fail(id, 1, 'unknown_usage');
    expect((await liveMatch(db, f.id)).remaining).toEqual({ ...unlimited, costMicros: 2 });
    expect(await cycle(id)).toMatchObject({ state: 'unknown_usage' });
    const saved = await cycle(id), agent = (await liveAgents(db, f.id)).find((a) => a.id === saved.agentId)!;
    expect(agent).toMatchObject({ state: 'needs_attention' });
  });
});
