import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const work = resolve(root, '.recovery-artifacts/arena-v2-admission-deployment-20261116');
export const KEY = { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'HISTORICAL_EXECUTION_CONTEXT' };
export const TARGET = { providerId: 'historical-execution-archive', upstreamSource: 'qualified-cn-execution' };
const sha = value => createHash('sha256').update(value).digest('hex');
const run = (cmd, args, input) => {
  try {
    return execFileSync(cmd, args, { input, encoding: 'utf8', timeout: 45_000, maxBuffer: 8_000_000 }).trim();
  } catch (error) {
    throw new Error(`${cmd} 执行失败（${error.status ?? error.code}）：${String(error.stderr ?? '').trim().split('\n').at(-1) ?? ''}`);
  }
};
const docker = (...args) => run('docker', args);

export function appendRoute(policy) {
  assert.equal(policy.contractVersion, 3);
  assert.equal(policy.enabled, true);
  assert.equal(policy.syncState, 'applied');
  assert.equal(policy.effectiveStale, false);
  assert(!policy.routes.some(route => route.key.capability === KEY.capability), '已有执行路由，不覆盖或扩展');
  return [...policy.routes, { key: KEY, enabled: true, targets: [TARGET] }];
}

export function partitionValuations(rows, cutoff, now = new Date().toISOString()) {
  const end = Date.parse(now), start = Date.parse(cutoff);
  assert(Number.isFinite(start) && Number.isFinite(end) && start <= end, '估值核验时钟无效');
  const historical = [], appended = [];
  for (const row of rows) {
    const at = Date.parse(JSON.parse(row.value).at);
    assert(Number.isFinite(at) && at <= end, '估值时间无效或位于未来');
    (at <= start ? historical : appended).push(row);
  }
  return { historical, appended };
}

export async function inspectServer(token, readResults, baselineAt) {
  const { createHash } = await import('node:crypto');
  const { PrismaClient } = await import('@prisma/client');
  const { Queue } = await import('bullmq');
  const { RedisService, redisKey } = await import('./dist/src/platform/redis.service.js');
  const redis = new RedisService();
  const queue = new Queue('live', { connection: redis.client, prefix: redisKey('queue', 'arena') });
  const db = new PrismaClient();
  try {
    assert(await queue.isPaused(), '研究队列须保持维护暂停');
    assert.equal(await redis.client.get(redisKey('lock', 'arena-maintenance-owner')), token, '维护暂停归属变化');
    const jobs = await queue.getJobCounts('active', 'wait', 'paused');
    assert.equal(jobs.active, 0, '仍有在途研究任务');
    const business = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const tables = await tx.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND
        (tablename LIKE '%Arena%' OR tablename LIKE 'Ai%' OR tablename IN ('ProviderConfig','Portfolio','Account','Position')) ORDER BY tablename`);
      assert(tables.length >= 10, '业务保护表数量异常');
      const result = {};
      let valuationAppend = null;
      for (const { tablename } of tables) {
        assert(/^[A-Za-z0-9_]+$/u.test(tablename));
        const rows = await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS value FROM public."${tablename}" t`);
        let protectedRows = rows;
        if (tablename === 'ArenaLiveValuation' && baselineAt) {
          const split = partitionValuations(rows, baselineAt);
          protectedRows = split.historical;
          valuationAppend = { count: split.appended.length,
            sha256: createHash('sha256').update(JSON.stringify(split.appended.map(row => row.value).sort())).digest('hex'),
            entries: split.appended.map(row => {
              const value = JSON.parse(row.value);
              return { id: value.id, matchId: value.matchId, at: value.at };
            }) };
        }
        result[tablename] = { count: protectedRows.length,
          sha256: createHash('sha256').update(JSON.stringify(protectedRows.map(row => row.value).sort())).digest('hex') };
      }
      return { protectedTables: result, valuationAppend };
    }, { timeout: 30_000 });
    const results = [];
    if (readResults) {
      const { DsaClient } = await import('./dist/src/integration/dsa/dsa.client.js');
      const client = new DsaClient();
      for (const symbol of ['510300.SH', '588000.SH']) {
        const result = await client.historicalExecution({ symbol, assetType: 'ETF', asOf: '2026-11-10T05:01:00.000Z',
          purpose: 'sampled' });
        assert(result, '正常消费者读取为空');
        assert.equal(result.fact.symbol, symbol);
        assert('identityEvidenceRefs' in result);
        assert.equal(result.trading.state, 'trading');
        assert.equal(result.trading.basis.method, 'sse-fund-halts-v1');
        results.push({ symbol, result });
      }
    }
    return { business: business.protectedTables, valuationAppend: business.valuationAppend,
      jobs, queuePaused: true, results };
  } finally { await db.$disconnect(); await queue.close(); await redis.onModuleDestroy(); }
}

function server(owner, readResults = false, baselineAt = null) {
  const code = `import assert from 'node:assert/strict';\n${partitionValuations.toString()}\n${inspectServer.toString()}\nconsole.log(JSON.stringify(await inspectServer(process.argv[2],process.argv[3]==='read',process.argv[4]||null)));`;
  return JSON.parse(run('docker', ['exec', '-i', '-w', '/app/apps/server', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-', owner.token, readResults ? 'read' : 'snapshot', baselineAt ?? ''], code));
}

function dsa(mode, digest = null) {
  const worker = readFileSync(resolve(root, '../daily-stock-analysis/scripts/local-runtime/historical-execution-admission.py'), 'utf8');
  const payload = mode === 'protection' ? { mode } : { mode, digest };
  const code = `${worker.replace("if __name__ == '__main__':", "if False:")}\nprint(json.dumps(main(json.loads(${JSON.stringify(JSON.stringify(payload))})), ensure_ascii=False))`;
  return JSON.parse(run('docker', ['exec', '-i', '--user', 'dsa:dsa', 'thesis-ledger-dev-dsa-1', 'python', '-B', '-c', code], ''));
}

async function policy(method = 'GET', body) {
  const response = await fetch('http://127.0.0.1:3000/api/market-data/policy', { method,
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, '策略请求失败，不自动重试');
  return response.json();
}

const read = name => JSON.parse(readFileSync(resolve(work, name + '.json'), 'utf8'));
const write = (name, value) => writeFileSync(resolve(work, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

export async function main(mode) {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须经过 infra 正式持锁入口');
  assert(['baseline', 'collect', 'apply', 'verify'].includes(mode), '仅允许基线、采证、首次应用和只读核验');
  assert.equal(docker('context', 'show'), 'desktop-linux');
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const owner = read('queue-owner');
  assert.equal(owner.version, 'arena-maintenance-owner-v1');
  const baseline = mode === 'baseline' ? null : read('baseline');
  const before = server(owner, false, baseline?.at);
  const current = await policy();
  if (mode === 'baseline') {
    const routes = appendRoute(current);
    const protection = dsa('protection');
    assert.deepEqual(protection.targetAdmission, [], '已有准入记录，不覆盖');
    const baseline = { at: new Date().toISOString(), business: before.business,
      policy: current, protection, routes, serverId: docker('inspect', '--format', '{{.Id}}', 'thesis-ledger-dev-thesis-ledger-1') };
    write('baseline', baseline);
    return { mode, originalRoutes: current.routes.length, protectedTables: Object.keys(before.business).length, queuePaused: true };
  }
  assert.equal(docker('inspect', '--format', '{{.Id}}', 'thesis-ledger-dev-thesis-ledger-1'), baseline.serverId, 'Server 实例变化');
  assert.deepEqual(before.business, baseline.business, '业务或模型调用已变化');
  if (mode === 'collect') {
    assert.equal(current.revision, baseline.policy.revision);
    assert.deepEqual(current.routes, baseline.policy.routes);
    assert.deepEqual(dsa('protection'), baseline.protection, '部署后其他来源／准入变化');
    const evidence = dsa('collect');
    assert.equal(evidence.control.protectedSha256, baseline.protection.protectedSha256);
    write('collection-v2', evidence);
    return { mode, digest: evidence.digest, indexSha256: evidence.indexSha256, symbols: evidence.symbols };
  }
  const collection = read('collection-v2');
  if (mode === 'apply') {
    assert.equal(current.revision, baseline.policy.revision);
    assert.deepEqual(appendRoute(current), baseline.routes, '原策略变化');
    write('apply-permit-v2', { digest: collection.digest, at: new Date().toISOString() });
    const admission = dsa('apply', collection.digest);
    write('source-applied', admission);
    const applied = await policy('PUT', { contractVersion: 1, consumer: 'thesis-ledger', requestId: randomUUID(),
      revision: current.revision + 1, expectedRevision: current.revision, enabled: current.enabled, routes: baseline.routes });
    assert.equal(applied.revision, current.revision + 1);
    write('policy-applied', applied);
  }
  const admission = dsa('verify', collection.digest);
  const afterPolicy = await policy();
  assert.equal(afterPolicy.revision, baseline.policy.revision + 1);
  assert.equal(afterPolicy.syncState, 'applied');
  assert.equal(afterPolicy.effectiveStale, false);
  assert.deepEqual(afterPolicy.routes, baseline.routes, '路由读回不符');
  const after = server(owner, true, baseline.at);
  assert.deepEqual(after.business, baseline.business, '业务或模型调用已变化');
  for (const item of after.results) {
    assert.deepEqual(item.result, collection.results.find(result => result.symbol === item.symbol)?.context,
      '正常接口与独立资格读取结果不一致');
  }
  const final = server(owner, false, baseline.at);
  assert.deepEqual(final.business, baseline.business, '正常读取后原业务或模型调用已变化');
  assert.equal(admission.protectedSha256, baseline.protection.protectedSha256);
  const receipt = { at: new Date().toISOString(), mode, admission, policyRevision: afterPolicy.revision,
    preservedRoutes: baseline.policy.routes.length, newRoutes: 1, readback: after.results,
    businessUnchanged: true, modelCalls: 0, competitionOperations: 0, queuePaused: after.queuePaused,
    businessSha256: sha(JSON.stringify(after.business)), jobs: after.jobs };
  receipt.backgroundValuationAppend = final.valuationAppend;
  write(mode + '-receipt', receipt);
  return { mode, status: 'verified', symbols: after.results.map(x => x.symbol), policyRevision: afterPolicy.revision,
    preservedRoutes: receipt.preservedRoutes, modelCalls: 0, competitionOperations: 0, queuePaused: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 3);
    console.log(JSON.stringify(await main(process.argv[2])));
  } catch (error) {
    console.error('历史执行准入维护未完成；保持队列暂停，不自动重试：' + error.message);
    process.exitCode = 1;
  }
}
