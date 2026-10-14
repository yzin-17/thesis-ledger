import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

// 已选现金来源的三次有界读取；不写政策/凭据/准入或研究结果。
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
assert(output, '需指定脱敏业务资料输出路径');
const driver = `
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
const client = new DsaClient();
const policy = (await client.effectiveControlPolicyV3()).projection.effective;
const catalog = await client.marketRouteCatalogV3();
const key = {kind:'data',market:'CN',assetType:'ETF',capability:'CASH_DISTRIBUTION'};
const route = policy.routes.find(row => Object.entries(key).every(([name,value]) => row.key[name] === value));
const target = route?.targets.find(row => row.providerId === 'hithink' && row.upstreamSource === 'fund-corporate-actions-dividends');
if (!target) throw new Error('当前政策没有用户已选HiThink现金来源');
const researchPolicy = {version:'known-announced-cash-events-v1',entitlement:'settled-record-date-holdings',receivable:'ex-date',settlement:'assume-scheduled-payment-date',missingEvents:'excluded-with-unknown-coverage',usage:'accounting-only',splitEvents:'not-modelled',historicalAvailability:'notVerified',uncertainRecords:'exclude'};
const rows=[];
for (const [symbol,start,end] of [['510300.SH','2025-06-01','2026-02-01'],['510050.SH','2024-11-01','2026-02-01'],['510880.SH','2026-01-01','2026-02-01']]) {
  const request = {contractVersion:3,protocolVersion:'known-cash-observations-v1',requestId:crypto.randomUUID(),symbol,routeKey:key,routeTarget:{providerId:target.providerId,upstreamSource:target.upstreamSource,routeIndex:target.routeIndex},desiredRevision:policy.sourceDesiredRevision,effectivePolicyRevision:policy.revision,catalogRevision:catalog.catalogRevision,start,end,dataAsOf:new Date(Date.now()+60000).toISOString(),currency:'CNY',researchPolicy};
  try { rows.push({request,response:await client.dataCapabilities.knownCash(request)}); }
  catch(error) { rows.push({request,error:{code:error.code??'unknown',reason:error.sourceReason??'unknown'}}); break; }
}
console.log('CASH_SAMPLES='+JSON.stringify({businessRequests:rows.length,rows}));
`;
const result = spawnSync(
  'docker',
  [
    'exec',
    '-i',
    '-w',
    '/app',
    'thesis-ledger-dev-thesis-ledger-1',
    'node',
    '--input-type=module',
    '-e',
    driver,
  ],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024 },
);
assert.equal(result.status, 0, '目标原DsaClient读取未完成；不输出SDK/环境原文');
const lines = result.stdout.split('\n').filter((line) => line.startsWith('CASH_SAMPLES='));
assert.equal(lines.length, 1, '目标读取结果不唯一');
const capture = JSON.parse(lines[0].slice('CASH_SAMPLES='.length));
await writeFile(output, JSON.stringify(capture, null, 2), { mode: 0o600 });
console.log(
  JSON.stringify({
    businessRequests: capture.businessRequests,
    output,
    samples: capture.rows.map(({ request, response, error }) => ({
      symbol: request.symbol,
      records: response?.records.length,
      rawRows: response?.assessment.rawItemCount,
      quality: response?.assessment.counts,
      error,
    })),
  }),
);
