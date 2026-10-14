import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  strategySchema,
  backtestExecutionModelSchemaV3,
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3,
  backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

const market = process.argv.includes('--us') ? 'US' : 'HK';
const brokerCosts = process.argv.includes('--broker-costs');
const expandedFees = process.argv.includes('--expanded-fees');
assert(
  !expandedFees || market === 'HK',
  '新增公共收费目标当前只验收港股成交额口径；美股TAF缺实际单位资格',
);
const sample =
  market === 'HK'
    ? {
        symbol: '00147.HK',
        currency: 'HKD',
        timezone: 'Asia/Hong_Kong',
        start: '2025-08-06',
        end: '2025-08-11',
        excluded: '2025-08-07',
        fee: 'hkex-trading-fee',
        state: 'hkex-00147-halt',
      }
    : {
        symbol: 'GME.US',
        currency: 'USD',
        timezone: 'America/New_York',
        start: '2024-05-10',
        end: '2024-05-24',
        excluded: '2024-05-13',
        fee: 'us-section31-exchange-t2',
        state: 'nyse-gme-halt-observations',
      };
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
if (expandedFees) sample.fee = 'hk-stock-public-fees';
const range = { start: sample.start, end: sample.end },
  clock = new Date().toISOString();
const asset = { symbol: sample.symbol, market, assetType: 'stock' };
const raw = await fixture('backtest-v2.exchange.json');
raw.name = `${sample.symbol} 公共收费与盘中状态研究`;
if (brokerCosts) raw.name += ' · 富途成本';
raw.executionInstrument = asset;
raw.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
const condition = {
  type: 'compare',
  operator: 'gte',
  left: { type: 'series', sourceId: 'execution', field: 'close' },
  right: {
    type: 'indicator',
    name: 'MA',
    input: { type: 'series', sourceId: 'execution', field: 'close' },
    params: { period: 1 },
  },
};
const openPosition = { type: 'positionState', field: 'isOpen' };
const entryCondition =
  market === 'US'
    ? { ...condition, operator: 'lte', right: { ...condition.right, params: { period: 2 } } }
    : condition;
raw.entry = {
  type: 'all',
  conditions: [entryCondition, { type: 'not', expression: openPosition }],
};
raw.exit = { type: 'all', conditions: [condition, openPosition] };
raw.sizing = { type: 'fixedAmount', amount: '50000' };
raw.risk = [];
raw.cost = { commissionRate: '0', slippageRate: '0' };
const strategy = strategySchema.parse(raw);
const model = await fixture('backtest-execution-model.cn-2024q1.json');
model.id = `${market.toLowerCase()}-${sample.symbol}-bounded-rules`;
if (brokerCosts) model.id += '-futu-cost';
model.scope = {
  symbol: sample.symbol,
  market,
  instrumentType: 'STOCK',
  currency: sample.currency,
  timezone: sample.timezone,
  range,
};
for (const segment of model.segments) {
  segment.range = range;
  segment.source = {
    kind: 'userConfiguration',
    revision: '1',
    configuredAt: clock,
    description: '显式归一化日线收费/状态研究设置，市场单位未核实',
    references: ['docs/specs/2026-10-07-p6-market-state-expansion.md'],
  };
  segment.assumptions = [
    '归一化连续价格/单位，不应用真实整手、价位或日涨跌幅。',
    brokerCosts
      ? '富途香港标准佣金和固定式平台费；公共收费仅纳入已冻结项目，其余收费未纳入；滑点为零，非券商账单。'
      : '仅纳入已冻结公共费项；其他收费未纳入，佣金和滑点明确设为零，非券商账单。',
    '已知盘中暂停按显式保守日线模型排除相交会话日期，其余状态未知。',
    '每笔每项两位小数halfUp；成交后下一交易日可卖，卖出资金当日可再投资。',
  ];
  segment.fees.currency = sample.currency;
  segment.fees.commission = {
    ...segment.fees.commission,
    currency: sample.currency,
    rate: '0',
    minimum: { kind: 'none' },
  };
  for (const code of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
    segment.fees[code] = { treatment: 'notApplicable', reason: '本次部分收费研究未纳入该费项' };
  segment.fees[market === 'HK' ? 'handlingFee' : 'regulatoryFee'] = {
    ...segment.fees.commission,
    side: market === 'HK' ? 'both' : 'sell',
  };
  if (expandedFees) {
    for (const code of ['stampDuty', 'regulatoryFee', 'afrcLevy'])
      segment.fees[code] = { ...segment.fees.commission, side: 'both' };
    segment.fees.stampDuty.amountRounding = { mode: 'ceil', decimalPlaces: 0 };
    segment.assumptions[3] =
      '印花税每笔整港元进位，其他各费项独立两位小数halfUp；成交后下一交易日可卖，卖出资金当日可再投资。';
  }
  segment.execution.calendarMarket = market;
  segment.execution.statusPolicy = { intradayHalt: 'exclude-known-halt-date-v1' };
  if (market === 'US')
    segment.execution.statusPolicy.resultAvailability = 'valid-metrics-with-status-rejections-v1';
  segment.execution.price = { kind: 'noDailyLimit', reason: '归一化研究不应用真实日涨跌幅限制' };
  segment.execution.normalizedExecution = {
    priceCoordinate: 'continuous-decimal',
    quantityUnits: 'continuous-normalized-decimal',
    lotSizeConstraint: 'not-applied',
    tickSizeConstraint: 'not-applied',
    dailyPriceLimit: 'not-applied',
    feeBasis: 'simulatedTurnover',
  };
  if (brokerCosts) {
    const profile = (await fixture('backtest-broker-commission.futu.json'))[market];
    if (market === 'US') {
      profile.basis.price = '25';
      profile.userModified = true;
    }
    segment.fees.brokerCommission = profile;
    segment.source.references.push(profile.sourceUrl);
    segment.assumptions.push(
      '券商成本：当前套餐作为研究预设，一单一次成交；美股参考股数按模拟成交额除以显式参考股价计算。',
    );
  }
}
const intent = {
  contractVersion: 3,
  requestId: randomUUID(),
  adjustment: 'qfq',
  accountingBasis: 'normalized-series',
  history: { basis: 'fixed-provider-snapshot' },
  warmupBudgetSessions: market === 'US' ? 2 : 1,
  freezeTimePolicy: 'after-acquisition',
  runConfig: {
    startDate: range.start,
    endDate: range.end,
    dataAsOf: clock,
    baseCurrency: sample.currency,
    initialCash: { [sample.currency]: '100000' },
    valuationPolicy: {
      baseTimezone: sample.timezone,
      dailyValuationTime: '16:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: backtestExecutionModelSchemaV3.parse(model),
  },
};
const api = async (path, body, method = 'POST') => {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: body ? method : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120000),
  });
  const value = await response.json();
  assert(response.ok, `${response.status}: ${JSON.stringify(value).slice(0, 2000)}`);
  return value;
};
if (!process.argv.includes('--run'))
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }, null, 2));
else {
  const policy = await api('/api/market-data/policy'),
    routes = structuredClone(policy.routes);
  const key = (value) =>
    JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  for (const desired of [
    {
      key: {
        kind: 'bar',
        market,
        assetType: 'STOCK',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'qfq',
      },
      targets: [{ providerId: 'yfinance', upstreamSource: 'yfinance' }],
    },
    ...['HISTORICAL_PUBLIC_FEES', 'HISTORICAL_TRADING_STATUS'].map((capability) => ({
      key: { kind: 'data', market, assetType: 'STOCK', capability },
      targets: [
        {
          providerId: `official-${market.toLowerCase()}-rules`,
          upstreamSource: capability.includes('FEES') ? sample.fee : sample.state,
        },
      ],
    })),
  ]) {
    const found = routes.find((route) => key(route.key) === key(desired.key));
    if (!found) routes.push(desired);
    else assert.deepEqual(found.targets, desired.targets, '已有市场选择不同，不能覆盖当前配置');
  }
  if (JSON.stringify(routes) !== JSON.stringify(policy.routes))
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
  assert.equal((await api('/api/market-data/policy')).syncState, 'applied');
  const saved = await api('/api/v1/backtests/strategies', {
    name: `${strategy.name} ${clock}`,
    schema: strategy,
    description: 'P6 港美股有界来源消费者验收',
  });
  const strategyVersionId = saved.versions[0].id;
  const prepared = backtestRunPreparationResultV3Schema.parse(
    await api(
      '/api/v1/backtests/run-config/prepare',
      backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId }),
    ),
  );
  console.error(JSON.stringify({ stage: 'prepared', strategyVersionId, response: prepared }));
  assert.equal(prepared.status, 'prepared');
  const created = await api(
    '/api/v1/backtests/runs',
    backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId,
      runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: `p6-${market}-${randomUUID()}`,
    }),
  );
  console.error(JSON.stringify({ stage: 'queued', jobId: created.id }));
  let job = created;
  const deadline = Date.now() + 180000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 8000));
    job = await api(`/api/v1/backtests/runs/${created.id}`);
  }
  assert.equal(
    job.status,
    'succeeded',
    JSON.stringify({ status: job.status, error: job.errorSummary }),
  );
  const result = backtestResultSchemaV3.parse(job.result);
  assert.equal(result.publicFeesDisclosure.status, 'source');
  assert.equal(result.tradingStatusDisclosure.status, 'source');
  assert.deepEqual(result.tradingStatusDisclosure.executionInterpretation.excludedDates, [
    sample.excluded,
  ]);
  assert.equal(job.snapshotManifest.tradingStatus.freezeVersion, 'frozen-trading-status-v2');
  assert(result.simulationFills.length >= 2);
  assert(result.simulationFills.every((fill) => !fill.occurredAt.startsWith(sample.excluded)));
  console.log(
    JSON.stringify(
      { mode: 'run', market, sample, strategyId: saved.id, strategyVersionId, prepared, job },
      null,
      2,
    ),
  );
}
