import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';
import { createFunctionalCase, functionalRequests, verifyFunctionalResults } from './market-status-functional-case.mjs';

const driver = `
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const client=new DsaClient(), requests=JSON.parse(input), results=[];
for (const request of requests) results.push(await client.dataCapabilities.statusCapability(request));
console.log('FUNCTIONAL_RESULTS='+JSON.stringify(results));
`;
export function localOrigin(value) {
  const url = new URL(value);
  assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password, '仅允许本地目标');
  return url.origin;
}
export async function executeFunctionalCase(api, plan, journal, read) {
  let owned = false;
  await journal({ phase: 'prepared', plan, owned });
  let results;
  try {
    const acknowledged = await api.put('/api/market-data/policy', { ...plan.temporary, expectedRevision: plan.baseline.revision });
    assert(acknowledged.revision === plan.temporary.revision && policyFingerprint(desiredFromState(acknowledged)) === plan.temporaryFingerprint, '提交结果未确认');
    owned = true;
    await journal({ phase: 'temporary_confirmed', plan, owned });
    const applied = await api.get('/api/market-data/policy');
    assert(applied.syncState === 'applied' && !applied.effectiveStale && applied.dsaRevision === plan.temporary.revision, '临时政策未生效');
    results = verifyFunctionalResults(plan, await read(functionalRequests(plan)));
    await journal({ phase: 'queried', plan, owned, results });
  } finally {
    if (owned) {
      const current = desiredFromState(await api.get('/api/market-data/policy'));
      assert(current.revision === plan.temporary.revision && policyFingerprint(current) === plan.temporaryFingerprint, '并行政策变化，停止覆盖恢复');
      const restored = await api.put('/api/market-data/policy', { ...plan.baseline, revision: current.revision + 1,
        requestId: `${plan.caseId}:restore`, expectedRevision: current.revision });
      assert(policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint, '恢复结果未确认');
      await journal({ phase: 'restored', plan, owned, results, restoredRevision: restored.revision });
    }
  }
  const final = await api.get('/api/market-data/policy');
  assert(final.syncState === 'applied' && !final.effectiveStale && policyFingerprint(desiredFromState(final)) === plan.baselineFingerprint, '最终政策尚未恢复为生效状态');
  await journal({ phase: 'verified', plan, owned, results, restoredRevision: final.revision });
  return { caseId: plan.caseId, restoredRevision: final.revision, capabilities: results.map((result) => result.routeKey.capability) };
}

async function main() {
  const args = process.argv.slice(2);
  const origin = localOrigin(process.env.SERVER_ORIGIN ?? 'http://127.0.0.1:3000');
  const headers = { 'content-type': 'application/json' };
  if (process.env.SERVER_API_TOKEN) headers.authorization = `Bearer ${process.env.SERVER_API_TOKEN}`;
  async function request(method, endpoint, body) {
    const response = await fetch(origin + endpoint, { method, headers, signal: AbortSignal.timeout(10000),
      body: body === undefined ? undefined : JSON.stringify(body) });
    assert(response.ok, `原 Server API 拒绝请求：${response.status}`);
    return response.json();
  }
  const api = { get: (endpoint) => request('GET', endpoint), put: (endpoint, body) => request('PUT', endpoint, body) };
  const state = await api.get('/api/market-data/policy');
  const providers = await api.get('/api/market-data/providers');
  const catalog = await api.get('/api/market-data/routes/capabilities?contractVersion=3');
  const plan = createFunctionalCase(state, providers.providers, catalog);
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', expectedPolicy: plan.baseline.revision,
      additions: plan.temporary.routes.slice(plan.baseline.routes.length), requests: functionalRequests(plan) }));
    return;
  }
  assert(args.includes('--authorized-functional-case'), '实际执行需要本案例单独授权');
  const expected = Number(args.find((arg) => arg.startsWith('--expected-policy='))?.split('=')[1]);
  assert(expected === plan.baseline.revision, '政策版本已变化，需要重新核对授权范围');
  const root = await fs.mkdtemp(path.join(tmpdir(), 'tl-functional-capability-'));
  const destination = path.join(root, 'recovery.json');
  const journal = async (record) => {
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, ...record }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`恢复记录：${destination}`);
  const read = async (requests) => {
    const result = spawnSync('docker', ['exec', '-i', '-w', '/app', 'thesis-ledger-dev-thesis-ledger-1', 'node', '--input-type=module', '-e', driver],
      { input: JSON.stringify(requests), encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    assert(result.status === 0, '原 DsaClient 读取失败；保留恢复记录，不输出 SDK/环境原文');
    const values = result.stdout.split('\n').filter((line) => line.startsWith('FUNCTIONAL_RESULTS='));
    assert(values.length === 1, '能力结果输出缺失');
    return JSON.parse(values[0].slice('FUNCTIONAL_RESULTS='.length));
  };
  console.log(JSON.stringify(await executeFunctionalCase(api, plan, journal, read)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('功能验收未完成，请核对已输出的恢复记录；提交不明或并行修改时不覆盖当前政策。'); process.exitCode = 1; });
}
