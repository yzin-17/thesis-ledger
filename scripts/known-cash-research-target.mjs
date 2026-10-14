import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  strategySchema,
  backtestExecutionModelSchemaV3,
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3,
  backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

const [symbol, start, end] = process.argv.slice(2);
assert(/^\d{6}\.(SH|SZ)$/.test(symbol ?? ''), '需要境内ETF代码');
assert(
  /^\d{4}-\d{2}-\d{2}$/.test(start ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(end ?? '') && start <= end,
  '需要有序日期区间',
);
const option = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const clock = new Date().toISOString();
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const rawStrategy = await fixture('backtest-v2.exchange.json');
const asset = { symbol, market: 'CN', assetType: 'etf' };
rawStrategy.name = `${symbol} 分红记录研究`;
rawStrategy.executionInstrument = asset;
rawStrategy.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
const close = { type: 'series', sourceId: 'execution', field: 'close' };
rawStrategy.entry = {
  type: 'compare',
  operator: 'gt',
  left: close,
  right: { type: 'constant', value: '0' },
};
if (option('entry-volume')) {
  rawStrategy.signalSources[0].series.push('volume');
  rawStrategy.entry = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'series', sourceId: 'execution', field: 'volume' },
    right: { type: 'constant', value: option('entry-volume') },
  };
}
if (option('entry-close'))
  rawStrategy.entry = {
    type: 'compare',
    operator: 'eq',
    left: close,
    right: { type: 'constant', value: option('entry-close') },
  };
rawStrategy.exit = {
  type: 'compare',
  operator: 'lt',
  left: close,
  right: { type: 'constant', value: '0' },
};
if (option('exit-after'))
  rawStrategy.exit = {
    type: 'compare',
    operator: 'gte',
    left: { type: 'positionState', field: 'holdingPeriods' },
    right: { type: 'constant', value: option('exit-after') },
  };
rawStrategy.sizing = option('quantity') ? { type: 'fixedQuantity', quantity: option('quantity') } : { type: 'fixedAmount', amount: '50000' };
rawStrategy.risk = [];
rawStrategy.cost = { commissionRate: '0', slippageRate: '0' };
const strategy = strategySchema.parse(rawStrategy);
const rawModel = await fixture('backtest-execution-model.cn-2024q1.json');
rawModel.id = `known-cash-${symbol.replace('.', '-')}`;
rawModel.scope = { ...rawModel.scope, symbol, instrumentType: 'ETF', range: { start, end } };
const segment = rawModel.segments[0];
segment.range = { start, end };
segment.source = {
  kind: 'userConfiguration',
  revision: '1',
  configuredAt: clock,
  description: '本人有界现金研究的显式执行假设',
  references: ['docs/specs/2026-10-09-history-data-on-demand.md'],
};
segment.assumptions = [
  '原价及实际份额，登记日交易结束后成交持有份额获得资格，包含当日买入、扣除当日卖出，T+1可卖限制保持；税前现金于除息日确认应收，方案发放日开盘模拟结算。',
  '覆盖未知，遗漏事件不纳入；拆分、税费、实际支付和历史首次可见性未验证。',
  '本研究所有收费与滑点为零，无日涨跌幅限制；保留实际整手、价位、T+1及价格/日历检查。',
];
segment.fees.commission.rate = '0';
segment.fees.commission.minimum = { kind: 'none' };
for (const charge of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
  segment.fees[charge] = { treatment: 'notApplicable', reason: '显式零收费研究假设' };
segment.execution.price = { kind: 'noDailyLimit', reason: '本研究明确不模拟日价格限制' };
const executionModel = backtestExecutionModelSchemaV3.parse(rawModel);
const policy = {
  version: 'known-announced-cash-events-v1',
  entitlement: 'cn-etf-record-close-holdings-v2',
  receivable: 'ex-date',
  settlement: 'assume-scheduled-payment-date',
  missingEvents: 'excluded-with-unknown-coverage',
  usage: 'accounting-only',
  splitEvents: 'not-modelled',
  historicalAvailability: 'notVerified',
  uncertainRecords: process.argv.includes('--assume-unknown') ? 'assume-scheduled' : 'exclude',
};
const intent = {
  contractVersion: 3,
  requestId: randomUUID(),
  adjustment: 'none',
  accountingBasis: 'raw-events',
  history: { basis: 'fixed-provider-snapshot' },
  cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
  knownCashResearch: policy,
  warmupBudgetSessions: 1,
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
};
if (option('reuse-data')) {
  const previous = JSON.parse(await readFile(option('reuse-data'), 'utf8'));
  const frozen = previous.prepared.runConfig;
  assert.equal(frozen.knownCashPreparation.input.policy.entitlement, 'cn-etf-record-close-holdings-v2');
  intent.reuseResearchData = {
    executionWindow: frozen.frozenExecutionWindow,
    cashPreparationHash: frozen.knownCashPreparation.contentHash,
  };
}
const api = async (path, body) => {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  const value = await response.json();
  assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(value).slice(0, 2500)}`);
  return value;
};
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }));
} else {
  const before = await api('/api/market-data/policy');
  const prior = option('resume') ? JSON.parse(await readFile(option('resume'), 'utf8')) : undefined;
  if (prior) {
    assert.equal(prior.request.runConfig.executionModel.scope.symbol, symbol);
    assert.equal(prior.request.runConfig.startDate, start);
    assert.equal(prior.request.runConfig.endDate, end);
    assert.deepEqual(prior.request.knownCashResearch, policy);
    assert(!prior.queued, '已有Run不能再次创建');
  }
  const created = prior
    ? { id: prior.strategyId, versions: [{ id: prior.request.strategyVersionId }] }
    : await api('/api/v1/backtests/strategies', {
        name: `${strategy.name} ${clock}`,
        schema: strategy,
        description: '历史按需数据D5：已知方案/未知覆盖，真实来源与冻结消费验收。',
      });
  const strategyVersionId = created.versions[0].id;
  const request =
    prior?.request ?? backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId });
  const prepared =
    prior?.prepared ??
    backtestRunPreparationResultV3Schema.parse(
      await api('/api/v1/backtests/run-config/prepare', request),
    );
  const capture = prior ?? { strategy, strategyId: created.id, request, prepared };
  const save = async () => {
    if (option('output')) await writeFile(option('output'), JSON.stringify(capture, null, 2));
  };
  await save();
  console.error(
    JSON.stringify({
      stage: 'prepared',
      symbol,
      start,
      end,
      status: prepared.status,
      ...(prepared.status === 'blocked' ? { diagnostics: prepared.diagnostics } : {}),
    }),
  );
  assert.equal(prepared.status, 'prepared');
  const preflight = await api('/api/v1/backtests/run-config/preflight', {
    contractVersion: 3,
    requestId: request.requestId,
    strategyVersionId,
    runConfig: prepared.runConfig,
  });
  capture.preflight = preflight;
  await save();
  assert.equal(preflight.status, 'ready', JSON.stringify(preflight));
  assert.deepEqual(preflight.revisionStamp, prepared.executionPreflight.revisionStamp);
  const queued = await api(
    '/api/v1/backtests/runs',
    backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId,
      runConfig: prepared.runConfig,
      preparationStamp: preflight.revisionStamp,
      idempotencyKey: `known-cash-${randomUUID()}`,
    }),
  );
  capture.queued = queued;
  await save();
  console.error(JSON.stringify({ stage: 'queued', runId: queued.id }));
  let job = queued;
  const deadline = Date.now() + 120_000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 2000));
    job = await api(`/api/v1/backtests/runs/${queued.id}`);
  }
  capture.job = job;
  await save();
  assert.equal(
    job.status,
    'succeeded',
    JSON.stringify({
      status: job.status,
      errorCode: job.errorCode,
      errorSummary: job.errorSummary,
    }),
  );
  const result = backtestResultSchemaV3.parse(job.result);
  assert.equal(result.knownCashDividendDisclosure.coverage.complete, false);
  assert.equal(result.benchmark.totalReturn.status, 'unavailable');
  assert.equal(result.resultChecksum, job.resultChecksum);
  assert.deepEqual(await api('/api/market-data/policy'), before);
  console.log(
    JSON.stringify({
      symbol,
      start,
      end,
      runId: job.id,
      snapshotId: job.snapshotId,
      resultChecksum: job.resultChecksum,
      priceSource: result.actualSources.filter((value) => value.purpose === 'execution'),
      cashSource: result.knownCashDividendDisclosure.source,
      records: result.knownCashDividendDisclosure.records,
      ignoredEmptyRows: result.knownCashDividendDisclosure.ignoredEmptyRows,
      coverage: result.knownCashDividendDisclosure.coverage,
      trades: result.trades.length,
      output: option('output'),
    }),
  );
}
