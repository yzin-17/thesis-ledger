// 仅检查目标编译产物及目录 SELECT；不启动应用、队列、行情或模型。
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const files = ['dist/src/model-arena/live/live-matches-catalog.js',
  'dist/src/model-arena/live/live-matches.controller.js', 'dist/src/model-arena/live/arena-live.module.js'];
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
if (process.argv[2] === '--inside') {
  const { PrismaService } = await import('./dist/src/platform/prisma.service.js');
  const { LiveMatchesCatalog } = await import('./dist/src/model-arena/live/live-matches-catalog.js');
  const { arenaCatalogQuerySchema } = await import('@thesis-ledger/schemas');
  const db = new PrismaService();
  try {
    const [owner] = await db.$queryRaw`SELECT "ownerId"::text AS id FROM "ModelArena"
      UNION SELECT "ownerId"::text AS id FROM "ArenaLiveMatch" LIMIT 1`;
    assert(owner, '当前环境缺少用于目录只读验收的比赛');
    const catalog = new LiveMatchesCatalog(db);
    const all = await catalog.read(owner.id, arenaCatalogQuerySchema.parse({ pageSize: 10 }));
    assert(all.items.length > 0);
    const first = all.items[0];
    const selected = await catalog.read(owner.id, arenaCatalogQuerySchema.parse({
      search: first.title.slice(0, 2), state: first.state, market: first.market, kind: first.kind, pageSize: 10,
    }));
    assert(selected.items.some((item) => item.id === first.id && item.kind === first.kind));
    const empty = await catalog.read(randomUUID(), arenaCatalogQuerySchema.parse({}));
    assert.equal(empty.total, 0); assert.equal(empty.totalUnfiltered, 0); assert.equal(empty.items.length, 0);
    console.log(JSON.stringify({ status: 'passed', total: all.total, selectedTotal: selected.total,
      isolatedOwnerEmpty: true, databaseReads: 4, databaseWrites: 0, sourceReads: 0, modelCalls: 0,
      hashes: Object.fromEntries(files.map((path) => [path, digest(path)])) }));
  } finally { await db.$disconnect(); }
} else {
  const container = 'thesis-ledger-dev-thesis-ledger-1';
  const format = '{{.Id}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Health.Status}}';
  const identity = execFileSync('docker', ['inspect', '--format', format, container], { encoding: 'utf8' }).trim();
  assert.match(identity, /^[a-f\d]{64}\|thesis-ledger-dev\|thesis-ledger\|healthy$/);
  const result = spawnSync('docker', ['exec', '-i', '-w', '/app/apps/server', identity.split('|')[0],
    'node', '--input-type=module', '-', '--inside'], {
    input: readFileSync(new URL(import.meta.url)), encoding: 'utf8', timeout: 30000, maxBuffer: 512 * 1024,
  });
  assert.equal(result.status, 0, '目标目录只读检查失败：' + (result.error?.message ?? result.stderr.slice(-1500)));
  const receipt = JSON.parse(result.stdout.trim());
  for (const path of files) assert.equal(receipt.hashes[path], digest(new URL('../../apps/server/' + path, import.meta.url)), '目标编译产物与宿主不一致');
  delete receipt.hashes;
  console.log(JSON.stringify({ ...receipt, containerId: identity.split('|')[0], runtimeFilesMatched: files.length }));
}
