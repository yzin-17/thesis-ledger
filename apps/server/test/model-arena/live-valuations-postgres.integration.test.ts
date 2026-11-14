import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesRepository } from '../../src/model-arena/live/live-matches.repository.js';
import { LiveValuations } from '../../src/model-arena/live/live-valuations.js';
import { LiveMatchesQuery } from '../../src/model-arena/live/live-matches.query.js';
import { LiveValuationQuery } from '../../src/model-arena/live/live-valuation-query.js';
import { liveAgents } from '../../src/model-arena/live/live-storage.js';
import { liveProtocolFixture } from './live-fixture.js';
const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture')) throw new Error('需要隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' }), ids: string[] = [];
const matches = new LiveMatchesRepository(db);
const market = { getSession: vi.fn().mockResolvedValue({ state: 'open', date: '2026-11-12', evaluatedAt: new Date().toISOString(), sessions: [] }) };
const reader = { read: vi.fn(async () => ({ at: new Date(), session: await market.getSession(), prices: new Map<string, string>(), marketTime: null, evidence: {}, missing: {} })) };
const valuations = new LiveValuations(db, reader, { build: vi.fn() });
async function create() {
  const owner = randomUUID(), m = await matches.create(owner, liveProtocolFixture()); ids.push(m.id);
  await matches.transition(owner, m.id, 'running'); return { owner, id: m.id };
}
describe.skipIf(!url)('自主竞技场共同估值', () => {
  afterAll(async () => {
    for (const id of ids) {
      await db.$executeRaw`DELETE FROM "ArenaLiveValuation" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveAgent" WHERE "matchId"=${id}::uuid`;
      await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE id=${id}::uuid`;
    }
    await db.$disconnect();
  });
  it('同批空仓估值并列，经过公共查询合同仍保留净值和现金基准', async () => {
    const m = await create();
    await valuations.capture(m.id);
    const query = new LiveMatchesQuery(db, { resolve: async () => ({ name: (s: string) => s }) } as never, market as never);
    const detail = await query.read(m.owner, m.id);
    expect(detail.frames[0]).toMatchObject({ complete: true, benchmarks: [{ id: 'cash', nav: '10000', returnRatio: '0' }] });
    expect(detail.frames[0]?.marks.map((x) => [x.nav, x.rank])).toEqual([['10000', 1], ['10000', 1]]);
    expect(detail.agents.every((a) => a.availability.cash === '10000' && a.availability.tradingDate === '2026-11-12')).toBe(true);
  });
  it('行情准备期间账户改变时不发布过时估值', async () => {
    const m = await create();
    reader.read.mockImplementationOnce(async () => {
      await db.$executeRaw`UPDATE "ArenaLiveAgent" SET account=jsonb_set(account,'{revision}',to_jsonb((account->>'revision')::int+1)) WHERE "matchId"=${m.id}::uuid`;
      return { at: new Date(), session: await market.getSession(), prices: new Map(), marketTime: null, evidence: {}, missing: {} };
    });
    await valuations.capture(m.id);
    const rows = await db.$queryRaw<unknown[]>`SELECT id FROM "ArenaLiveValuation" WHERE "matchId"=${m.id}::uuid`;
    expect(rows).toHaveLength(0);
  });
  it('日历未知只记录无金融值的缺口，已结束比赛不继续采样', async () => {
    const m = await create(); reader.read.mockResolvedValueOnce({ failure: true, reason: 'calendar_unavailable',
      session: { state: 'unknown', tradingDayState: 'unknown', reason: 'calendar_unavailable', evaluatedAt: new Date().toISOString(), sessions: [] } } as never);
    await valuations.capture(m.id);
    await matches.transition(m.owner, m.id, 'ended');
    const count = reader.read.mock.calls.length;
    await valuations.capture(m.id);
    expect(reader.read.mock.calls).toHaveLength(count);
    const frames = await db.$queryRaw<{ frame: { kind: string; marks: { nav: null; returnRatio: null; rank: null }[] } }[]>`SELECT frame FROM "ArenaLiveValuation" WHERE "matchId"=${m.id}::uuid`;
    expect(frames).toHaveLength(1); expect(frames[0]?.frame.kind).toBe('gap');
    for (const mark of frames[0]!.frame.marks) expect(mark).toMatchObject({ nav: null, returnRatio: null, rank: null });
  });
  it('结束按最后完整共同批次封存，后续缺口不会成为最终净值或重新排名', async () => {
    const m = await create();
    const complete = await valuations.capture(m.id);
    expect(complete?.complete).toBe(true);
    await valuations.gap(m.id, 'calendar_unavailable', { state: 'unknown', tradingDayState: 'unknown',
      evaluatedAt: new Date().toISOString(), sessions: [], reason: 'calendar_unavailable' });
    await matches.transition(m.owner, m.id, 'ended');
    const query = new LiveMatchesQuery(db, { resolve: async () => ({ name: (s: string) => s }) } as never, market as never);
    const final = await query.read(m.owner, m.id);
    expect(final.frames.at(-1)?.kind).toBe('gap');
    expect(final.sealedFrame?.at).toBe(complete?.at);
    expect(final.sealedFrame?.marks.every((m) => m.nav === '10000' && m.rank === 1)).toBe(true);
    const calls = reader.read.mock.calls.length;
    await valuations.capture(m.id);
    expect(reader.read.mock.calls).toHaveLength(calls);
  });
  it('有界数据库抽样保留每模型极值并独立标明跨缺口断线，期间口径直接读取原始边界批次', async () => {
    const m = await create(), agents = await liveAgents(db, m.id), a = agents[0]!.id, b = agents[1]!.id;
    const base = { at: '2026-11-12T15:00:00.000Z', marketTime: null, complete: true, reason: null,
      marks: [a, b].map((agentId) => ({ agentId, nav: '10000', returnRatio: '0', peakNav: '99999', drawdown: '0', complete: true, reason: null, rank: 1 })),
      benchmarks: [{ id: 'cash', nav: '10000', returnRatio: '0' }] };
    await db.$executeRaw`INSERT INTO "ArenaLiveValuation" (id,"matchId","at",frame,evidence)
      SELECT gen_random_uuid(),${m.id}::uuid,'2026-11-12T15:00:00Z'::timestamptz+i*interval '1 second',
        jsonb_set(jsonb_set(jsonb_set(${JSON.stringify(base)}::jsonb,'{at}',to_jsonb(to_char('2026-11-12T15:00:00Z'::timestamptz+i*interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
          '{marks,0,nav}',to_jsonb(CASE WHEN i=2345 THEN '99999' ELSE '10000' END)),
          '{marks,1,nav}',CASE WHEN i BETWEEN 2000 AND 2010 THEN 'null'::jsonb WHEN i=3456 THEN '"1"'::jsonb ELSE '"10000"'::jsonb END),
        '{"controlled":true}'::jsonb FROM generate_series(0,4999) i`;
    const history = new LiveValuationQuery(db), chart = await history.chart(m.id, 3, 50);
    expect(chart.length).toBeLessThanOrEqual(50);
    expect(chart.some((f) => f.marks[0]?.nav === '99999')).toBe(true);
    expect(chart.some((f) => f.marks[1]?.nav === '1')).toBe(true);
    for (const i of [0, 4999]) expect(chart.some((f) => Date.parse(f.at) === Date.parse(base.at) + i * 1000)).toBe(true);
    expect(chart.some((f) => f.gapBefore.includes('agent:' + b))).toBe(true);
    expect(chart.every((f) => !f.gapBefore.includes('agent:' + a) && !f.gapBefore.includes('baseline:cash'))).toBe(true);
    await db.$executeRaw`UPDATE "ArenaLiveValuation" SET frame=jsonb_set(frame,'{marks,1,nav}','null'::jsonb)
      WHERE "matchId"=${m.id}::uuid AND extract(second FROM "at")::int % 2=0`;
    const fragmented = await history.chart(m.id, 3, 50);
    expect(fragmented.length).toBeLessThanOrEqual(50);
    expect(fragmented.some((f) => f.gapBefore.includes('agent:' + b))).toBe(true);
    expect((await history.before(m.id, '2026-11-13', 'America/New_York'))?.at).toBe(new Date(Date.parse(base.at) + 4999000).toISOString());
  });
});
