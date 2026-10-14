import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  strategySchema, backtestExecutionModelSchemaV3, marketRouteKeyIdV3,
  backtestRunPreparationRequestV3Schema, backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3, backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

// 复用现有策略/富途预设；仅构造独立的按股场景，不修改旧任务。
const plan = spawnSync(process.execPath,
  [fileURLToPath(new URL('./multimarket-rules-target.mjs', import.meta.url)), '--us', '--broker-costs'],
  { encoding: 'utf8' });
assert.equal(plan.status, 0, '现有场景构造失败');
const { strategy: original, intent } = JSON.parse(plan.stdout);
original.name = 'GME 原价整股 · 富途佣金与TAF';
const strategy = strategySchema.parse(original);
const range = { start: '2024-05-14', end: '2024-05-24' };
intent.adjustment = 'none';
intent.accountingBasis = 'raw-events';
intent.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
intent.runConfig.startDate = range.start;
const model = intent.runConfig.executionModel;
model.id = 'gme-whole-shares-futu-public-fees';
model.scope.range = range;
for (const segment of model.segments) {
  segment.range = range;
  segment.source.description = 'GME有界每股原价，显式整股日线执行与当前富途研究预设';
  segment.source.references.push('docs/tasks/evidence/2026-10-08-p6-share-unit-input-review.md');
  segment.assumptions = [
    '每股原价和整数股模拟成交；最小步长1股，不等同NYSE报价整手，不使用参考股价换算。',
    '一美分成交价网格；只还原原响应不超过USD0.000005的浮点表示误差，不改变明显偏离网格的价格。',
    '富途香港当前标准佣金和固定式按股平台费作为研究预设，一单一次成交；Section31及TAF由历史来源冻结，其他收费未纳入。',
    '市场总成交额未知，模拟成交额由成交价乘模拟股数计算；零滑点，下一交易日可卖，卖出资金当日可再投资。',
    '未纳入公司行动或严格历史PIT；05-10/13仅真实预热，执行日期的未知状态不补为正常。',
  ];
  delete segment.execution.normalizedExecution;
  delete segment.execution.statusPolicy.resultAvailability;
  segment.execution.price = { kind: 'noDailyLimit', reason: '本有界美股日线研究不建模市场动态价格带' };
  segment.fees.brokerCommission.basis = { kind: 'actualShares' };
  segment.fees.brokerCommission.userModified = true;
  segment.fees.tradingActivityFee = {
    treatment: 'charged', side: 'sell', basis: 'actualShares', currency: 'USD',
    rate: '0.000166', minimum: { kind: 'none' }, maximumAmount: '8.30',
    lowPriceExemption: 'belowPerShareRate',
  };
}
intent.runConfig.executionModel = backtestExecutionModelSchemaV3.parse(model);
const api = async (path, body, method = 'POST') => {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: body ? method : 'GET', headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000),
  });
  const value = await response.json();
  assert(response.ok, `${response.status}: ${JSON.stringify(value).slice(0, 2000)}`);
  return value;
};
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }, null, 2));
} else {
  const policy = await api('/api/market-data/policy');
  assert.equal(policy.syncState, 'applied');
  const desired = [
    { key: { kind: 'bar', market: 'US', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none' },
      targets: [{ providerId: 'yfinance', upstreamSource: 'yahoo-gme-share-window' }] },
    { key: { kind: 'data', market: 'US', assetType: 'STOCK', capability: 'HISTORICAL_PUBLIC_FEES' },
      targets: [{ providerId: 'official-us-rules', upstreamSource: 'us-stock-public-fees' }] },
    { key: { kind: 'data', market: 'US', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' },
      targets: [{ providerId: 'official-us-rules', upstreamSource: 'nyse-gme-halt-observations' }] },
  ];
  const routes = structuredClone(policy.routes);
  for (const next of desired) {
    const index = routes.findIndex(route => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(next.key));
    if (index < 0) routes.push(next); else routes[index] = next;
  }
  const writePolicy = (revision, selected) => api('/api/market-data/policy', {
    contractVersion: 3, consumer: 'thesis-ledger', requestId: randomUUID(), revision,
    enabled: policy.enabled, routes: selected,
  }, 'PUT');
  let attempted = false;
  try {
    attempted = true;
    await writePolicy(policy.revision + 1, routes);
    const current = await api('/api/market-data/policy');
    assert.equal(current.syncState, 'applied');
    assert.deepEqual(current.routes.map(route => ({ key: route.key, targets: route.targets })),
      routes.map(route => ({ key: route.key, targets: route.targets })));
    const saved = await api('/api/v1/backtests/strategies', {
      name: `${strategy.name} ${new Date().toISOString()}`, schema: strategy,
      description: 'P6按股价格、富途佣金和实际股数TAF的有界消费者验收',
    });
    const strategyVersionId = saved.versions[0].id;
    const prepared = backtestRunPreparationResultV3Schema.parse(await api('/api/v1/backtests/run-config/prepare',
      backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId })));
    console.error(JSON.stringify({ stage: 'prepared', response: prepared }));
    assert.equal(prepared.status, 'prepared');
    const created = await api('/api/v1/backtests/runs', backtestRunCreateSchemaV3.parse({
      contractVersion: 3, strategyVersionId, runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp, idempotencyKey: `p6-us-shares-${randomUUID()}`,
    }));
    console.error(JSON.stringify({ stage: 'queued', jobId: created.id }));
    let job = created;
    const deadline = Date.now() + 180000;
    while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 8000));
      job = await api(`/api/v1/backtests/runs/${created.id}`);
    }
    assert.equal(job.status, 'succeeded', JSON.stringify({ status: job.status, error: job.errorSummary }));
    const result = backtestResultSchemaV3.parse(job.result);
    assert.equal(result.publicFeesDisclosure.status, 'source');
    assert.equal(result.tradingStatusDisclosure.status, 'source');
    assert.equal(job.snapshotManifest.executionPriceProtocol.priceBasis.quantityBasis, 'actual-units');
    assert.equal(job.snapshotManifest.executionPriceProtocol.priceBasis.adjustment, 'none');
    assert(result.simulationFills.length >= 2);
    assert(result.simulationFills.every(fill => /^\d+$/.test(fill.quantity)));
    console.log(JSON.stringify({ mode: 'run', strategyId: saved.id, strategyVersionId, prepared, job }, null, 2));
  } finally {
    if (attempted) {
      const current = await api('/api/market-data/policy');
      if (current.revision !== policy.revision) {
        assert.equal(current.revision, policy.revision + 1, '发现并行策略修订，不能覆盖其选择');
        assert.deepEqual(current.routes, routes, '发现并行来源变更，不能覆盖其选择');
        await writePolicy(current.revision + 1, policy.routes);
      }
      const restored = await api('/api/market-data/policy');
      assert.equal(restored.syncState, 'applied');
      assert.deepEqual(restored.routes, policy.routes);
      console.error(JSON.stringify({ stage: 'policy-restored', revision: restored.revision }));
    }
  }
}
