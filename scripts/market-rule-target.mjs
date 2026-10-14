import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { strategySchema, backtestExecutionModelSchemaV3,
  backtestRunPreparationRequestV3Schema, backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3, backtestResultSchemaV3 } from '../packages/schemas/dist/index.js';

const fixture = async (name) => JSON.parse(await readFile(
  new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));
const asset = { symbol: '000995.SZ', market: 'CN', assetType: 'stock' };
const range = { start: '2023-08-16', end: '2023-08-21' };
const clock = new Date().toISOString();
const raw = await fixture('backtest-v2.exchange.json');
raw.name = '000995 原价风险与涨跌幅研究';
raw.executionInstrument = asset;
raw.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
const condition = { type: 'compare', operator: 'gt',
  left: { type: 'series', sourceId: 'execution', field: 'close' },
  right: { type: 'constant', value: '0' } };
const openPosition = { type: 'positionState', field: 'isOpen' };
raw.entry = { type: 'all', conditions: [condition, { type: 'not', expression: openPosition }] };
raw.exit = { type: 'all', conditions: [condition, openPosition] };
raw.sizing = { type: 'fixedAmount', amount: '50000' };
raw.risk = [];
raw.cost = { commissionRate: '0', slippageRate: '0' };
const strategy = strategySchema.parse(raw);
const model = await fixture('backtest-execution-model.cn-2024q1.json');
model.id = '000995-risk-price-research';
model.scope = { ...model.scope, symbol: asset.symbol, range };
for (const segment of model.segments) {
  segment.range = range;
  segment.source = { kind: 'userConfiguration', revision: '1', configuredAt: clock,
    description: '实际份额与原价的日线风险/限制研究；已知限制由冻结来源覆盖',
    references: ['docs/specs/2026-10-07-p6-market-state-expansion.md'] };
  segment.assumptions = ['零收费与零滑点；分红及拆合股等公司行动未纳入。',
    '已知风险和涨跌幅使用实际来源；未知交易维度沿用本模型，历史首次可见时钟未验证。'];
  segment.fees.commission.rate = '0';
  segment.fees.commission.minimum = { kind: 'none' };
  for (const charge of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
    segment.fees[charge] = { treatment: 'notApplicable', reason: '本次状态研究明确不收费' };
  segment.execution.price = { kind: 'noDailyLimit', reason: '未知限制时的显式模型假设，已知来源覆盖' };
}
const intent = { contractVersion: 3, requestId: randomUUID(), adjustment: 'none',
  accountingBasis: 'raw-events', history: { basis: 'fixed-provider-snapshot' },
  marketRuleResearch: 'raw-prices-no-corporate-actions-v1', warmupBudgetSessions: 1,
  freezeTimePolicy: 'after-acquisition', runConfig: { startDate: range.start, endDate: range.end,
    dataAsOf: clock, baseCurrency: 'CNY', initialCash: { CNY: '100000' },
    valuationPolicy: { baseTimezone: 'Asia/Shanghai', dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable', fxPolicy: 'latestAvailable' },
    executionModel: backtestExecutionModelSchemaV3.parse(model) } };
const api = async (path, body, method = 'POST') => {
  const response = await fetch(`http://127.0.0.1:3000${path}`, { method: body ? method : 'GET',
    headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120_000) });
  const value = await response.json();
  assert(response.ok, `${path}: ${response.status}: ${JSON.stringify(value).slice(0,2000)}`);
  return value;
};
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }, null, 2));
} else {
  const policy = await api('/api/market-data/policy');
  const routes = structuredClone(policy.routes);
  const key = (value) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  const price = { key: { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR',
    timeframe: '1d', adjustment: 'none' }, targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }] };
  const status = { key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' },
    targets: [{ providerId: 'official-states', upstreamSource: 'cn-stock-risk-price-limits' }] };
  let changed = !policy.enabled;
  let originalPriceTargets;
  for (const desired of [price, status]) {
    const found = routes.find((route) => key(route.key) === key(desired.key));
    if (!found) { routes.push(desired); changed = true; continue; }
    if (!found.targets.some((target) => key(target) === key(desired.targets[0]))) {
      assert(found.targets.length < 2, '已有主备完整，不能覆盖现有来源');
      if (desired === status) found.targets.unshift(desired.targets[0]);
      else found.targets.push(desired.targets[0]);
      changed = true;
    }
    if (desired === price && key(found.targets[0]) !== key(desired.targets[0])) {
      originalPriceTargets = structuredClone(found.targets);
      found.targets = [desired.targets[0], ...found.targets.filter((target) => key(target) !== key(desired.targets[0]))];
      changed = true;
    }
  }
  const restorePriceChoice = async () => {
    if (!originalPriceTargets) return;
    const current = await api('/api/market-data/policy');
    const route = current.routes.find((item) => key(item.key) === key(price.key));
    const temporary = routes.find((item) => key(item.key) === key(price.key));
    if (!route || JSON.stringify(route.targets) !== JSON.stringify(temporary.targets)) {
      console.error(JSON.stringify({ stage: 'restore-skipped', reason: '价格选择已由其他操作变更，保留当前设置' }));
      return;
    }
    const restored = current.routes.map((item) => key(item.key) === key(price.key)
      ? { ...item, targets: originalPriceTargets } : item);
    await api('/api/market-data/policy', { contractVersion: 3, consumer: 'thesis-ledger',
      requestId: randomUUID(), revision: current.revision + 1, enabled: current.enabled, routes: restored }, 'PUT');
    console.error(JSON.stringify({ stage: 'price-choice-restored', revision: current.revision + 1 }));
  };
  try {
  if (changed) await api('/api/market-data/policy', { contractVersion: 3, consumer: 'thesis-ledger',
    requestId: randomUUID(), revision: policy.revision + 1, enabled: true, routes }, 'PUT');
  assert.equal((await api('/api/market-data/policy')).syncState, 'applied');
  const saved = await api('/api/v1/backtests/strategies', { name: `${strategy.name} ${clock}`,
    schema: strategy, description: 'P6 原价状态与限制消费者实际目标验收' });
  const strategyVersionId = saved.versions[0].id;
  const prepared = backtestRunPreparationResultV3Schema.parse(await api('/api/v1/backtests/run-config/prepare',
    backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId })));
  console.error(JSON.stringify({ stage: 'prepared', strategyVersionId, response: prepared }));
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.runConfig.executionPriceProtocol.marketRuleResearch, intent.marketRuleResearch);
  const created = await api('/api/v1/backtests/runs', backtestRunCreateSchemaV3.parse({ contractVersion: 3,
    strategyVersionId, runConfig: prepared.runConfig, preparationStamp: prepared.executionPreflight.revisionStamp,
    idempotencyKey: `p6-cn-${randomUUID()}` }));
  console.error(JSON.stringify({ stage: 'queued', jobId: created.id }));
  let job = created;
  const deadline = Date.now() + 120_000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 1000));
    job = await api(`/api/v1/backtests/runs/${created.id}`);
  }
  assert.equal(job.status, 'succeeded', JSON.stringify({ status: job.status, error: job.errorSummary }));
  const result = backtestResultSchemaV3.parse(job.result);
  assert.equal(job.snapshotManifest.tradingStatus.freezeVersion, 'frozen-trading-status-v2');
  const disclosure = result.tradingStatusDisclosure;
  assert.equal(disclosure.status, 'source');
  assert.equal(disclosure.response.provenance.upstreamSource, status.targets[0].upstreamSource);
  assert.equal(disclosure.response.days[0].dailyPriceLimit.maxUpRatio, '0.05');
  assert.equal(disclosure.response.days[2].dailyPriceLimit.maxUpRatio, '0.1');
  assert.equal(disclosure.response.days[2].riskWarning.delisting, 'none');
  assert.equal(result.metrics.totalReturn.status, 'available');
  assert(result.simulationFills.every((fill) => !fill.occurredAt.startsWith('2023-08-17')));
  console.log(JSON.stringify({ mode: 'run', strategyId: saved.id, strategyVersionId, prepared, job,
    oldResultRegression: '旧空环境资产由用户明确要求另补；M31新快照另做同环境兼容重放' }, null, 2));
  } finally { await restorePriceChoice(); }
}
