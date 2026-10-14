import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DecimalValue } from '../packages/domain/dist/index.js';
import {
  strategySchema,
  backtestExecutionModelSchemaV3,
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationIntentV3Schema,
  backtestRunCreateSchemaV3,
  backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

const baseUrl = process.env.FEE_TARGET_BASE_URL ?? 'http://127.0.0.1:3000';
const scenario =
  process.argv.find((arg) => arg.startsWith('--scenario='))?.split('=')[1] ?? 'primary';
assert(['primary', 'backup', 'model'].includes(scenario), '未知收费验收场景');
const starts = { primary: '2023-08-23', backup: '2023-08-22', model: '2023-08-21' };
const range = { start: starts[scenario], end: '2023-08-29' };
const symbol = '600000.SH';
const verifyBenchmark = process.argv.includes('--benchmark');
const clock = new Date().toISOString();
const loadFixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const rawStrategy = await loadFixture('backtest-v2.exchange.json');
rawStrategy.name = '历史公共收费实际来源研究';
rawStrategy.signalSources = [
  {
    id: 'execution',
    asset: { symbol, market: 'CN', assetType: 'stock' },
    timeframe: '1d',
    series: ['close'],
  },
];
rawStrategy.executionInstrument = { symbol, market: 'CN', assetType: 'stock' };
rawStrategy.entry = {
  type: 'not',
  expression: { type: 'positionState', field: 'isOpen' },
};
rawStrategy.exit = { type: 'positionState', field: 'isOpen' };
rawStrategy.risk = [];
rawStrategy.cost.slippageRate = '0';
const strategy = strategySchema.parse(rawStrategy);
const rawModel = await loadFixture('backtest-execution-model.cn-2024q1.json');
rawModel.id = 'cn-600000-public-fees-local-research';
rawModel.scope = { ...rawModel.scope, symbol, range };
rawModel.segments[0].id = 'selected-research-settings';
rawModel.segments[0].range = range;
rawModel.segments[0].source = {
  kind: 'userConfiguration',
  configuredAt: clock,
  revision: '1',
  description: '本人本地研究：公共费率独立冻结，佣金及金额设置使用显式模型',
  references: ['docs/specs/2026-10-06-historical-rules-primary-backup.md'],
};
rawModel.segments[0].assumptions = [
  '前复权归一化研究使用连续价格和连续单位，费用按模拟成交额计算。',
  '佣金双向0.0003，每笔最低CNY 5，包含监管费和经手费。',
  '每笔每项应用最低额后按CNY两位小数halfUp取整；公共费率由独立冻结来源覆盖。',
  '持仓成交后第一个交易日可卖，卖出资金当日可再投资。',
];
rawModel.segments[0].execution.price = { kind: 'noDailyLimit', reason: '归一化研究按连续价格计算' };
rawModel.segments[0].execution.normalizedExecution = {
  priceCoordinate: 'continuous-decimal',
  quantityUnits: 'continuous-normalized-decimal',
  lotSizeConstraint: 'not-applied',
  tickSizeConstraint: 'not-applied',
  dailyPriceLimit: 'not-applied',
  feeBasis: 'simulatedTurnover',
};
const executionModel = backtestExecutionModelSchemaV3.parse(rawModel);
const intent = {
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
};
const desiredRoutes = [
  {
    key: {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
    },
    targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }],
  },
  {
    key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'HISTORICAL_PUBLIC_FEES' },
    targets: [
      { providerId: 'official-rules', upstreamSource: 'cn-stock-auction-fees' },
      ...(scenario === 'primary'
        ? []
        : [{ providerId: 'official-rules', upstreamSource: 'cn-stock-auction-fees-archive' }]),
    ],
  },
];
backtestRunPreparationIntentV3Schema.parse(intent);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `目标接口 ${path} 返回 ${response.status}: ${JSON.stringify(data).slice(0, 700)}`,
    );
  return data;
};

if (!process.argv.includes('--run')) {
  console.log(
    JSON.stringify(
      {
        mode: 'plan',
        scenario,
        symbol,
        range,
        accountingBasis: intent.accountingBasis,
        configuredRoutes: desiredRoutes,
        executionModelId: executionModel.id,
        operations: [
          '合并当前策略修订',
          '新建独立研究策略',
          '准备并投递回测',
          '读取持久化终态及收费结果',
        ],
      },
      null,
      2,
    ),
  );
} else {
  const catalog = await api('/api/market-data/routes/capabilities?contractVersion=3');
  assert.equal(catalog.status, 'complete');
  for (const route of desiredRoutes) {
    for (const target of route.targets)
      assert(
        catalog.entries.some(
          (entry) =>
            same(entry.key, route.key) && same(entry.target, target) && entry.state === 'ready',
        ),
        `目标能力未就绪: ${route.key.capability}`,
      );
  }
  const current = await api('/api/market-data/policy');
  const routes = [...current.routes];
  let changed = false;
  for (const route of desiredRoutes) {
    const existing = routes.find((value) => same(value.key, route.key));
    if (!existing) {
      routes.push(route);
      changed = true;
    } else if (!same(existing.targets, route.targets)) {
      if (
        route.key.capability === 'HISTORICAL_PUBLIC_FEES' &&
        existing.targets.length === 1 &&
        route.targets.length === 2 &&
        same(existing.targets[0], route.targets[0])
      ) {
        routes[routes.indexOf(existing)] = route;
        changed = true;
      } else if (!(
        scenario === 'primary' &&
        route.key.capability === 'HISTORICAL_PUBLIC_FEES' &&
        same(existing.targets[0], route.targets[0])
      )) {
        assert.deepEqual(existing.targets, route.targets, '已有不同路由，保持现有配置');
      }
    }
  }
  let policy = current;
  if (changed) {
    policy = await api(
      '/api/market-data/policy',
      {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: randomUUID(),
        revision: current.revision + 1,
        enabled: current.enabled,
        routes,
      },
      'PUT',
    );
  }
  assert.equal(policy.syncState, 'applied');
  let created;
  let selectedVersion;
  if (process.env.FEE_TARGET_STRATEGY_VERSION_ID) {
    const strategies = await api('/api/v1/backtests/strategies');
    created = strategies.find((item) =>
      item.versions.some((version) => version.id === process.env.FEE_TARGET_STRATEGY_VERSION_ID),
    );
    assert(created, '指定研究策略不存在');
    selectedVersion = created.versions.find(
      (version) => version.id === process.env.FEE_TARGET_STRATEGY_VERSION_ID,
    );
    assert.deepEqual(strategySchema.parse(selectedVersion.schema), strategy, '已有策略输入不一致');
  } else {
    created = await api('/api/v1/backtests/strategies', {
      name: `${strategy.name} ${clock}`,
      schema: strategy,
      description: '真实腾讯价格与冻结公共费率的本地研究验收；归一化单位，不作为券商实际账单。',
    });
    selectedVersion = created.versions[0];
  }
  const strategyVersionId = selectedVersion.id;
  console.error(JSON.stringify({ stage: 'strategy', strategyId: created.id, strategyVersionId }));
  const prepared = await api(
    '/api/v1/backtests/run-config/prepare',
    backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId }),
  );
  assert.equal(
    prepared.status,
    'prepared',
    `准备未完成: ${JSON.stringify(prepared).slice(0, 1400)}`,
  );
  const queued = await api(
    '/api/v1/backtests/runs',
    backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId,
      runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: randomUUID(),
    }),
  );
  let job = queued;
  for (let attempt = 0; attempt < 60 && ['queued', 'running'].includes(job.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await api(`/api/v1/backtests/runs/${queued.id}`);
  }
  assert.equal(
    job.status,
    'succeeded',
    `持久化终态未成功: ${JSON.stringify({ id: job.id, status: job.status, errorCode: job.errorCode, errorSummary: job.errorSummary })}`,
  );
  const result = backtestResultSchemaV3.parse(job.result);
  if (verifyBenchmark) {
    assert.equal(result.benchmarkCompatibility?.status, 'compatible');
    assert.equal(result.benchmarkCompatibility?.costAssumption.kind, 'execution-model');
    assert.equal(result.benchmarkCompatibility.costAssumption.version, 'execution-model-cost-v1');
    assert.equal(result.benchmark?.totalReturn?.status, 'available');
    assert.equal(result.benchmark?.excessReturn?.status, 'available');
    assert.equal(result.metrics.totalReturn?.status, 'available');
    assert.equal(result.completeness, 'complete', '本验收窗口仍有实际指标缺口');
    assert.equal(job.snapshotManifest?.benchmarkCostVersion, 'execution-model-cost-v1');
  }
  const disclosure = result.publicFeesDisclosure;
  assert.equal(disclosure?.status, scenario === 'model' ? 'executionModel' : 'source');
  if (disclosure.status === 'source') {
    assert.equal(disclosure.response.provenance.providerId, 'official-rules');
    assert.equal(
      disclosure.response.provenance.upstreamSource,
      scenario === 'backup' ? 'cn-stock-auction-fees-archive' : 'cn-stock-auction-fees',
    );
    assert.deepEqual(disclosure.response.range, range);
    if (scenario === 'backup') {
      assert.equal(disclosure.response.routeTarget.routeIndex, 1);
      assert(disclosure.fallbackReason?.includes('整段区间'));
    }
  }
  const sells = result.simulationFills.filter((fill) => fill.side === 'sell');
  assert(
    sells.some((fill) => fill.occurredAt.slice(0, 10) < '2023-08-28'),
    '缺少变更前卖出',
  );
  assert(
    sells.some((fill) => fill.occurredAt.slice(0, 10) >= '2023-08-28'),
    '缺少变更后卖出',
  );
  const sellChecks = sells.map((fill) => {
    const date = fill.occurredAt.slice(0, 10);
    const turnover = DecimalValue.from(fill.quantity).times(fill.price);
    let stampRate = date < '2023-08-28' ? '0.001' : '0.0005';
    if (scenario === 'model') stampRate = executionModel.segments[0].fees.stampDuty.rate;
    let commission = turnover.times('0.0003');
    if (commission.compareTo('5') < 0) commission = DecimalValue.from('5');
    const stampDuty = turnover.times(stampRate).dividedBy('1', 2);
    const transferFee = turnover.times('0.00001').dividedBy('1', 2);
    const expected = commission.dividedBy('1', 2).plus(stampDuty).plus(transferFee);
    const actual = fill.charges.reduce(
      (sum, charge) => sum.plus(charge.amount),
      DecimalValue.from('0'),
    );
    assert.equal(actual.toString(), expected.toString(), `模拟成交收费不一致: ${date}`);
    return {
      date,
      turnover: turnover.toString(),
      stampRate,
      stampDuty: stampDuty.toString(),
      totalCharges: actual.toString(),
    };
  });
  console.log(
    JSON.stringify(
      {
        mode: 'run',
        scenario,
        policyRevision: policy.revision,
        previousRoutes: current.routes.length,
        strategyId: created.id,
        strategyVersionId,
        jobId: job.id,
        snapshotId: result.snapshotId,
        resultChecksum: result.resultChecksum,
        ...(verifyBenchmark
          ? {
              benchmark: result.benchmark,
              benchmarkCompatibility: result.benchmarkCompatibility,
              metrics: result.metrics,
              completeness: result.completeness,
              benchmarkCostVersion: job.snapshotManifest.benchmarkCostVersion,
            }
          : {}),
        status: job.status,
        fills: result.simulationFills,
        publicFeesDisclosure: disclosure,
        sellChecks,
        actualSources: result.actualSources,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}
