import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { desiredProviderPolicyV3Schema, marketRouteKeyIdV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

const key = { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'SPLIT_EVENT' };
const target = { providerId: 'akshare', upstreamSource: 'eastmoney' };
const digest = 'b1a4f03f94faf27acf95d2bef9d508ec06eabec1280e04c921bb677154f5fe8e';

export function safeSplitClientFailure(error) {
  const codes = ['unauthorized', 'unsupported-capability', 'control-rejected', 'stale-revision',
    'invalid-response', 'unavailable', 'timeout'];
  const status = error?.status;
  return { stage: 'dsa_transport_or_protocol', code: codes.includes(error?.code) ? error.code : 'unknown',
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null };
}

export function splitPlan(state, catalog) {
  const baseline = desiredFromState(state);
  assert(baseline.enabled && state.syncState === 'applied' && state.effectiveStale === false && state.dsaRevision === baseline.revision);
  assert(catalog.status === 'complete');
  assert(!baseline.routes.some(r => marketRouteKeyIdV3(r.key) === marketRouteKeyIdV3(key)), '已有拆分路线不能覆盖');
  const entries = catalog.entries.filter(e => marketRouteKeyIdV3(e.key) === marketRouteKeyIdV3(key) && e.target.providerId === target.providerId && e.target.upstreamSource === target.upstreamSource);
  assert(entries.length === 1 && entries[0].state === 'ready', '需要当前精确已准入目标');
  const temporary = desiredProviderPolicyV3Schema.parse({ ...baseline, revision: baseline.revision + 1, requestId: randomUUID(),
    routes: [...baseline.routes, { key, targets: [target], enabled: true }] });
  return { caseId: randomUUID(), baseline, temporary,
    baselineFingerprint: policyFingerprint(baseline), temporaryFingerprint: policyFingerprint(temporary) };
}

export async function executeSplitCase(api, plan, journal, read) {
  let owned = false;
  let receipt;
  await journal({ phase: 'prepared', plan });
  try {
    const acknowledged = await api.put({ ...plan.temporary, expectedRevision: plan.baseline.revision });
    assert(acknowledged.revision === plan.temporary.revision && policyFingerprint(desiredFromState(acknowledged)) === plan.temporaryFingerprint, '提交未确认，不覆盖恢复');
    owned = true;
    await journal({ phase: 'temporary-confirmed', plan });
    const applied = await api.get();
    assert(applied.syncState === 'applied' && !applied.effectiveStale && applied.dsaRevision === plan.temporary.revision);
    assert(policyFingerprint(desiredFromState(applied)) === plan.temporaryFingerprint, '读取前发生并行政策变化');
    receipt = await read(plan.temporary.revision);
    await journal({ phase: 'read', plan, receipt });
  } finally {
    if (owned) {
      const current = await api.get();
      assert(current.revision === plan.temporary.revision && policyFingerprint(desiredFromState(current)) === plan.temporaryFingerprint, '并行修改，停止覆盖恢复');
      const restored = await api.put({ ...plan.baseline, revision: current.revision + 1,
        requestId: randomUUID(), expectedRevision: current.revision });
      assert(policyFingerprint(desiredFromState(restored)) === plan.baselineFingerprint, '恢复回执不匹配');
      await journal({ phase: 'restored', plan, receipt, restoredRevision: restored.revision });
    }
  }
  const final = await api.get();
  assert(final.syncState === 'applied' && !final.effectiveStale && final.dsaRevision === final.revision && policyFingerprint(desiredFromState(final)) === plan.baselineFingerprint);
  await journal({ phase: 'verified', plan, receipt, restoredRevision: final.revision });
  return { caseId: plan.caseId, restoredRevision: final.revision, receipt };
}

export const splitAcquisitionDriverV3 = `
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {DsaClient} from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import {acquireMarketSplitAfterAcquisitionV3} from '/app/apps/server/dist/src/market/market-split-acquisition-v3.js';
import {readDsaEventAdmissionCatalogV3} from '/app/apps/server/dist/src/integration/dsa/dsa-event-admission-catalog-v3.js';
let input='';for await(const chunk of process.stdin)input+=chunk;const {revision,digest}=JSON.parse(input);
const c=new DsaClient(),post=c.post;let eventRequests=0,innerFailure;
const safeFailure=(${safeSplitClientFailure.toString()});
c.post=function(path,...args){if(path==='/api/v3/thesis-ledger/market/events'){eventRequests++;assert.equal(eventRequests,1);assert.equal(args[1],1);}return post.call(this,path,...args);};
const effective=await c.effectiveControlPolicyV3(),view=await readDsaEventAdmissionCatalogV3(c),catalog=view.catalog;
assert.equal(effective.projection.effective.revision,revision);assert.equal(effective.projection.effective.sourceDesiredRevision,revision);
const scope={contractVersion:3,requestId:randomUUID(),desiredRevision:revision,effectivePolicyRevision:revision,catalogRevision:catalog.catalogRevision,
 routeKey:{kind:'data',market:'CN',assetType:'ETF',capability:'SPLIT_EVENT'},symbol:'159516.SZ',start:'2026-03-30',end:'2026-07-10',dataAsOf:new Date().toISOString()};
const result=await acquireMarketSplitAfterAcquisitionV3({mode:'after-acquisition',readTimeoutMs:c.timeoutMs,scope,effective:effective.projection.effective,catalog,admissions:view.admissions,
readStateAfter:async()=>{const [state,afterView]=await Promise.all([c.effectiveControlPolicyV3(),readDsaEventAdmissionCatalogV3(c)]);return{effective:state.projection.effective,catalog:afterView.catalog,admissions:afterView.admissions};},read:async r=>{
 try{return await c.marketEventsV3(r);}catch(error){innerFailure=safeFailure(error);throw error;}
}});
console.log('SPLIT_RECEIPT='+JSON.stringify({eventRequests,result,innerFailure}));
assert.equal(result.status,'observed');assert.equal(eventRequests,1);const response=result.response;
assert.equal(response.coverage.complete,false);assert.equal(response.coverage.reason,'historical_coverage_unverified');
assert.equal(response.dateMappingEvidence.sha256,digest);assert.equal(createHash('sha256').update(response.dateMappingEvidence.content).digest('hex'),digest);
assert.deepEqual(response.facts.map(f=>[f.symbol,f.type,f.effectiveDate,f.recordDate,f.ratio]).sort((a,b)=>a[2].localeCompare(b[2])),[['159516.SZ','SPLIT','2026-03-30','2026-03-27','2'],['159516.SZ','SPLIT','2026-07-10','2026-07-09','2']]);
`;

async function main() {
  const args = process.argv.slice(2);
  const headers = { 'content-type': 'application/json' };
  if (process.env.SERVER_API_TOKEN) headers.authorization = `Bearer ${process.env.SERVER_API_TOKEN}`;
  const request = async (method, path, body) => {
    const response = await fetch('http://127.0.0.1:3000' + path, { method, headers, signal: AbortSignal.timeout(15000), body: body === undefined ? undefined : JSON.stringify(body) });
    assert(response.ok, `原Server API拒绝：${response.status}`);return response.json();
  };
  const api = { get: () => request('GET', '/api/market-data/policy'), put: body => request('PUT', '/api/market-data/policy', body) };
  const plan = splitPlan(await api.get(), await request('GET', '/api/market-data/routes/capabilities?contractVersion=3'));
  if (args.length === 0) { console.log(JSON.stringify({ mode: 'preview', plan }));return; }
  assert.deepEqual(args, ['--execute', '--authorized-159516-split-case', `--expected-policy=${plan.baseline.revision}`]);
  const root = resolve('.recovery-artifacts', 'split-' + plan.caseId);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const file = resolve(root, 'recovery.json');
  const history = [];let captured;
  const journal = async record => {
    if (record.receipt) captured = record.receipt;
    history.push({ phase: record.phase, at: new Date().toISOString() });
    await writeFile(file + '.tmp', JSON.stringify({ ...record, receipt: captured, history }, null, 2), { mode: 0o600 });await rename(file + '.tmp', file);
  };
  console.log('恢复记录：' + file);
  const read = async revision => {
    const output = spawnSync('docker', ['exec', '-i', 'thesis-ledger-dev-thesis-ledger-1', 'node', '--input-type=module', '-e', splitAcquisitionDriverV3],
      { input: JSON.stringify({ revision, digest }), encoding: 'utf8', timeout: 90000, maxBuffer: 200000 });
    const line = output.stdout.split('\n').find(l => l.startsWith('SPLIT_RECEIPT='));
    const receipt = line ? JSON.parse(line.slice('SPLIT_RECEIPT='.length)) : undefined;
    if (receipt) await journal({ phase: 'observed-unverified', plan, receipt });
    assert.equal(output.status, 0, '原Server单次读取未完成：' + output.stderr.slice(-1800));
    assert(receipt, '缺少读取回执');return receipt;
  };
  const result = await executeSplitCase(api, plan, journal, read);
  console.log(JSON.stringify({ ...result, recoveryFile: file }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message);process.exitCode = 1; });
