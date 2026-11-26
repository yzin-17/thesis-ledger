// 正式持锁入口：只读业务配置，按意图批次进行零费率本地调用，临时数据库仅清理本次资源。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { acceptContingentModel } from './arena-contingent-model-acceptance.mjs';
import { replayContingentCaptures } from './arena-contingent-captured-replay.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? '');
const capture = process.argv[3] ? resolve(process.argv[3]) : null;
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'), '输出须位于私有验收目录');
if (capture) assert(capture.startsWith(resolve(root, 'var/acceptance') + '/'), '捕获输入须位于私有验收目录');
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
mkdirSync(output, { mode: 0o700 });
const infra = resolve(root, '../thesis-ledger-infra');
const runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env'));
const docker = (args, options = {}) => runtime.runtime.dockerSync(args, options).trim();
const query = sql => docker(['exec', 'thesis-ledger-dev-postgres-1', 'psql', '-XAtq', '-U', 'thesis_ledger', '-d', 'thesis_ledger', '-c', sql]);
const jobs = JSON.parse(query(`SELECT json_build_object('research',(SELECT count(*) FROM "ArenaLiveCycle" WHERE state='running'),
  'backtests',(SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running')));`));
assert.equal(jobs.research, 0, '等待已有真实研究结束'); assert.equal(jobs.backtests, 0);
const row = JSON.parse(query(`SELECT to_jsonb(p)-'encryptedCredentials' FROM "ProviderConfig" p WHERE name='lmstudio'`));
assert.equal(row.settings.authMode, 'none');
assert.equal(new URL(row.settings.baseUrl).hostname, '192.168.5.20', '仅使用已配置本地模型');
const model = row.settings.models[0];
assert.equal(row.settings.models.length, 1);
assert.equal(row.settings.modelPricing[model].costPer1kInput, 0);
assert.equal(row.settings.modelPricing[model].costPer1kOutput, 0);
writeFileSync(resolve(output, 'provider.json'), JSON.stringify(row, null, 2), { mode: 0o600, flag: 'wx' });
const name = 'ledger-arena-contingent-' + randomUUID().slice(0, 8);
let created = false;
try {
  docker(['run', '--pull', 'never', '-d', '--name', name, '--tmpfs', '/var/lib/postgresql/data',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=fixture_owner', '-e', 'POSTGRES_PASSWORD=isolated_fixture',
    '-e', 'POSTGRES_DB=arena_contingent_model_acceptance', 'postgres:17-alpine']);
  created = true;
  for (let n = 0; ; n++) {
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'fixture_owner', '-d', 'arena_contingent_model_acceptance']); break; }
    catch { assert(n < 40, '隔离数据库未就绪'); await new Promise(done => setTimeout(done, 250)); }
  }
  const sql = input => docker(['exec', '-i', name, 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'fixture_owner', '-d', 'arena_contingent_model_acceptance', '-f', '-'], { input });
  assert.equal(sql('SELECT current_database(), current_user;'), 'arena_contingent_model_acceptance|fixture_owner');
  const migrations = resolve(root, 'apps/server/prisma/migrations');
  for (const entry of readdirSync(migrations, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort())
    sql(readFileSync(resolve(migrations, entry, 'migration.sql'), 'utf8'));
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  const options = { databaseUrl: 'postgresql://fixture_owner:isolated_fixture@127.0.0.1:' + port + '/arena_contingent_model_acceptance', row, output, capture };
  const result = await (capture ? replayContingentCaptures(options) : acceptContingentModel(options));
  writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, calls: result.calls ?? result.modelCalls,
    results: result.results.map(({ id, category }) => ({ id, category })) }));
} catch (error) {
  writeFileSync(resolve(output, 'failure.json'), JSON.stringify({ message: error.message, at: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
  throw error;
} finally { if (created) docker(['rm', '-f', name]); }
