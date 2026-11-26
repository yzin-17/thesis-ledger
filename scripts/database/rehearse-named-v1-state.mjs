import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as storage from '../../../thesis-ledger-infra/scripts/state-backup.mjs';
import { captureRedisNamespace, withRestoredRedisNamespace } from '../../../thesis-ledger-infra/scripts/redis-namespace-recovery.mjs';
import { restoreArchives } from '../local-runtime/research-state-restore.mjs';
import { createUpgradeIsolation, runUpgradeIsolationSql } from '../../apps/server/src/platform/database-upgrade-isolation.ts';
import { restoreDatabaseUpgradeBackup } from '../../apps/server/src/platform/database-upgrade-restore.ts';

const [directory] = process.argv.slice(2);
assert(process.argv.length === 3 && directory, '需要提供本次私有演练目录');
storage.checkOutputDirectory(directory);
mkdirSync(directory, { recursive: true, mode: 0o700 });

const format = 'thesis-ledger-named-v1-state-v1';
const target = { databaseName: 'thesis_ledger', ownerName: 'thesis_ledger' };
const postgres = storage.target + '-postgres-1';
const redis = storage.target + '-redis-1';
const prefix = 'thesis-ledger:queue:v1:arena:';
const restoreTarget = { owner: target.ownerName, database: target.databaseName };
const redisImage = storage.inspect(redis);
assert.equal(redisImage.Config.Labels?.['com.docker.compose.project'], storage.target);
const tables = [
  'LedgerEvent', 'PortfolioSnapshot', 'Strategy', 'StrategyVersion', 'BacktestJob',
  'AiRun', 'AiToolCall', 'ProviderConfig', 'DesiredProviderPolicy', 'DesiredProviderPolicyRevision',
  'ArenaLiveMatch', 'ArenaLiveAgent', 'ArenaLiveCycle', 'ArenaLiveTimeline', 'ArenaLiveValuation',
  'ModelArena', 'ArenaEntrant', 'ArenaRound', 'ArenaReservation', 'ArenaFill', 'ArenaOccurrence',
  'ArenaResearchPacket', 'ArenaWeek', 'ArenaWeekRevision',
];
const protectionSql = `SELECT jsonb_build_object(
  'database',current_database(),
  'owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
  'head',(SELECT version FROM "SchemaVersion" WHERE id=1),
  'active',(SELECT count(*) FROM "ArenaLiveCycle" WHERE state='running' OR reservation->>'settled'='false')
    + (SELECT count(*) FROM "BacktestJob" WHERE status IN ('queued','running'))
    + (SELECT count(*) FROM "AiRun" WHERE status IN ('queued','running')),
  'tables',jsonb_build_object(
    ${tables.map((table) => `'${table}',(SELECT jsonb_build_array(count(*),
       md5(coalesce(string_agg(md5(to_jsonb(row_value)::text),'' ORDER BY md5(to_jsonb(row_value)::text)),'')))
       FROM "${table}" row_value)`).join(',')}
  ),
  'replay',(SELECT jsonb_build_object('id',id,'checksum',"resultChecksum")
    FROM "BacktestJob" WHERE status='succeeded' AND result->>'schemaVersion'='3'
      AND "resultChecksum" ~ '^[a-f0-9]{16}$'
    ORDER BY "finishedAt" DESC,id LIMIT 1)
);`;

function assertState(state) {
  assert.equal(state.database, target.databaseName);
  assert.equal(state.owner, target.ownerName);
  assert.equal(state.active, 0, '受影响业务仍在运行');
  assert(state.head && state.replay, '源数据库缺少结构标识或可重放制品');
}

const ledgerSql = readFileSync(new URL('./named-v1-arena-ledger.sql', import.meta.url));
function readLedger(container) {
  const rows = storage.docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1',
    '-U', target.ownerName, '-d', target.databaseName], { input: ledgerSql });
  const tsx = fileURLToPath(new URL('../../apps/server/node_modules/.bin/tsx', import.meta.url));
  return JSON.parse(execFileSync(tsx, [fileURLToPath(new URL(
    '../../apps/server/src/platform/named-v1-arena-ledger.ts', import.meta.url,
  ))], { input: rows }));
}

function readQueues(container) {
  const command = `
  local out = {}
  for _, name in ipairs({'live', 'rounds', 'weeklies'}) do
    local base = ARGV[1] .. name .. ':'
    local entries = {}
    for _, state in ipairs({'wait', 'paused', 'active'}) do
      entries[state] = redis.call('LRANGE', base .. state, 0, -1)
    end
    entries.delayed = redis.call('ZRANGE', base .. 'delayed', 0, -1)
    entries.prioritized = redis.call('ZRANGE', base .. 'prioritized', 0, -1)
    entries.isPaused = redis.call('HEXISTS', base .. 'meta', 'paused')
    entries.jobs = {}
    for _, state in ipairs({'wait','paused','delayed','prioritized'}) do
      for _, id in ipairs(entries[state]) do
        entries.jobs[id] = redis.call('HGET', base .. id, 'data')
      end
    end
    out[name] = entries
  end
  return cjson.encode(out)`;
  const raw = JSON.parse(storage.docker(['exec', container, 'redis-cli', '--raw', 'EVAL_RO', command, '0', prefix]));
  for (const queue of Object.values(raw))
    for (const state of ['wait', 'paused', 'active', 'delayed', 'prioritized'])
      if (!Array.isArray(queue[state])) { assert.deepEqual(queue[state], {}); queue[state] = []; }
  return raw;
}

function verifyQueues(ledger, queues) {
  for (const [name, queue] of Object.entries(queues))
    for (const state of ['active', 'delayed', 'prioritized', ...(name !== 'live' ? ['wait', 'paused'] : [])])
      assert.equal(queue[state].length, 0, '存在未审阅的 Arena 队列状态 ' + name + '/' + state);
  assert.equal(queues.live.isPaused, 1, 'Arena 实时队列需维持原暂停状态');
  const pending = [...queues.live.wait, ...queues.live.paused].sort();
  assert.deepEqual(pending, ledger.pending.map(({ jobId }) => jobId).sort());
  for (const item of ledger.pending)
    assert.deepEqual(JSON.parse(queues.live.jobs[item.jobId]), { id: item.id, attempt: item.attempt + 1 });
}

const ledger = readLedger(postgres);
const queues = readQueues(redis);
verifyQueues(ledger, queues);
const redisArchive = captureRedisNamespace(redis, prefix);
const bundle = join(directory, 'bundle');
const manifest = await storage.backup(bundle, { format, protectionSql, assertState, postgresPointInTime: true });
assert.equal(manifest.images.postgres, storage.inspect(postgres).Image);
assert.deepEqual(readLedger(postgres), ledger, '备份期间 Arena 执行账变化');
const latest = storage.sql(postgres, protectionSql);
const stableState = (state) => {
  const { ArenaLiveValuation: _appended, ...tables } = state.tables;
  return { ...state, tables };
};
assert.deepEqual(stableState(latest), stableState(manifest.state), '备份期间受保护的业务状态变化');
assert.deepEqual(readQueues(redis), queues, '备份期间 Arena 队列变化');
const stalledChecks = new Set(['live', 'rounds', 'weeklies'].map((name) => prefix + name + ':stalled-check'));
const queueStateWithoutWorkerHeartbeats = (archive) => archive.filter((row) =>
  row.expiresAt === -1 || !stalledChecks.has(row.key));
assert(isDeepStrictEqual(queueStateWithoutWorkerHeartbeats(captureRedisNamespace(redis, prefix)),
  queueStateWithoutWorkerHeartbeats(redisArchive)), '备份期间 Arena Redis 作业或队列状态变化');
const redisPayload = JSON.stringify(redisArchive);
writeFileSync(join(directory, 'arena-redis.json'), redisPayload, { flag: 'wx', mode: 0o600 });
const redisHash = storage.digest(redisPayload);
assert.equal(await storage.checksum(join(directory, 'arena-redis.json')), redisHash);
await storage.verifyBundle(bundle, { format });

const recovered = join(directory, 'restored');
mkdirSync(recovered, { mode: 0o700 });
restoreArchives(bundle, recovered);
assert.equal(await storage.checksum(join(recovered, 'dsa', 'stock_analysis.db')), manifest.sqliteDigest);
for (const reference of ledger.archiveRefs) {
  const file = join(recovered, 'dsa', reference);
  assert(lstatSync(file).isFile());
  assert.equal(await storage.checksum(file), reference.slice('arena-history/'.length, -'.json'.length));
}

const isolation = await createUpgradeIsolation(postgres, target);
const dump = manifest.files.find((entry) => entry.name === 'postgres.dump');
try {
  assert.equal(isolation.image, manifest.images.postgres);
  await restoreDatabaseUpgradeBackup({ sourceContainer: postgres, target, outputPath: join(bundle, dump.name),
    backupBytes: dump.bytes, backupSha256: dump.sha256 }, isolation.container, isolation.isolationToken);
  assert.deepEqual(storage.sql(isolation.container, protectionSql, restoreTarget), manifest.state);
  assert.deepEqual(readLedger(isolation.container), ledger);
  await withRestoredRedisNamespace(redisImage.Image, prefix, JSON.parse(redisPayload), async (restoredRedis) => {
    const restoredQueues = readQueues(restoredRedis);
    assert.deepEqual(restoredQueues, queues);
    verifyQueues(readLedger(isolation.container), restoredQueues);
    const script = readFileSync(new URL('./replay-named-v1-recovered-backtest.mjs', import.meta.url));
    let replay;
    try {
      replay = JSON.parse(storage.docker(['run', '--rm', '--pull', 'never', '--network', 'none', '--read-only',
      '--user', '0:0', '--mount',
      'type=bind,source=' + resolve(recovered, 'backtest') + ',target=/app/var/backtest,readonly',
      '--entrypoint', 'node', '-i', manifest.images.worker, '--input-type=module', '-',
      manifest.state.replay.id, manifest.state.replay.checksum], { input: script }));
    } catch (error) {
      if (error.stderr) writeFileSync(join(directory, 'backtest-replay.stderr'), error.stderr, { flag: 'wx', mode: 0o600 });
      throw error;
    }
    assert(replay.identicalReplay && replay.replayCount === 2);
    assert.equal(replay.resultChecksum, manifest.state.replay.checksum);
    const applySql = (sql) => runUpgradeIsolationSql(isolation.container, target, sql, isolation.isolationToken);
    await assert.rejects(applySql(`BEGIN;
      UPDATE "ArenaLiveCycle" SET "bookRevision"="bookRevision"+1 WHERE state='pending';
      SELECT 1/0; COMMIT;`), /22012/u);
    assert.deepEqual(storage.sql(isolation.container, protectionSql, restoreTarget), manifest.state);
    verifyQueues(readLedger(isolation.container), restoredQueues);
  });
} finally {
  await isolation.dispose();
}
const { archiveRefs, ...arena } = ledger;
const receipt = { format, head: manifest.state.head, images: { ...manifest.images, redis: redisImage.Image },
  redisKeys: redisArchive.length, redisHash, arenaArchives: archiveRefs.length, arena,
  sqlite: 'verified', backtestReplay: true, postgresFailureRolledBack: true };
writeFileSync(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(receipt));
