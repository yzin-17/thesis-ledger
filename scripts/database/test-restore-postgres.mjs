import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { discoverDatabaseStructure, buildDatabaseRebuildSql } from '../../apps/server/src/platform/database-structure.ts';
import { restoreDatabase } from './restore-db.mjs';

if (process.argv.length > 2) throw new Error('隔离恢复验收不接受业务目标参数');
const name = `ledger-restore-test-${randomUUID().slice(0, 8)}`;
const databaseName = 'restore_fixture', ownerName = 'fixture_owner';
const fixturePassword = 'fixture';
const directory = await mkdtemp(join(tmpdir(), name + '-'));
let container;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`隔离 PostgreSQL 命令失败：${result.stderr || result.error?.code}`);
  return result.stdout.trim();
}
const psql = (sql) => docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', ownerName, '-d', databaseName, '-At'], sql);
async function dump(filename) {
  const file = join(directory, filename);
  docker(['exec', container, 'pg_dump', '-U', ownerName, '-d', databaseName, '--format=custom', '--no-owner', '--file', `/restore/${filename}`]);
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  await writeFile(file + '.sha256', `${digest}  ${filename}\n`);
  return file;
}
const options = {
  env: { DATABASE_URL: `postgresql://${ownerName}:${fixturePassword}@localhost/${databaseName}?schema=public` },
  temporaryRoot: directory,
  run: (tool, args) => docker(['exec', '-i', container, tool, ...args.map((arg) => arg.startsWith(directory) ? arg.replace(directory, '/restore') : arg)]),
};
const apply = (file) => [file, '--apply', '--confirm-database', databaseName, '--confirm-owner', ownerName];
try {
  docker(['image', 'inspect', 'postgres:17-alpine']);
  container = docker(['run', '-d', '--name', name, '--label', 'thesis-ledger.fixture=database-restore',
    '--tmpfs', '/var/lib/postgresql/data', '--mount', `type=bind,src=${directory},dst=/restore`,
    '-e', `POSTGRES_USER=${ownerName}`, '-e', `POSTGRES_PASSWORD=${fixturePassword}`, '-e', `POSTGRES_DB=${databaseName}`, 'postgres:17-alpine']);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    // 初始化阶段的临时实例监听本地套接字，正式实例才能通过 TCP 查询目标库。
    const check = spawnSync('docker', [
      'exec', '-e', `PGPASSWORD=${fixturePassword}`, '-e', 'PGCONNECT_TIMEOUT=2', container,
      'psql', '-XwAt', '-h', '127.0.0.1', '-U', ownerName, '-d', databaseName,
      '-c', 'SELECT current_database(), current_user',
    ], { encoding: 'utf8', timeout: 5000 });
    if (check.status === 0 && check.stdout.trim() === `${databaseName}|${ownerName}`) {
      ready = true;
      break;
    }
    await delay(500);
  }
  assert(ready, '隔离 PostgreSQL 未就绪');
  const structure = await discoverDatabaseStructure(fileURLToPath(new URL('../../apps/server/prisma/', import.meta.url)));
  const rebuild = () => psql(buildDatabaseRebuildSql(structure, '', { databaseName, ownerName }));
  const sentinel = (value) => psql(`CREATE TABLE IF NOT EXISTS public.restore_sentinel(value text); DELETE FROM public.restore_sentinel; INSERT INTO public.restore_sentinel VALUES ('${value}')`);
  rebuild();
  sentinel('archived');
  const current = await dump('current.dump');
  sentinel('before-success');
  const preview = await restoreDatabase([current], options);
  assert.equal(preview.writes, false);
  assert.equal(psql('SELECT value FROM public.restore_sentinel'), 'before-success');
  assert.equal((await restoreDatabase(apply(current), options)).transaction, '已提交');
  assert.equal(psql('SELECT value FROM public.restore_sentinel'), 'archived');

  psql('UPDATE public."SchemaVersion" SET version=\'incompatible-backup\' WHERE id=1');
  const wrongHead = await dump('wrong-head.dump');
  psql(`UPDATE public."SchemaVersion" SET version='${structure.currentHead}' WHERE id=1`);
  sentinel('before-wrong-head');
  await assert.rejects(restoreDatabase(apply(wrongHead), options), /database schema head mismatch/);
  assert.equal(psql('SELECT value FROM public.restore_sentinel'), 'before-wrong-head');
  assert.equal(psql('SELECT version FROM public."SchemaVersion" WHERE id=1'), structure.currentHead);

  const rawTable = structure.rawOwnedTables.find((table) => {
    const identifier = `public."${table.replaceAll('"', '""')}"`;
    return psql(`SELECT count(*) FROM pg_constraint WHERE contype='f' AND (confrelid=to_regclass('${identifier}') OR conrelid=to_regclass('${identifier}'))`) === '0';
  });
  assert(rawTable, '必须覆盖 raw-owned 表');
  psql(`DROP TABLE public."${rawTable.replaceAll('"', '""')}" CASCADE`);
  const missing = await dump('missing-raw-table.dump');
  rebuild();
  sentinel('before-missing-table');
  await assert.rejects(restoreDatabase(apply(missing), options), /备份缺少当前结构表/);
  assert.equal(psql('SELECT value FROM public.restore_sentinel'), 'before-missing-table');
  assert.equal(psql(`SELECT to_regclass('public."${rawTable}"') IS NOT NULL`), 't');
  console.log(JSON.stringify({ databaseName, ownerName, currentHead: structure.currentHead,
    scenarios: ['预检不写入', '当前备份恢复', '错误版本完整回滚', '缺少 raw-owned 表写入前拒绝'], passed: true }));
} finally {
  if (container) {
    const label = docker(['inspect', '--format', '{{index .Config.Labels "thesis-ledger.fixture"}}', container]);
    assert.equal(label, 'database-restore');
    docker(['rm', '--force', container]);
  }
  await rm(directory, { recursive: true, force: true });
}
