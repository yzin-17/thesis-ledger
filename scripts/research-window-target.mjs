import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  strategySchema,
  backtestExecutionModelSchemaV3,
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationIntentV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3,
  backtestResultSchemaV3,
  backtestUnknownListingWarningV3,
} from '../packages/schemas/dist/index.js';

const symbol = process.argv.find((arg) => arg.startsWith('--symbol='))?.slice(9);
assert(['600000.SH', '600519.SH'].includes(symbol), '需指定 --symbol=600000.SH 或 600519.SH');
const range = { start: '2023-08-01', end: '2023-09-15' };
const clock = new Date().toISOString();
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const rawStrategy = await fixture('backtest-v2.exchange.json');
const close = { type: 'series', sourceId: 'execution', field: 'close' };
const ma = { type: 'indicator', name: 'MA', input: close, params: { period: 5 } };
rawStrategy.name = `扩展窗口 MA5 研究 ${symbol}`;
rawStrategy.executionInstrument = { symbol, market: 'CN', assetType: 'stock' };
rawStrategy.signalSources = [
  { id: 'execution', asset: rawStrategy.executionInstrument, timeframe: '1d', series: ['close'] },
];
rawStrategy.entry = { type: 'compare', operator: 'gt', left: close, right: ma };
rawStrategy.exit = { type: 'compare', operator: 'lt', left: close, right: ma };
rawStrategy.risk = [];
rawStrategy.cost.slippageRate = '0';
const strategy = strategySchema.parse(rawStrategy);
const rawModel = await fixture('backtest-execution-model.cn-2024q1.json');
rawModel.id = `cn-${symbol}-extended-window-research`;
rawModel.scope = { ...rawModel.scope, symbol, range };
rawModel.segments[0].id = 'selected-whole-window-model';
rawModel.segments[0].range = range;
rawModel.segments[0].source = {
  kind: 'userConfiguration',
  revision: '1',
  configuredAt: clock,
  description: '扩展窗口验收的显式研究设置；公共主备包不覆盖整窗时使用本模型。',
  references: ['docs/tasks/2026-10-03-multi-source-remaining-acceptance.md'],
};
rawModel.segments[0].assumptions = [
  '腾讯前复权归一化连续价格及连续单位；单次模拟金额 CNY 10000，零滑点。',
  '佣金双向成交额 0.0003，每笔最低 CNY 5，包含规费及经手费。',
  '整窗卖出印花税 0.0005、双向过户费 0.00001 均为研究假设，未按历史变化拼接。',
  '每笔每项应用最低额后按 CNY 两位小数 halfUp 舍入。',
  '成交后首个交易日可卖、卖出资金当日可再投资；无日涨跌幅、整手及价位限制。',
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
const intent = backtestRunPreparationIntentV3Schema.parse({
  contractVersion: 3,
  requestId: randomUUID(),
  adjustment: 'qfq',
  accountingBasis: 'normalized-series',
  history: { basis: 'fixed-provider-snapshot' },
  warmupBudgetSessions: 5,
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
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    ...(body
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json();
  assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1800)}`);
  return data;
};

if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', symbol, strategy, intent }, null, 2));
} else {
  const previousPolicy = await api('/api/market-data/policy');
  assert.equal(previousPolicy.revision, 40);
  assert.equal(previousPolicy.syncState, 'applied');
  const oldJobs = await Promise.all(
    ['873ba8dd-40c3-4f9e-b1d5-b16192f697b0', '652ba051-a4c5-493d-81e6-2cdbe3c090f0'].map((id) =>
      api(`/api/v1/backtests/runs/${id}`),
    ),
  );
  const created = await api('/api/v1/backtests/strategies', {
    name: `${strategy.name} ${clock}`,
    schema: strategy,
    description: 'C3.2 实际扩展窗口验收；固定快照、连续归一化单位及显式整窗研究费用。',
  });
  const strategyVersionId = created.versions[0].id;
  console.error(
    JSON.stringify({ stage: 'strategy', symbol, strategyId: created.id, strategyVersionId }),
  );
  const request = backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId });
  const prepared = backtestRunPreparationResultV3Schema.parse(
    await api('/api/v1/backtests/run-config/prepare', request),
  );
  console.error(
    JSON.stringify({ stage: 'prepared', symbol, status: prepared.status, response: prepared }),
  );
  assert.equal(prepared.status, 'prepared', '实际准备阻断，保留策略及准备响应以便诊断');
  assert.equal(prepared.runConfig.frozenWarmupBudgetSessions, 5);
  assert.deepEqual(prepared.runConfig.executionModel, executionModel);
  const queued = await api(
    '/api/v1/backtests/runs',
    backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId,
      runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: `research-window-c32-${symbol}-${randomUUID()}`,
    }),
  );
  console.error(JSON.stringify({ stage: 'queued', symbol, jobId: queued.id }));
  let job = queued;
  const deadline = Date.now() + 120_000;
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
  assert.equal(result.completeness, 'complete');
  assert.equal(result.publicFeesDisclosure?.status, 'executionModel');
  assert(result.publicFeesDisclosure.reason.length > 0);
  assert.equal(result.warnings.includes(backtestUnknownListingWarningV3), symbol === '600519.SH');
  assert.equal(result.metrics.totalReturn?.status, 'available');
  assert.equal(result.benchmark?.totalReturn?.status, 'available');
  assert.equal(result.benchmark?.excessReturn?.status, 'available');
  assert.equal(result.benchmarkCompatibility?.status, 'compatible');
  assert.equal(result.benchmarkCompatibility.costAssumption.version, 'execution-model-cost-v1');
  assert.equal(job.snapshotManifest.benchmarkCostVersion, 'execution-model-cost-v1');
  assert.equal(job.resultChecksum, result.resultChecksum);
  assert.deepEqual(job.runConfig.executionModel, executionModel);
  const nextPolicy = await api('/api/market-data/policy');
  for (const key of ['revision', 'dsaRevision', 'syncState', 'routes'])
    assert.deepEqual(nextPolicy[key], previousPolicy[key]);
  for (const oldJob of oldJobs)
    assert.deepEqual(await api(`/api/v1/backtests/runs/${oldJob.id}`), oldJob);
  console.log(
    JSON.stringify(
      {
        mode: 'run',
        symbol,
        strategyId: created.id,
        strategyVersionId,
        request,
        prepared,
        job,
        policy: {
          revision: nextPolicy.revision,
          dsaRevision: nextPolicy.dsaRevision,
          syncState: nextPolicy.syncState,
          routes: nextPolicy.routes,
        },
        protectedJobs: oldJobs.map(({ id, status, snapshotId, resultChecksum }) => ({
          id,
          status,
          snapshotId,
          resultChecksum,
        })),
      },
      null,
      2,
    ),
  );
}
