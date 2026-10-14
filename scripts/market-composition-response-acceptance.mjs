import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { statusCapabilityRequestV1Schema } from '../packages/schemas/dist/index.js';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { createCompositionCase, executeCompositionCase, compositionRoutes } from './market-composition-target-case.mjs';
import { compositionScope } from './market-composition-target-input.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';

export function responseRequests(plan) {
  return compositionRoutes.map((route) => {
    const capability = route.key.capability;
    const query = { contractVersion: 3, capabilityVersion: 1, consumer: 'thesis-ledger',
      requestId: randomUUID(), symbol: compositionScope.symbol, routeKey: route.key,
      routeTarget: { ...route.targets[0], routeIndex: 0 }, policyRevision: plan.temporary.revision };
    if (capability !== 'SECURITY_BASIC_DATES')
      query.range = { start: compositionScope.start, end: compositionScope.end };
    if (capability === 'RISK_WARNING') query.detail = { kind: 'riskCategories', categories: ['delisting', 'other'] };
    if (capability === 'DAILY_PRICE_RULE') query.representation = 'rule';
    return statusCapabilityRequestV1Schema.parse(query);
  });
}

const driver = `
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import { marketDataErrorEnvelopeV3Schema } from '@thesis-ledger/schemas';
let text=''; for await(const chunk of process.stdin) text+=chunk;
const requests=JSON.parse(text), client=new DsaClient(), original=globalThis.fetch, observations=[];
globalThis.fetch=async (...args)=>{
 const response=await original(...args);
 if(new URL(String(args[0])).pathname==='/api/v3/thesis-ledger/market/status-capabilities'){
  const request=JSON.parse(args[1].body), raw=await response.clone().json();
  const parsed=marketDataErrorEnvelopeV3Schema.safeParse(raw.detail);
  observations.push({requestId:request.requestId,capability:request.routeKey.capability,httpStatus:response.status,
   standardError:parsed.success,...(parsed.success?{errorCode:parsed.data.error.code,
    correlated:parsed.data.requestId===request.requestId}: {})});
 }
 return response;
};
try{
 const results=await Promise.all(requests.map(async(request)=>{
  try{const result=await client.dataCapabilities.statusCapability(request);
   return {capability:request.routeKey.capability,status:'validated',routeTarget:result.routeTarget,
    clock:result.clock,...('coverage' in result?{coverage:result.coverage}:{dates:result.dates})};
  }catch(error){return {capability:request.routeKey.capability,status:'rejected',code:error.code??'non-protocol-error'};}
 }));
 console.log('RESPONSE_PROOF='+JSON.stringify({results,observations}));
}finally{globalThis.fetch=original;}
`;

async function main() {
  const args = process.argv.slice(2), origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
  const api = createLocalApi(origin);
  const plan = createCompositionCase(await api.get('/api/market-data/policy'),
    (await api.get('/api/market-data/providers')).providers,
    await api.get('/api/market-data/routes/capabilities?contractVersion=3'));
  const requests = responseRequests(plan);
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', revisions: [plan.baseline.revision,
      plan.temporary.revision, plan.temporary.revision + 1], requests,
      boundary: '同五功能临时路线，原DsaClient并发各一次；观察转发真实HTTP/标准结果，无故障/策略/Run/窗口/冻结写入；CAS/配置保护恢复' }));
    return;
  }
  assert(args.includes('--authorized-response-case') && args.includes(`--expected-policy=${plan.baseline.revision}`));
  const destination = path.join(await fs.mkdtemp(path.join(tmpdir(), 'tl-composition-response-')), 'recovery.json');
  let record = {};
  const journal = async (next) => {
    record = { ...record, ...next };
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, ...record }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`恢复记录：${destination}`);
  const proof = await executeCompositionCase(api, plan, journal, async () => {
    const child = spawnSync('docker', ['exec', '-i', '-w', '/app', 'thesis-ledger-dev-thesis-ledger-1',
      'node', '--input-type=module', '-e', driver], { input: JSON.stringify(requests), encoding: 'utf8',
      timeout: 150000, maxBuffer: 1024 * 1024 });
    assert.equal(child.status, 0, '原客户端响应观察未完成，不输出SDK/环境原文');
    const lines = child.stdout.split('\n').filter((line) => line.startsWith('RESPONSE_PROOF='));
    assert.equal(lines.length, 1);
    const value = JSON.parse(lines[0].slice('RESPONSE_PROOF='.length));
    assert.equal(value.results.length, 5);
    assert.equal(value.observations.length, 5, '每项恰好一次真实HTTP，不补发请求');
    assert.deepEqual(value.results.map((item) => item.capability), requests.map((q) => q.routeKey.capability));
    await journal({ proof: value });
    return value;
  });
  console.log(JSON.stringify(proof));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { console.error('响应诊断未完成，保留证据并核对CAS恢复；不自动重跑。'); process.exitCode = 1; });
