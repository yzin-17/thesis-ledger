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

// 沿用收费验收的标准准备／创建／读取接缝；只读现有配置，不修改路由。
const baseUrl = process.env.STATUS_TARGET_BASE_URL ?? 'http://127.0.0.1:3000';
const symbol = '000995.SZ';
const range = { start: '2023-08-16', end: '2023-08-21' };
const clock = new Date().toISOString();
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const rawStrategy = await fixture('backtest-v2.exchange.json');
rawStrategy.name = '皇台日级停复牌实际来源研究';
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
rawStrategy.risk = [];
rawStrategy.cost.slippageRate = '0';
const strategy = strategySchema.parse(rawStrategy);
const rawModel = await fixture('backtest-execution-model.cn-2024q1.json');
rawModel.id = 'cn-000995-trading-status-local-research';
rawModel.scope = { ...rawModel.scope, symbol, range };
const segment = rawModel.segments[0];
segment.id = 'selected-research-settings';
segment.range = range;
segment.source = {
  kind: 'userConfiguration',
  configuredAt: clock,
  revision: '1',
  description: '本人本地研究：公告停复牌独立冻结，价格与单位使用归一化研究模型',
  references: ['docs/specs/2026-10-06-historical-rules-primary-backup.md'],
};
segment.fees.stampDuty.rate = '0.001';
segment.assumptions = [
  '前复权价格与连续归一化单位用于本地研究；缺Bar不生成报价。',
  '未知日期沿用普通价格研究假设，独立公告只约束已知停牌日期。',
  '佣金双向0.0003、每笔最低CNY5、包含监管与经手费；卖侧印花税配置0.001、双向过户费0.00001。',
  '费用来源未覆盖时沿用本配置，按每笔每项CNY两位小数halfUp取整。',
  '持仓成交后第一个交易日可卖，卖出资金当日可再投资。',
];
segment.execution.price = { kind: 'noDailyLimit', reason: '归一化研究按连续价格计算' };
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
  adjustment: 'qfq',
  accountingBasis: 'normalized-series',
  history: { basis: 'fixed-provider-snapshot' },
  freezeTimePolicy: 'after-acquisition',
  runConfig: {
    startDate: range.start,
    endDate: range.end,
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
const api = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert(
    response.ok,
    `目标接口${path}返回${response.status}：${JSON.stringify(data).slice(0, 1400)}`,
  );
  return data;
};

if (!process.argv.includes('--run')) {
  console.log(
    JSON.stringify(
      {
        mode: 'plan',
        symbol,
        range,
        executionModelId: executionModel.id,
        operations: [
          '读取现有配置',
          '新建独立策略',
          '标准准备／创建回测',
          '读取持久终态并验证状态与费用',
        ],
      },
      null,
      2,
    ),
  );
} else {
  const policy = await api('/api/market-data/policy');
  assert.equal(policy.syncState, 'applied');
  assert(
    policy.routes.some(
      (route) =>
        route.key.capability === 'HISTORICAL_TRADING_STATUS' &&
        route.targets[0]?.providerId === 'official-states' &&
        route.targets[0]?.upstreamSource === 'cn-stock-daily-suspension',
    ),
  );
  let created;
  let selected;
  if (process.env.STATUS_TARGET_STRATEGY_VERSION_ID) {
    const all = await api('/api/v1/backtests/strategies');
    created = all.find((item) =>
      item.versions.some((v) => v.id === process.env.STATUS_TARGET_STRATEGY_VERSION_ID),
    );
    assert(created, '指定研究策略不存在');
    selected = created.versions.find((v) => v.id === process.env.STATUS_TARGET_STRATEGY_VERSION_ID);
    assert.deepEqual(strategySchema.parse(selected.schema), strategy);
  } else {
    created = await api('/api/v1/backtests/strategies', {
      name: `${strategy.name} ${clock}`,
      schema: strategy,
      description: '真实腾讯价格与发行人公告日级状态，归一化单位和显式费用模型的本地研究验收。',
    });
    selected = created.versions[0];
  }
  console.error(
    JSON.stringify({ stage: 'strategy', strategyId: created.id, strategyVersionId: selected.id }),
  );
  const prepared = await api(
    '/api/v1/backtests/run-config/prepare',
    backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId: selected.id }),
  );
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
      idempotencyKey: randomUUID(),
    }),
  );
  console.error(JSON.stringify({ stage: 'queued', jobId: queued.id }));
  let job = queued;
  for (let attempt = 0; attempt < 60 && ['queued', 'running'].includes(job.status); attempt += 1) {
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
  const status = result.tradingStatusDisclosure;
  assert.equal(status?.status, 'source');
  assert.equal(status.response.symbol, symbol);
  assert.deepEqual(status.response.range, range);
  assert.deepEqual(
    status.response.days.map((day) => [day.date, day.state]),
    [
      ['2023-08-16', 'unknown'],
      ['2023-08-17', 'suspended'],
      ['2023-08-18', 'trading'],
      ['2023-08-19', 'unknown'],
      ['2023-08-20', 'unknown'],
      ['2023-08-21', 'unknown'],
    ],
  );
  assert.equal(result.publicFeesDisclosure?.status, 'executionModel');
  assert(!result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-17')));
  assert(result.simulationFills.some((fill) => fill.occurredAt.startsWith('2023-08-18')));
  assert(
    result.simulationFills.some(
      (fill) => fill.side === 'sell' && fill.occurredAt.startsWith('2023-08-21'),
    ),
  );
  assert.equal(job.snapshotManifest?.tradingStatus?.freezeVersion, 'frozen-trading-status-v1');
  assert.equal(job.snapshotManifest?.benchmarkCostVersion, 'execution-model-cost-v1');
  assert.deepEqual(await api('/api/market-data/policy'), policy, '配置被改写');
  console.log(
    JSON.stringify(
      {
        mode: 'run',
        strategyId: created.id,
        strategyVersionId: selected.id,
        jobId: job.id,
        status: job.status,
        executionAttempt: job.executionAttempt,
        snapshotId: result.snapshotId,
        resultChecksum: result.resultChecksum,
        completeness: result.completeness,
        metrics: result.metrics,
        benchmark: result.benchmark,
        fills: result.simulationFills,
        rejectedOrders: result.rejectedOrders,
        tradingStatusDisclosure: status,
        publicFeesDisclosure: result.publicFeesDisclosure,
        actualSources: result.actualSources,
        warnings: result.warnings,
        manifest: job.snapshotManifest,
      },
      null,
      2,
    ),
  );
}
