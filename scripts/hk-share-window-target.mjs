import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strategySchema, backtestExecutionModelSchemaV3, marketRouteKeyIdV3, backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema, backtestRunCreateSchemaV3, backtestResultSchemaV3,
  researchLotShareWindowBenchmarkCostVersionV3, securityLotSizeResponseSchema } from '../packages/schemas/dist/index.js';

const packet = JSON.parse(readFileSync(new URL('../../daily-stock-analysis/data_provider/market_reference/hk00147-share-window.json', import.meta.url), 'utf8'));
const referenceFile = process.argv.find(value => value.startsWith('--lot-reference='))?.slice('--lot-reference='.length);
let reference;
if (referenceFile) {
  const receipt = JSON.parse(readFileSync(referenceFile, 'utf8'));
  if ('status' in receipt) assert.equal(receipt.status, 200, '每手来源响应未成功');
  reference = securityLotSizeResponseSchema.parse(receipt.response ?? receipt);
  assert.equal(reference.symbol, packet.symbol, '每手来源参考与执行标的不一致');
}
const lot = reference ? { sharesPerLot: reference.sharesPerLot, ...reference.source } : packet.lotReference;
const shares = process.argv.find(value => value.startsWith('--lot='))?.slice(6) ?? lot.sharesPerLot;
const cash = process.argv.find(value => value.startsWith('--cash='))?.slice(7) ?? '100000';
const noFill = process.argv.includes('--expect-no-fill');
const plan = spawnSync(process.execPath, [fileURLToPath(new URL('./multimarket-rules-target.mjs', import.meta.url)), '--broker-costs', '--expanded-fees'], { encoding: 'utf8' });
assert.equal(plan.status, 0, '现有港股场景构造失败');
const { strategy: original, intent } = JSON.parse(plan.stdout);
original.name = `00147 原价整手研究 · 每手${shares}股`;
original.sizing.amount = process.argv.find(value => value.startsWith('--allocation='))?.slice(13) ?? '50500';
const strategy = strategySchema.parse(original);
const range = { start: '2025-08-08', end: '2025-08-11' };
intent.adjustment = 'none'; intent.accountingBasis = 'raw-events'; intent.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
intent.runConfig.startDate = range.start; intent.runConfig.endDate = range.end; intent.runConfig.initialCash = { HKD: cash };
const model = intent.runConfig.executionModel;
model.id = 'hk00147-share-lot-futu-public-fees'; model.version = `research-lot-${shares}-v1`; model.scope.range = range;
model.researchLotSize = { sharesPerLot: shares, defaultSharesPerLot: lot.sharesPerLot,
  origin: shares === lot.sharesPerLot ? 'providerCurrent' : 'userOverride', historicalChanges: 'unverified',
  source: { provider: lot.provider, sourceUrl: lot.sourceUrl, sha256: lot.sha256, observedAt: lot.observedAt,
    ...(reference ? { symbol: reference.symbol } : {}) } };
for (const segment of model.segments) {
  segment.range = range;
  segment.source = { ...segment.source, kind: shares === lot.sharesPerLot ? 'researchPreset' : 'userConfiguration',
    configuredAt: new Date().toISOString(), description: '当前每手来源值或手动覆盖，只用于冻结研究模型，未核验历史变更' };
  segment.source.references.push(lot.sourceUrl, packet.priceGrid.sourceUrl);
  segment.assumptions = [
    '每手股数采用研究预设，未核验历史变更；来源默认值与采用值分别冻结，按整手向下取整。',
    'Yahoo有界HKD每股原价；按适用价位只还原不超过HKD0.00000005的浮点表示误差，不做复权比例转换。',
    '08-06正量Bar作真实预热，08-07零量观察排除可成交价格，真实全天状态仍未知；执行08-08至11。',
    '港股四项公共费分别冻结/取整，当前富途标准佣金与固定平台费作为研究预设，一单一次成交。',
    '市场总成交额未知，模拟成交额等于价格乘股数；零滑点，未纳入公司行动或严格历史PIT。',
  ];
  delete segment.execution.normalizedExecution;
  delete segment.execution.statusPolicy.resultAvailability;
  segment.execution.price = { kind: 'noDailyLimit', reason: '港股日线研究不重建盘中动态价格限制' };
}
intent.runConfig.executionModel = backtestExecutionModelSchemaV3.parse(model);
intent.runConfig.dataAsOf = new Date().toISOString();
const api = async (path, body, method = 'POST') => {
  const response = await fetch(`http://127.0.0.1:3000${path}`, { method: body ? method : 'GET',
    headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) });
  const value = await response.json();
  assert(response.ok, `${response.status}: ${JSON.stringify(value).slice(0, 2000)}`);
  return value;
};
if (!process.argv.includes('--run')) console.log(JSON.stringify({ mode: 'plan', strategy, intent }, null, 2));
else {
  const policy = await api('/api/market-data/policy'); assert.equal(policy.syncState, 'applied');
  const desired = [
    { key: { kind: 'bar', market: 'HK', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none' },
      targets: [{ providerId: 'yfinance', upstreamSource: 'yahoo-hk-share-window' }] },
    { key: { kind: 'data', market: 'HK', assetType: 'STOCK', capability: 'HISTORICAL_PUBLIC_FEES' },
      targets: [{ providerId: 'official-hk-rules', upstreamSource: 'hk-stock-public-fees' }] },
    { key: { kind: 'data', market: 'HK', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' },
      targets: [{ providerId: 'official-hk-rules', upstreamSource: 'hkex-00147-halt' }] },
  ];
  const routes = structuredClone(policy.routes);
  for (const next of desired) {
    const index = routes.findIndex(route => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(next.key));
    if (index < 0) routes.push(next); else routes[index] = next;
  }
  const writePolicy = (revision, selected) => api('/api/market-data/policy', { contractVersion: 3, consumer: 'thesis-ledger',
    requestId: randomUUID(), revision, enabled: policy.enabled, routes: selected }, 'PUT');
  let attempted = false;
  try {
    attempted = true; await writePolicy(policy.revision + 1, routes);
    const current = await api('/api/market-data/policy'); assert.equal(current.syncState, 'applied'); assert.deepEqual(current.routes, routes);
    const saved = await api('/api/v1/backtests/strategies', { name: `${strategy.name} ${new Date().toISOString()}`, schema: strategy,
      description: '港股原价、每手研究预设和实际股数收费的有界消费者验收' });
    const strategyVersionId = saved.versions[0].id;
    const prepared = backtestRunPreparationResultV3Schema.parse(await api('/api/v1/backtests/run-config/prepare',
      backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId })));
    console.error(JSON.stringify({ stage: 'prepared', response: prepared })); assert.equal(prepared.status, 'prepared');
    const created = await api('/api/v1/backtests/runs', backtestRunCreateSchemaV3.parse({ contractVersion: 3, strategyVersionId,
      runConfig: prepared.runConfig, preparationStamp: prepared.executionPreflight.revisionStamp, idempotencyKey: `p6-hk-lots-${randomUUID()}` }));
    console.error(JSON.stringify({ stage: 'queued', jobId: created.id }));
    let job = created; const deadline = Date.now() + 180000;
    while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 8000)); job = await api(`/api/v1/backtests/runs/${created.id}`);
    }
    assert.equal(job.status, 'succeeded', JSON.stringify({ status: job.status, error: job.errorSummary }));
    const result = backtestResultSchemaV3.parse(job.result);
    assert.equal(result.publicFeesDisclosure.status, 'source'); assert.equal(result.tradingStatusDisclosure.status, 'source');
    assert.equal(job.snapshotManifest.benchmarkCostVersion, researchLotShareWindowBenchmarkCostVersionV3);
    assert.deepEqual(result.executionModelDisclosure.model.researchLotSize, model.researchLotSize);
    if (noFill) assert.equal(result.simulationFills.length, 0); else assert(result.simulationFills.length >= 1);
    assert(result.simulationFills.every(fill => /^\d+$/.test(fill.quantity) && BigInt(fill.quantity) % BigInt(shares) === 0n));
    console.log(JSON.stringify({ mode: 'run', sharesPerLot: shares, cash, strategyId: saved.id, strategyVersionId, prepared, job }, null, 2));
  } finally {
    if (attempted) {
      const current = await api('/api/market-data/policy');
      if (current.revision !== policy.revision) {
        assert.equal(current.revision, policy.revision + 1, '发现并行策略修订，不能覆盖'); assert.deepEqual(current.routes, routes);
        await writePolicy(current.revision + 1, policy.routes);
      }
      const restored = await api('/api/market-data/policy'); assert.equal(restored.syncState, 'applied'); assert.deepEqual(restored.routes, policy.routes);
      console.error(JSON.stringify({ stage: 'policy-restored', revision: restored.revision }));
    }
  }
}
