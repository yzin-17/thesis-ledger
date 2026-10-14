import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assertExistingCashRoutes, policySelection } from './cash-dividend-target-policy.mjs';
import {
  strategySchema,
  backtestExecutionModelSchemaV3,
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3,
  backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

const end = process.argv.find((arg) => arg.startsWith('--end='))?.slice(6) ?? '2023-02-01';
assert(['2023-01-18', '2023-02-01'].includes(end));
const range = { start: '2023-01-05', end };
const clock = new Date().toISOString();
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const rawStrategy = await fixture('backtest-v2.exchange.json');
const asset = { symbol: '510300.SH', market: 'CN', assetType: 'etf' };
rawStrategy.name = `510300 现金分红实际目标 ${end}`;
rawStrategy.executionInstrument = asset;
rawStrategy.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
const close = { type: 'series', sourceId: 'execution', field: 'close' };
rawStrategy.entry = {
  type: 'compare',
  operator: 'gt',
  left: close,
  right: { type: 'constant', value: '0' },
};
rawStrategy.exit = {
  type: 'compare',
  operator: 'lt',
  left: close,
  right: { type: 'constant', value: '0' },
};
rawStrategy.sizing = { type: 'fixedAmount', amount: '50000' };
rawStrategy.risk = [];
rawStrategy.cost = { commissionRate: '0', slippageRate: '0' };
const strategy = strategySchema.parse(rawStrategy);
const rawModel = await fixture('backtest-execution-model.cn-2024q1.json');
rawModel.id = '510300-cash-notice-research';
rawModel.scope = { ...rawModel.scope, symbol: asset.symbol, instrumentType: 'ETF', range };
const segment = rawModel.segments[0];
segment.range = range;
segment.source = {
  kind: 'userConfiguration',
  revision: '1',
  configuredAt: clock,
  description: '真实现金入账目标验收；使用实际份额、整手、价位，收费与价格限制由本显式研究模型确定',
  references: ['docs/tasks/2026-10-03-multi-source-remaining-acceptance.md'],
};
segment.assumptions = [
  '所有收费与滑点为零的研究假设；无日涨跌幅限制',
  '现金资格在除息日确认，发放日开盘转为现金；拆分、税费、盘中到账和历史首次可见性未纳入',
];
segment.fees.commission.rate = '0';
segment.fees.commission.minimum = { kind: 'none' };
for (const charge of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
  segment.fees[charge] = { treatment: 'notApplicable', reason: '本次现金入账研究显式设置不收费' };
segment.execution.price = {
  kind: 'noDailyLimit',
  reason: '本次现金入账研究显式设置不模拟价格限制',
};
const executionModel = backtestExecutionModelSchemaV3.parse(rawModel);
const intent = {
  contractVersion: 3,
  requestId: randomUUID(),
  adjustment: 'none',
  accountingBasis: 'raw-events',
  history: { basis: 'fixed-provider-snapshot' },
  cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
  warmupBudgetSessions: 1,
  freezeTimePolicy: 'after-acquisition',
  runConfig: {
    startDate: range.start,
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
const api = async (path, body, method = 'POST') => {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: body ? method : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json();
  assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 2500)}`);
  return data;
};
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }, null, 2));
} else {
  const policy = await api('/api/market-data/policy');
  const desired = [
    {
      key: {
        kind: 'bar',
        market: 'CN',
        assetType: 'ETF',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'none',
      },
      targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }],
    },
    {
      key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' },
      targets: [{ providerId: 'official-dividends', upstreamSource: 'cn-etf-cash-notices' }],
    },
  ];
  const canonicalKey = (key) =>
    JSON.stringify(Object.entries(key).sort(([a], [b]) => a.localeCompare(b)));
  const routes = [...policy.routes];
  let changed = !policy.enabled;
  const keepPolicy = process.argv.includes('--keep-policy');
  if (keepPolicy) assertExistingCashRoutes(policy, desired);
  for (const route of desired) {
    if (keepPolicy) break;
    const existing = routes.find(
      (candidate) => canonicalKey(candidate.key) === canonicalKey(route.key),
    );
    if (existing) {
      if (route.key.capability === 'CASH_DISTRIBUTION') {
        const target = route.targets[0];
        if (
          !existing.targets.some(
            (item) =>
              item.providerId === target.providerId &&
              item.upstreamSource === target.upstreamSource,
          )
        ) {
          const index = routes.indexOf(existing);
          routes[index] = { ...existing, targets: [...existing.targets, target] };
          changed = true;
        }
      } else {
        assert.deepEqual(existing.targets, route.targets, '已有价格来源选择不应被验收脚本覆盖');
      }
    } else {
      routes.push(route);
      changed = true;
    }
  }
  if (changed)
    await api(
      '/api/market-data/policy',
      {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: randomUUID(),
        revision: policy.revision + 1,
        enabled: true,
        routes,
      },
      'PUT',
    );
  const applied = await api('/api/market-data/policy');
  assert.equal(applied.syncState, 'applied');
  if (keepPolicy) assert.deepEqual(policySelection(applied), policySelection(policy));
  const created = await api('/api/v1/backtests/strategies', {
    name: `${strategy.name} ${clock}`,
    schema: strategy,
    description: 'M31 有界实际现金分红；原始价格、实际份额、明确研究假设。',
  });
  const strategyVersionId = created.versions[0].id;
  const prepared = backtestRunPreparationResultV3Schema.parse(
    await api(
      '/api/v1/backtests/run-config/prepare',
      backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId }),
    ),
  );
  console.error(
    JSON.stringify({
      stage: 'prepared',
      strategyId: created.id,
      strategyVersionId,
      response: prepared,
    }),
  );
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.runConfig.executionPriceProtocol.priceBasis.adjustment, 'none');
  assert.equal(
    prepared.runConfig.executionPriceProtocol.cashEventResearch,
    intent.cashEventResearch,
  );
  const queued = await api(
    '/api/v1/backtests/runs',
    backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId,
      runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: `cash-notice-${end}-${randomUUID()}`,
    }),
  );
  console.error(JSON.stringify({ stage: 'queued', jobId: queued.id }));
  let job = queued;
  const deadline = Date.now() + 120_000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 10000));
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
  const record = result.cashDividendDisclosure.records[0];
  assert.equal(record.eligibleQuantity, '12400');
  assert.equal(record.amountPerFundUnit, '0.064');
  assert.equal(record.grossCashAmount, '793.6');
  assert.equal(record.status, end === '2023-01-18' ? 'receivable' : 'paid');
  assert.equal(result.metrics.totalReturn.value, end === '2023-01-18' ? '0.020336' : '0.027776');
  assert.equal(result.completeness, 'partial');
  assert.equal(result.benchmark.totalReturn.status, 'unavailable');
  assert.equal(job.resultChecksum, result.resultChecksum);
  assert.deepEqual(policySelection(await api('/api/market-data/policy')), policySelection(applied));
  console.log(
    JSON.stringify(
      {
        mode: 'run',
        end,
        strategyId: created.id,
        strategyVersionId,
        prepared,
        job,
        policyPreserved: keepPolicy,
      },
      null,
      2,
    ),
  );
}
