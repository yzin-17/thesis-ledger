import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  strategySchema,
  backtestExecutionModelSchemaV3,
  backtestRunPreparationIntentV3Schema,
  backtestRunPreparationRequestV3Schema,
  backtestRunCreateSchemaV3,
  backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

// 沿用标准研究准备与创建入口，证券和日期由参数取得；不保存路由或准入。
const [symbol, start, end] = process.argv.slice(2);
assert(/^(?:\d{6})\.(?:SH|SZ)$/.test(symbol ?? ''), '需提供沪深股票代码');
assert(
  /^\d{4}-\d{2}-\d{2}$/.test(start ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(end ?? ''),
  '需提供起止日期',
);
const range = { start, end };
const clock = new Date().toISOString();
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const rawStrategy = await fixture('backtest-v2.exchange.json');
rawStrategy.name = `${symbol} 日级状态研究`;
rawStrategy.signalSources = [
  {
    id: 'execution',
    asset: { symbol, market: 'CN', assetType: 'stock' },
    timeframe: '1d',
    series: ['close'],
  },
];
rawStrategy.executionInstrument = { symbol, market: 'CN', assetType: 'stock' };
rawStrategy.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
rawStrategy.exit = { type: 'positionState', field: 'isOpen' };
if (process.argv.includes('--ma5'))
  rawStrategy.entry = {
    type: 'compare',
    operator: 'gte',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: {
      type: 'indicator',
      name: 'MA',
      input: { type: 'series', sourceId: 'execution', field: 'close' },
      params: { period: 5 },
    },
  };
rawStrategy.risk = [];
rawStrategy.cost.slippageRate = '0';
const strategy = strategySchema.parse(rawStrategy);
const rawModel = await fixture('backtest-execution-model.cn-2024q1.json');
rawModel.id = `cn-${symbol.replace('.', '-')}-structured-status-research`;
rawModel.scope = { ...rawModel.scope, symbol, range };
const segment = rawModel.segments[0];
segment.id = 'selected-research-settings';
segment.range = range;
segment.source = {
  kind: 'userConfiguration',
  configuredAt: clock,
  revision: '1',
  description: '本人本地研究：结构化状态独立冻结，价格与单位使用归一化研究模型',
  references: ['docs/specs/2026-10-09-history-data-on-demand.md'],
};
segment.fees.stampDuty.rate = '0.001';
segment.assumptions = [
  '前复权价格与连续归一化单位用于本人研究；缺 Bar 不生成报价，不叠加现金分红。',
  '来源明确停牌日不成交；未知日期沿用已选普通价格研究假设。',
  '粗 ST 只披露，不决定精确价格限制；当前取得的历史状态不作为历史可见信号。',
  '佣金双向0.0003、最低CNY5，卖侧印花税0.001、双向过户费0.00001为本次显式研究配置；金额两位halfUp。',
  '持仓成交后第一个交易日可卖，卖出资金当日可再投资。',
];
segment.execution.price = {
  kind: 'noDailyLimit',
  reason: '归一化研究按连续价格计算；精确历史限制未验证',
};
segment.execution.normalizedExecution = {
  priceCoordinate: 'continuous-decimal',
  quantityUnits: 'continuous-normalized-decimal',
  lotSizeConstraint: 'not-applied',
  tickSizeConstraint: 'not-applied',
  dailyPriceLimit: 'not-applied',
  feeBasis: 'simulatedTurnover',
};
const executionModel = backtestExecutionModelSchemaV3.parse(rawModel);
const intent = backtestRunPreparationIntentV3Schema.parse({
  contractVersion: 3,
  requestId: randomUUID(),
  ...(process.argv.includes('--lifecycle') ? { lifecycleResearch: 'listed-bars-warmup-v1' } : {}),
  adjustment: 'qfq',
  accountingBasis: 'normalized-series',
  history: { basis: 'fixed-provider-snapshot' },
  freezeTimePolicy: 'after-acquisition',
  runConfig: {
    startDate: start,
    endDate: end,
    dataAsOf: clock,
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel,
  },
});
const baseUrl = process.env.HISTORY_TARGET_BASE_URL ?? 'http://127.0.0.1:3000';
const api = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1600)}`);
  return data;
};
if (!process.argv.includes('--run')) {
  console.log(
    JSON.stringify({
      mode: 'plan',
      symbol,
      range,
      executionModel,
      operations: [
        '只读当前有效路由',
        '标准准备/创建研究回测',
        '读取持久终态与实际冻结状态',
        '核对主备未修改',
      ],
    }),
  );
} else {
  const policy = await api('/api/market-data/policy');
  assert.equal(policy.syncState, 'applied', '当前策略未同步');
  const route = policy.routes.find(
    (r) =>
      r.key.market === 'CN' &&
      r.key.assetType === 'STOCK' &&
      r.key.capability === 'HISTORICAL_TRADING_STATUS',
  );
  assert(
    route?.targets.some((t) => t.providerId === 'baostock' && t.upstreamSource === 'baostock'),
    '当前股票状态路由未选择 BaoStock；需用户明确选择，脚本不会自动保存',
  );
  const created = await api('/api/v1/backtests/strategies', {
    name: `${strategy.name} ${clock}`,
    schema: strategy,
    description:
      '按实际证券和日期取得价格与股票状态的本人研究验收；归一化价格和显式费用假设独立冻结。',
  });
  const selected = created.versions[0];
  console.error(
    JSON.stringify({ stage: 'strategy', strategyId: created.id, strategyVersionId: selected.id }),
  );
  const preparationRequest = backtestRunPreparationRequestV3Schema.parse({
    ...intent,
    strategyVersionId: selected.id,
  });
  let prepared = await api('/api/v1/backtests/run-config/prepare', preparationRequest);
  const preparationDeadline = Date.now() + 240_000;
  while (prepared.status === 'preparing' && Date.now() < preparationDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    prepared = await api('/api/v1/backtests/run-config/prepare', preparationRequest);
  }
  if (process.argv.includes('--expect-blocked')) {
    assert.equal(prepared.status, 'blocked');
    if(process.argv.includes('--expect-insufficient')) assert(prepared.diagnostics.some(item => item.message.includes('始终不足')), '不是预期的真实预热不足拒绝');
    console.log(JSON.stringify({ symbol, range, preparation: prepared }));
    process.exit(0);
  }
  assert.equal(
    prepared.status,
    'prepared',
    `准备未完成：${JSON.stringify(prepared).slice(0, 1800)}`,
  );
  const queued = await api(
    '/api/v1/backtests/runs',
    backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId: selected.id,
      runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: `history-demand-${randomUUID()}`,
    }),
  );
  console.error(JSON.stringify({ stage: 'queued', jobId: queued.id }));
  let job = queued;
  const deadline = Date.now() + 180_000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await api(`/api/v1/backtests/runs/${queued.id}`);
  }
  assert.equal(
    job.status,
    'succeeded',
    JSON.stringify({
      id: job.id,
      status: job.status,
      errorCode: job.errorCode,
      errorSummary: job.errorSummary,
    }),
  );
  const result = backtestResultSchemaV3.parse(job.result);
  const disclosure = result.tradingStatusDisclosure;
  assert.equal(disclosure?.status, 'source');
  assert.equal(disclosure.response.provenance.providerId, 'baostock');
  assert.equal(disclosure.response.symbol, symbol);
  assert.deepEqual(
    disclosure.response.range,
    job.input.runConfig.lifecyclePreparation?.response.range ?? range,
  );
  assert.equal(disclosure.structuredResearch?.mode, 'fixed-source-status-research-v1');
  assert.equal(
    job.snapshotManifest.tradingStatus.freezeVersion,
    disclosure.response.basicLifecycle ? 'frozen-trading-status-v5' : 'frozen-trading-status-v4',
  );
  if (process.argv.includes('--require-basic-lifecycle')) {
    const life = disclosure.response.basicLifecycle;
    assert(life?.ipoDateStatus === 'known' && life.ipoDate, '未取得实际上市日');
    assert(
      disclosure.response.sourceRecords.some(
        (record) => record.id === life.sourceRecordId && record.queryMethod === 'query_stock_basic',
      ),
      '基础日期来源未冻结',
    );
    assert(
      !result.simulationFills.some(
        (fill) =>
          fill.occurredAt.slice(0, 10) < life.ipoDate ||
          (life.outDate && fill.occurredAt.slice(0, 10) >= life.outDate),
      ),
      '生命周期边界仍成交',
    );
  }
  const suspended = new Set(
    disclosure.response.days.filter((d) => d.state === 'suspended').map((d) => d.date),
  );
  assert(
    !result.simulationFills.some((fill) => suspended.has(fill.occurredAt.slice(0, 10))),
    '明确停牌日发生了成交',
  );
  if (process.argv.includes('--require-start-suspended'))
    assert(suspended.has(start), '起点实际状态不是停牌');
  assert(result.simulationFills.length > 0, '本次没有成交，不能证明复牌后的消费');
  assert.deepEqual(await api('/api/market-data/policy'), policy, '用户配置变化，需重新核对来源');
  console.log(
    JSON.stringify({
      symbol,
      range,
      strategyId: created.id,
      strategyVersionId: selected.id,
      jobId: job.id,
      status: job.status,
      snapshotId: result.snapshotId,
      resultChecksum: result.resultChecksum,
      runConfig: job.input.runConfig,
      actualSources: result.actualSources,
      fills: result.simulationFills,
      rejectedOrders: result.rejectedOrders,
      warnings: result.warnings,
      tradingStatusDisclosure: disclosure,
      manifest: job.snapshotManifest,
    }),
  );
}
