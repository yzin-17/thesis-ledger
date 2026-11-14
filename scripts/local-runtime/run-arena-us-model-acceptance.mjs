// 持锁隔离验收入口：临时数据库独立命名、随机本地端口、仅清理本次资源。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { acceptUsModel } from './arena-us-model-acceptance.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须通过正式持锁入口');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [mode, configPath, historyPath, directory] = process.argv.slice(2);
assert(['prepare', 'run'].includes(mode), '必须明确 prepare|run');
for (const file of [configPath, historyPath, directory])
  assert(file && resolve(file).startsWith(resolve(root, 'var/acceptance') + '/'), '全部输入输出须在私有验收目录');
mkdirSync(directory, { mode: 0o700 });
const infra = resolve(root, '../thesis-ledger-infra');
const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env'));
const docker = (args, options = {}) => runtime.runtime.dockerSync(args, options).trim();
const counts = JSON.parse(docker(['exec', 'thesis-ledger-dev-postgres-1', 'psql', '-XAtq', '-U', 'thesis_ledger',
  '-d', 'thesis_ledger', '-c', `SELECT json_build_object('research',(SELECT count(*) FROM "ArenaLiveCycle" WHERE state='running'),
    'backtests',(SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running')));`]));
assert.equal(counts.research, 0, '等待现有真实模型生成完成，不重复调用');
assert.equal(counts.backtests, 0);
const name = 'ledger-arena-us-acceptance-' + randomUUID().slice(0, 8);
let created = false;
let stage = '创建隔离数据库';
try {
  docker(['run', '--pull', 'never', '-d', '--name', name, '--tmpfs', '/var/lib/postgresql/data',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=fixture_owner', '-e', 'POSTGRES_PASSWORD=isolated_fixture',
    '-e', 'POSTGRES_DB=arena_us_model_acceptance', 'postgres:17-alpine']);
  created = true;
  stage = '等待隔离数据库';
  for (let n = 0; ; n++) {
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'fixture_owner', '-d', 'arena_us_model_acceptance']); break; }
    catch { assert(n < 40, '隔离数据库未就绪'); await new Promise(done => setTimeout(done, 250)); }
  }
  const sql = text => docker(['exec', '-i', name, 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1',
    '-U', 'fixture_owner', '-d', 'arena_us_model_acceptance', '-f', '-'], { input: text });
  assert.equal(sql('SELECT current_database();'), 'arena_us_model_acceptance');
  const migrations = resolve(root, 'apps/server/prisma/migrations');
  for (const item of readdirSync(migrations, { withFileTypes: true }).filter(row => row.isDirectory()).map(row => row.name).sort()) {
    stage = '隔离迁移：' + item;
    sql(readFileSync(resolve(migrations, item, 'migration.sql'), 'utf8'));
  }
  stage = '读取隔离端口与模型验收';
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  const result = await acceptUsModel({ databaseUrl: 'postgresql://fixture_owner:isolated_fixture@127.0.0.1:' + port + '/arena_us_model_acceptance',
    configPath, historyPath, output: directory, dispatch: mode === 'run' });
  writeFileSync(resolve(directory, 'receipt.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, modelCalls: result.modelCalls, fills: result.fills, nextCycles: result.nextCycles, directory }));
} catch (error) {
  writeFileSync(resolve(directory, 'failure.json'), JSON.stringify({ status: 'failed', stage, message: error.message,
    stderr: error.stderr, stdout: error.stdout, at: new Date().toISOString() }) + '\n', { mode: 0o600, flag: 'wx' });
  console.error(JSON.stringify({ status: 'failed', stage, reason: error.message, directory })); process.exitCode = 1;
} finally { if (created) docker(['rm', '-f', name]); }
