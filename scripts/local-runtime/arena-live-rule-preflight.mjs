// 当前规则覆盖的单批只读核验；不启动应用模块、模型或后台调度。
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const selected = {
  CN: { STOCK: '600036.SH', ETF: '510300.SH' },
  HK: { STOCK: '00700.HK', ETF: '02800.HK' },
  US: { STOCK: 'AAPL.US', ETF: 'SPY.US' },
};
async function readRule() {
  const { market, assetType, symbol, batch } = JSON.parse(process.argv[3]);
  const { DsaClient } = await import('./dist/src/integration/dsa/dsa.client.js');
  const dsa = new DsaClient(), at = new Date();
  const zone = { CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' }[market];
  // 仅生成请求日期，不据此推断开休市或可成交状态。
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const receipt = { batch, batchLimit: 12, market, assetType, symbol, requestedDay: day,
    observedAt: at.toISOString(), dataReads: 0, externalQuoteReads: 0, modelCalls: 0,
    automaticRetries: 0, routeWrites: 0, additionalCostCny: 0 };
  let request;
  try {
    const policy = (await dsa.effectiveControlPolicyV3()).projection?.effective;
    const route = policy?.routes.find((r) => r.key.kind === 'data' && r.key.market === market &&
      r.key.assetType === assetType && r.key.capability === 'HISTORICAL_PUBLIC_FEES');
    const target = route?.targets.find((t) => t.routeIndex === 0);
    if (!policy?.enabled || !target?.eligible || target.providerId !== 'local-materials')
      throw Object.assign(new Error('当前主规则来源未就绪或已变化'), { sourceReason: 'configured_rule_source_unavailable' });
    request = { contractVersion: 3, consumer: 'thesis-ledger', requestId: crypto.randomUUID(), symbol,
      routeKey: route.key, routeTarget: { providerId: target.providerId, upstreamSource: target.upstreamSource, routeIndex: 0 },
      range: { start: day, end: day } };
    receipt.dataReads = 1;
    // publicFees 的传输固定为单次；精确 pin 禁止路由 fallback。
    const result = await dsa.marketPublicFeesV3(request);
    const after = (await dsa.effectiveControlPolicyV3()).projection?.effective;
    assert.equal(after?.revision, policy.revision, '读取期间有效政策变化');
    console.log(JSON.stringify({ ...receipt, request, policyRevision: policy.revision, status: 'fee_rule_ready',
      executionReady: false, provenance: result.provenance, segments: result.segments,
      sourceDocuments: result.sourceDocuments }));
  } catch (error) {
    console.log(JSON.stringify({ ...receipt, request, status: 'stopped', executionReady: false,
      reason: error.sourceReason ?? error.code ?? 'read_failed', httpStatus: error.status ?? null,
      message: error.sourceReason ? error.message : '规则核验未通过，停止且不自动重试' }));
    process.exitCode = 2;
  }
}
if (process.argv[2] === '--inside') {
  await readRule();
} else {
  const receipt = new URL('../../docs/evidence/2026-11-12-autonomous-model-arena-source-01.json', import.meta.url);
  assert(!existsSync(receipt), '本次核验已有停止回执；禁止复用剩余额度自动继续，需要新的明确授权');
  const { values } = parseArgs({ options: {
    market: { type: 'string' }, asset: { type: 'string' }, batch: { type: 'string' },
  } });
  const batch = Number(values.batch), market = values.market, assetType = values.asset;
  assert(Number.isInteger(batch) && batch >= 1 && batch <= 12, '必须提供本次授权内尚未使用的批次号');
  const symbol = selected[market]?.[assetType];
  assert(symbol, '核验只允许约定的六个市场和资产样本');
  const container = 'thesis-ledger-dev-thesis-ledger-1';
  const format = '{{.Id}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Health.Status}}';
  const identity = execFileSync('docker', ['inspect', '--format', format, container], { encoding: 'utf8' }).trim();
  assert.match(identity, /^[a-f\d]{64}\|thesis-ledger-dev\|thesis-ledger\|healthy$/);
  const result = spawnSync('docker', ['exec', '-i', '-w', '/app/apps/server', identity.split('|')[0],
    'node', '--input-type=module', '-', '--inside', JSON.stringify({ market, assetType, symbol, batch })],
  { input: readFileSync(new URL(import.meta.url)), encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
  if (result.error || result.signal || ![0, 2].includes(result.status)) {
    console.log(JSON.stringify({ batch, status: 'stopped', reason: 'runtime_read_failed', automaticRetries: 0 }));
    process.exitCode = 2;
  } else {
    const receipt = JSON.parse(result.stdout.trim());
    console.log(JSON.stringify(receipt));
    process.exitCode = result.status;
  }
}
