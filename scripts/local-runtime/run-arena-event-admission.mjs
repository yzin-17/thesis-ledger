import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { allowHistoricalFetch } from './arena-historical-execution-check.mjs';
import { partitionValuations, inspectServer } from './run-arena-execution-admission.mjs';

export function appendEventRoutes(policy) {
  assert.equal(policy.revision, 201);
  assert.equal(policy.enabled, true);
  assert.equal(policy.syncState, 'applied');
  assert.equal(policy.effectiveStale, false);
  assert.equal(policy.routes.length, 147);
  const keys = ['CASH_DISTRIBUTION', 'SPLIT_EVENT'].map(capability =>
    ({ kind: 'data', market: 'CN', assetType: 'ETF', capability }));
  assert(!policy.routes.some(route => route.key.kind === 'data' && route.key.market === 'CN'
    && route.key.assetType === 'ETF' && ['CASH_DISTRIBUTION', 'SPLIT_EVENT'].includes(route.key.capability)),
    '已有精确事件路由，不覆盖');
  return [...policy.routes, ...keys.map(key => ({ key, enabled: true,
    targets: [{ providerId: 'official-event-archive', upstreamSource: 'sse-disclosure-history' }] }))];
}

export async function readEvents(owner, cutoff) {
  const { DsaClient } = await import('./dist/src/integration/dsa/dsa.client.js');
  const { loadConfig } = await import('./dist/src/platform/config.js');
  const { marketEventExchangeV3Schema } = await import('@thesis-ledger/schemas');
  const before = await inspectServer(owner, false, cutoff);
  const origin = new URL(loadConfig().dsaBaseUrl).origin, original = globalThis.fetch;
  const calls = [], results = [];
  try {
    globalThis.fetch = (url, init) => {
      allowHistoricalFetch(url, origin);
      assert(calls.length < 80, '事件读回超过有界请求预算');
      calls.push(new URL(url).pathname);
      return original(url, { ...init, redirect: 'error' });
    };
    const dsa = new DsaClient();
    const policy = (await dsa.effectiveControlPolicyV3()).projection?.effective;
    const catalog = await dsa.marketRouteCatalogV3();
    assert(policy && policy.revision === 202 && catalog.integrity === 'complete');
    const days = ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06',
      '2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-16'];
    for (const end of days) for (const symbol of ['588000.SH', '510300.SH']) {
      for (const capability of ['CASH_DISTRIBUTION', 'SPLIT_EVENT']) {
        const routeKey = { kind: 'data', market: 'CN', assetType: 'ETF', capability };
        const request = { contractVersion: 1, requestId: crypto.randomUUID(), symbol, routeKey,
          routeTarget: { providerId: 'official-event-archive', upstreamSource: 'sse-disclosure-history', routeIndex: 0 },
          desiredRevision: 202, effectivePolicyRevision: 202, catalogRevision: catalog.catalogRevision,
          start: '2026-11-02', end, dataAsOf: end + 'T05:01:00.000Z' };
        const response = await dsa.marketEventsV3(request);
        const exchange = marketEventExchangeV3Schema.parse({ request, response });
        assert.deepEqual(exchange.response.facts, []);
        assert.deepEqual(exchange.response.coverage, { complete: true,
          admissionEvidenceRef: 'sha256:4a3023187b35ae99719c8132ad227877894c80615890a60ad54d979641715987' });
        assert.equal(exchange.response.admission?.recordVersion, 1);
        results.push(exchange);
      }
    }
    const after = await inspectServer(owner, false, cutoff);
    assert.deepEqual(after.business, before.business, '事件读回期间业务或模型记录变化');
    return { ...after, calls, results };
  } finally { globalThis.fetch = original; }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
  const [output, mode = 'apply'] = process.argv.slice(2);
  assert(['apply', 'verify', 'audit'].includes(mode) && process.argv.length <= 4);
  assert(resolve(output).startsWith(resolve(root, '.recovery-artifacts') + '/'));
  if (mode === 'apply') mkdirSync(output, { mode: 0o700 });
  const write = (name, value) => writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  const run = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 12 * 1024 * 1024 }).trim(); }
    catch (error) {
      writeFileSync(resolve(output, 'runtime-failure-' + Date.now() + '.log'), String(error.stderr ?? ''), { flag: 'wx', mode: 0o600 });
      throw new Error('运行态命令失败，完整错误保存在私有目录');
    }
  };
  const owner = JSON.parse(readFileSync(resolve(root, '.recovery-artifacts/arena-v2-admission-deployment-20261116/queue-owner.json')));
  assert.equal(owner.version, 'arena-maintenance-owner-v1');
  assert.equal(run(['context', 'show']), 'desktop-linux');
  const saved = mode !== 'apply' ? JSON.parse(readFileSync(resolve(output, 'baseline.json'))) : null;
  const predeploy = mode === 'apply' ? JSON.parse(readFileSync(resolve(root,
    '.recovery-artifacts/arena-event-source-predeploy-20261116/receipt.json'))) : null;
  if (predeploy) {
    assert.equal(predeploy.mode, 'guard');
    assert.equal(predeploy.status, 'passed');
    assert.equal(predeploy.queuePaused, true);
    assert(Object.values(predeploy.jobs).every(x => x === 0));
    assert(Object.values(predeploy.backtestJobs).every(x => x === 0));
  }
  const cutoff = saved?.at ?? predeploy.cutoff;
  const inspect = read => JSON.parse(run(['exec', '-i', '-w', '/app/apps/server', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-', owner.token], `import assert from 'node:assert/strict';\n` +
    [allowHistoricalFetch, partitionValuations, inspectServer, readEvents].map(fn => fn.toString()).join('\n') +
    `\nconsole.log(JSON.stringify(await ${read ? 'readEvents' : 'inspectServer'}(process.argv[2],${read ? JSON.stringify(cutoff) : 'false,' + JSON.stringify(cutoff)})));`));
  const before = inspect(false);
  const policy = async (method = 'GET', body) => {
    const result = await fetch('http://127.0.0.1:3000/api/market-data/policy', { method,
      headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    assert.equal(result.status, 200, '政策读取或写入失败，不自动重试');
    return result.json();
  };
  const current = await policy();
  let baseline = saved;
  if (mode === 'apply') {
    assert.deepEqual(before.business, predeploy.protectedTables, '部署前以来的业务或模型记录变化');
    baseline = { at: cutoff, business: before.business, policy: current, routes: appendEventRoutes(current) };
    write('baseline', baseline);
  } else assert.deepEqual(before.business, baseline.business, '首次事件准入基线以来业务或模型记录变化');
  const dsaRoot = resolve(root, '../daily-stock-analysis');
  const source = readFileSync(resolve(dsaRoot, 'scripts/local-runtime/historical-execution-admission.py'), 'utf8')
    .replace("if __name__ == '__main__':", 'if False:') + '\n' +
    readFileSync(resolve(dsaRoot, 'scripts/local-runtime/sse-event-coverage-admission.py'), 'utf8')
      .replace("if __name__ == '__main__':", 'if False:');
  const dsa = (action, digest = null) => JSON.parse(run(['exec', '-i', '--user', 'dsa:dsa', 'thesis-ledger-dev-dsa-1', 'python', '-B', '-'],
    source + `\nprint(json.dumps(event_main(json.loads(${JSON.stringify(JSON.stringify({ mode: action, digest }))})),ensure_ascii=False))`));
  let collection;
  if (mode === 'apply') {
    collection = dsa('collect');
    write('collection', collection);
    write('apply-permit', { at: new Date().toISOString(), digest: collection.digest });
    write('source-applied', dsa('apply', collection.digest));
    const applied = await policy('PUT', { contractVersion: 1, consumer: 'thesis-ledger', requestId: randomUUID(),
      revision: 202, expectedRevision: 201, enabled: true, routes: baseline.routes });
    write('policy-applied', applied);
  } else collection = JSON.parse(readFileSync(resolve(output, 'collection.json')));
  const admission = dsa('verify', collection.digest);
  const afterPolicy = await policy();
  assert.equal(afterPolicy.revision, 202);
  assert.equal(afterPolicy.syncState, 'applied');
  assert.equal(afterPolicy.effectiveStale, false);
  assert.deepEqual(afterPolicy.routes, baseline.routes);
  const reads = mode === 'audit' ? JSON.parse(readFileSync(resolve(output, 'event-readback.json'))) : inspect(true);
  assert.deepEqual(reads.business, baseline.business, '原业务或模型记录变化');
  if (mode !== 'audit') write(mode === 'apply' ? 'event-readback' : 'event-readback-verification', reads);
  const final = inspect(false);
  assert.deepEqual(final.business, baseline.business);
  assert(Object.values(final.jobs).every(x => x === 0), '研究队列出现待执行作业');
  write(mode === 'apply' ? 'receipt' : mode === 'audit' ? 'audit-receipt' : 'verification-receipt', { status: 'passed', at: new Date().toISOString(),
    admission, policyRevision: 202, preservedRoutes: 147, appendedRoutes: 2,
    realModelCalls: 0, competitionOperations: 0, automaticRetries: 0, businessUnchanged: true,
    queuePaused: final.queuePaused, jobs: final.jobs, backgroundValuationAppend: final.valuationAppend,
    readbacks: reads.results.length, reusedReadback: mode === 'audit' });
  console.log(JSON.stringify({ status: 'passed', readbacks: reads.results.length, policyRevision: 202,
    realModelCalls: 0, competitionOperations: 0, queuePaused: final.queuePaused }));
}
