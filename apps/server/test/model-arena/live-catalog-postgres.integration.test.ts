import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arenaCatalogQuerySchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { LiveMatchesCatalog } from '../../src/model-arena/live/live-matches-catalog.js';
import { liveProtocolFixture } from './live-fixture.js';

const url = process.env.AI_PROVIDER_DATABASE_URL;
if (url && (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/ai_provider_concurrency_fixture'))
  throw Error('比赛目录测试必须使用专属隔离数据库');
const db = new PrismaService({ datasourceUrl: url ?? 'postgresql://fixture@127.0.0.1:1/unused' });
const reader = new LiveMatchesCatalog(db), owner = randomUUID();
const read = (input = {}) => reader.read(owner, arenaCatalogQuerySchema.parse(input));
describe.skipIf(!url)('统一比赛目录数据库读取', () => {
  beforeAll(async () => {
    const protocol = liveProtocolFixture();
    await db.$executeRaw`INSERT INTO "ArenaLiveMatch" (id,"ownerId",protocol,remaining,state,"createdAt")
      SELECT gen_random_uuid(),${owner}::uuid,
        ${JSON.stringify(protocol)}::jsonb || jsonb_build_object('title', '自主 ' || lpad(i::text,3,'0')),
        '{}'::jsonb,CASE WHEN i%2=0 THEN 'paused' ELSE 'draft' END,'2026-11-12T01:00:00'::timestamp
      FROM generate_series(1,205) i`;
    const old = { ...protocol, title: "Oldest Needle%_'", market: 'CN', currency: 'CNY',
      entrants: [{ ...protocol.entrants[0], model: 'Gemma', providerId: 'CaseProvider' }] };
    await db.$executeRaw`INSERT INTO "ArenaLiveMatch" (id,"ownerId",protocol,remaining,state,"createdAt")
      VALUES (${randomUUID()}::uuid,${owner}::uuid,${JSON.stringify(old)}::jsonb,'{}'::jsonb,'ended','2024-01-01')`;
    await db.$executeRaw`INSERT INTO "ModelArena" (id,"ownerId",protocol,remaining,state,"createdAt")
      VALUES (${randomUUID()}::uuid,${owner}::uuid,${JSON.stringify({ ...old, version: 'arena-historical-match-protocol-v1', title: '日频比赛' })}::jsonb,'{}'::jsonb,'ended','2025-01-01')`;
  });
  afterAll(async () => {
    await db.$executeRaw`DELETE FROM "ArenaLiveMatch" WHERE "ownerId"=${owner}::uuid`;
    await db.$executeRaw`DELETE FROM "ModelArena" WHERE "ownerId"=${owner}::uuid`;
    await db.$disconnect();
  });
  it('全集计数超过旧接口上限，最早比赛仍可搜索，时间为有效 UTC', async () => {
    const result = await read();
    expect(result).toMatchObject({ total: 207, totalUnfiltered: 207, page: 1, pageSize: 25 });
    expect(result.items).toHaveLength(25);
    expect(result.items[0]!.createdAt).toBe('2026-11-12T01:00:00.000Z');
    expect((await read({ search: 'oldest' })).items[0]!.title).toBe("Oldest Needle%_'");
  });
  it('查询包含百分号、下划线与单引号时按字面匹配，模型及来源可忽略大小写搜索', async () => {
    expect((await read({ search: "Needle%_'" })).total).toBe(1);
    expect((await read({ search: 'gemma' })).total).toBe(2);
    expect((await read({ search: 'CASEPROVIDER' })).total).toBe(2);
    expect((await read({ search: "' OR 1=1 --" })).total).toBe(0);
  });
  it('类型、市场和状态组合筛选，并保留未筛选总数', async () => {
    const result = await read({ kind: 'history', market: 'CN', state: 'ended' });
    expect(result).toMatchObject({ total: 1, totalUnfiltered: 207 });
    expect(result.items[0]).toMatchObject({ kind: 'history', title: '日频比赛' });
    expect((await read({ market: 'US', state: 'paused' })).total).toBe(102);
  });
  it('稳定排序分页不重复，超出页码归入末页，空结果停留第一页', async () => {
    const first = await read({ pageSize: 10 }), second = await read({ pageSize: 10, page: 2 });
    expect(first.items.some((a) => second.items.some((b) => b.id === a.id && b.kind === a.kind))).toBe(false);
    const last = await read({ page: 1000000 });
    expect(last.page).toBe(9); expect(last.items).toHaveLength(7);
    expect(await read({ search: '没有此比赛', page: 20 })).toMatchObject({ total: 0, page: 1, items: [] });
  });
  it('创建时间、名称和赛期排序保留确定性，其他 owner 不获得数据或计数', async () => {
    expect((await read({ sort: 'created_asc' })).items[0]!.title).toContain('Oldest');
    expect((await read({ sort: 'title' })).items[0]!.title).toContain('Oldest');
    expect((await read({ sort: 'season_desc' })).items).toHaveLength(25);
    expect(await reader.read(randomUUID(), arenaCatalogQuerySchema.parse({})))
      .toMatchObject({ total: 0, totalUnfiltered: 0, items: [], page: 1 });
  });
});
