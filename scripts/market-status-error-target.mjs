import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

const driver = `
import assert from 'node:assert/strict';
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import { mapDataV3HttpError } from '/app/apps/server/dist/src/integration/dsa/dsa-v3-protocol.js';
import { marketDataErrorEnvelopeV3Schema, statusCapabilityRequestV1Schema } from '@thesis-ledger/schemas';
let text=''; for await (const chunk of process.stdin) text+=chunk;
const {revision}=JSON.parse(text), client=new DsaClient();
const request=statusCapabilityRequestV1Schema.parse({contractVersion:3,capabilityVersion:1,
 consumer:'thesis-ledger',requestId:crypto.randomUUID(),symbol:'600519.SH',
 routeKey:{kind:'data',market:'CN',assetType:'STOCK',capability:'SECURITY_BASIC_DATES'},
 routeTarget:{providerId:'baostock',upstreamSource:'baostock',routeIndex:0},policyRevision:revision});
const proofs=[];
for (const invalid of [false,true]) {
 const body=invalid?{...request,range:{start:'2026-10-08',end:'2026-10-09'}}:request;
 let observed;
 try { await client.post('/api/v3/thesis-ledger/market/status-capabilities',body,1,(status,payload)=>{
  const parsed=marketDataErrorEnvelopeV3Schema.safeParse(payload?.detail);
  console.log('STATUS_ERROR_OBSERVATION='+JSON.stringify({invalid,status,standard:parsed.success,
    hasDetail:!!payload?.detail, hasError:!!payload?.error,
    detailVersion3:payload?.detail?.contractVersion===3,detailHasError:!!payload?.detail?.error,
    detailCorrelated:payload?.detail?.requestId===request.requestId,
    ...(parsed.success?{detail:parsed.data}: {})}));
  const detail=marketDataErrorEnvelopeV3Schema.parse(payload?.detail);
  assert.equal(detail.requestId,request.requestId);
  assert.equal(status,invalid?422:503);
  assert.equal(detail.error.code,invalid?'invalid_request':'upstream_failure');
  observed={status,detail}; return mapDataV3HttpError(status,payload,request.requestId);
 }); assert.fail('未选能力/非法参数不能成功'); }
 catch(error) { assert.equal(error.code,invalid?'invalid-request':'unavailable'); }
 assert(observed,'必须取得真实标准HTTP信封'); proofs.push(observed);
}
console.log('STATUS_ERROR_PROOF='+JSON.stringify(proofs));
`;

const origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
const api = createLocalApi(origin), before = await api.get('/api/market-data/policy');
const policy = desiredFromState(before);
assert(before.syncState === 'applied' && !before.effectiveStale && before.dsaRevision === policy.revision);
assert(!policy.routes.some((r) => r.key.market === 'CN' && r.key.assetType === 'STOCK' &&
  r.key.capability === 'SECURITY_BASIC_DATES'), '仅核对未选能力，不覆盖用户路由');
// 明确只读的独立Node进程：原客户端两次POST均在数据执行前拒绝，不写目标文件/策略/Run。
const result = spawnSync('docker', ['exec', '-i', '-w', '/app', 'thesis-ledger-dev-thesis-ledger-1',
  'node', '--input-type=module', '-e', driver], { input: JSON.stringify({ revision: policy.revision }),
  encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
if (result.status !== 0) {
  for (const line of result.stdout.split('\n').filter((line) => line.startsWith('STATUS_ERROR_OBSERVATION=')))
    console.log(line);
}
assert(result.status === 0, '目标错误合同核对失败；不输出环境/SDK原文');
const lines = result.stdout.split('\n').filter((line) => line.startsWith('STATUS_ERROR_PROOF='));
assert.equal(lines.length, 1);
const after = await api.get('/api/market-data/policy');
assert.equal(after.revision, before.revision);
assert(after.syncState === 'applied' && !after.effectiveStale && after.dsaRevision === before.dsaRevision);
assert.equal(policyFingerprint(desiredFromState(after)), policyFingerprint(policy));
console.log(JSON.stringify({ policyRevision: after.revision, policyUnchanged: true,
  proofs: JSON.parse(lines[0].slice('STATUS_ERROR_PROOF='.length)),
  boundary: '仅真实未选能力/参数拒绝，不能代替五来源正向组合、业务冻结或故障验收' }));
