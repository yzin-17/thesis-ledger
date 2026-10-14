import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { splitAcquisitionDriverV3 } from './market-split-target-acceptance.mjs';

const original = readFileSync(new URL('../docs/tasks/evidence/2026-10-02-m22-159516-split-mapping.json', import.meta.url), 'utf8');
const digest = 'b1a4f03f94faf27acf95d2bef9d508ec06eabec1280e04c921bb677154f5fe8e';
const production = new URL('../apps/server/dist/src/market/market-split-acquisition-v3.js', import.meta.url).href;
const admissionReader = new URL('../apps/server/dist/src/integration/dsa/dsa-event-admission-catalog-v3.js', import.meta.url).href;

function run(mode) {
  const setup = `
{
const original=${JSON.stringify(original)},digest=${JSON.stringify(digest)},mode=${JSON.stringify(mode)};
const RealDate=Date,epoch=RealDate.parse('2026-10-12T10:57:44.604Z');let tick=epoch,controls=0;
globalThis.Date=class extends RealDate{constructor(...args){if(args.length)super(...args);else super(tick);}static now(){return tick;}};
globalThis.fetch=()=>{throw new Error('禁止网络');};
const key={kind:'data',market:'CN',assetType:'ETF',capability:'SPLIT_EVENT'},target={providerId:'akshare',upstreamSource:'eastmoney'};
const catalog=()=>({contractVersion:3,consumer:'thesis-ledger',catalogRevision:4494082701661225,generatedAt:new Date().toISOString(),integrity:'complete',entries:[{key,target,state:'ready'}]});
const admission=()=>({consumer:'thesis-ledger',routeKey:key,target,status:'admitted',admissionState:'admitted',recordVersion:mode==='admission-changed'&&controls===2?2:1,evidenceRef:'sha256:'+digest,evidenceSha256:digest,scopeSymbols:['159516.SZ'],scopeDateFrom:'2026-03-30',scopeDateTo:'2026-07-10',adapterRevision:'dsa-eastmoney-fund-split-mapped-v1',sourceRevision:'eastmoney-fund-cf-pageinfo-json-v1',credentialRevision:'not-required',validFrom:'2026-10-12T10:53:01.391764+00:00',validUntil:'2026-10-13T10:53:01.391764+00:00',recordedAt:'2026-10-12T10:53:01.403099+00:00',invalidatedAt:null,invalidationReason:null});
globalThis.MockDsaClient=class{
get timeoutMs(){return 5000;}
async effectiveControlPolicyV3(){controls++;if(controls===2)tick=mode==='late'?epoch+5000:tick+100;
return{projection:{effective:{contractVersion:3,consumer:'thesis-ledger',requestId:'offline-policy',revision:mode==='changed'&&controls===2?113:112,sourceDesiredRevision:112,enabled:true,appliedAt:mode==='applied-clock'?new Date().toISOString():'2026-10-12T10:57:44.000Z',routes:[{key,reason:null,targets:[{...target,routeIndex:0,eligible:true,reason:null}]}]}}};}
async marketRouteCatalogV3(){return catalog();}
async control(path,init,attempts){if(!path.endsWith('&eventAdmissions=v1')||init!==undefined||attempts!==1)throw new Error('只读视图入口不符');return{protocolVersion:'event-admission-catalog-v1',catalog:catalog(),admissions:[admission()]};}
async marketEventsV3(request){return this.post('/api/v3/thesis-ledger/market/events',request,1);}
async post(path,request,attempts){if(path!=='/api/v3/thesis-ledger/market/events'||attempts!==1)throw new Error('预算不符');
if(mode==='source-error'){const error=new Error('private-token-fixture');error.code='invalid-response';error.status=503;error.response={body:'private-token-fixture'};throw error;}
tick=epoch+400;const observedAt=new Date().toISOString();tick+=50;
return{...request,providerRevision:'offline-clock-fixture',fetchedAt:new Date().toISOString(),
admission:admission(),
dateMappingEvidence:{ref:'sha256:'+digest,sha256:digest,content:original},coverage:{complete:false,reason:'historical_coverage_unverified'},
facts:JSON.parse(original).mappings.map(m=>({symbol:'159516.SZ',market:'CN',instrumentType:'ETF',type:'SPLIT',ratio:'2',effectiveDate:m.effectiveDate,recordDate:m.recordDate,occurredAt:m.effectiveDate+'T00:00:00+08:00',availableAt:observedAt,provider:'akshare',providerRevision:'offline-clock-fixture'}))};}
};
}
`;
  const driver = splitAcquisitionDriverV3
    .replace("import {DsaClient} from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';", 'const DsaClient=globalThis.MockDsaClient;')
    .replace('/app/apps/server/dist/src/market/market-split-acquisition-v3.js', production);
  const preparedDriver = driver.replace('/app/apps/server/dist/src/integration/dsa/dsa-event-admission-catalog-v3.js', admissionReader);
  const output = spawnSync(process.execPath, ['--input-type=module', '-e', setup + preparedDriver], {
    input: JSON.stringify({ revision: 112, digest }), encoding: 'utf8', timeout: 10_000,
  });
  const line = output.stdout.split('\n').find(value => value.startsWith('SPLIT_RECEIPT='));
  assert(line, '本地驱动应保留获取或拒绝回执');
  assert(!output.stdout.includes('private-token-fixture') && !output.stderr.includes('private-token-fixture'));
  return { output, receipt: JSON.parse(line.slice('SPLIT_RECEIPT='.length)) };
}

test('原目标驱动消费本地编译Server采集接缝，保留原交换与完整两事实', () => {
  const { output, receipt } = run('success');
  assert.equal(output.status, 0, output.stderr);
  assert.equal(receipt.eventRequests, 1);
  assert.equal(receipt.result.status, 'observed');
  const { acquisition, request, response } = receipt.result;
  assert.equal(acquisition.intent.dataAsOf, '2026-10-12T10:57:44.604Z');
  assert.equal(acquisition.exchange.request.dataAsOf, '2026-10-12T10:57:49.604Z');
  assert.equal(request.dataAsOf, '2026-10-12T10:57:45.154Z');
  assert.equal(response.dateMappingEvidence.content, original);
  assert.deepEqual(response.facts, acquisition.exchange.response.facts);
  assert.equal(response.coverage.complete, false);
});

test('原编译驱动接受仅投影观察时刻变化，原事实与单次预算保持', () => {
  const { output, receipt } = run('applied-clock');
  assert.equal(output.status, 0, output.stderr);
  assert.equal(receipt.eventRequests, 1);
  assert.equal(receipt.result.status, 'observed');
  assert.equal(receipt.result.response.coverage.complete, false);
  assert.deepEqual(receipt.result.response.facts, receipt.result.acquisition.exchange.response.facts);
  assert.equal(receipt.result.request.dataAsOf, '2026-10-12T10:57:45.154Z');
});

for (const [mode, reason] of [['source-error', 'upstream_failure'], ['changed', 'control_changed'], ['late', 'clock_expired'], ['admission-changed', 'control_changed']]) {
  test(`原目标驱动${mode}失败保留安全回执，单次数据预算保持`, () => {
    const { output, receipt } = run(mode);
    assert.equal(output.status, 1);
    assert.equal(receipt.eventRequests, 1);
    assert.equal(receipt.result.status, 'unavailable');
    assert.equal(receipt.result.reason, reason);
    if (mode === 'source-error') assert.deepEqual(receipt.innerFailure, {
      stage: 'dsa_transport_or_protocol', code: 'invalid-response', httpStatus: 503,
    });
    else assert.equal(receipt.result.exchange.response.dateMappingEvidence.content, original);
  });
}
