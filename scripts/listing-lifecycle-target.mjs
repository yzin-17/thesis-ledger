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

const scenario = process.argv.find((arg) => arg === '--listing' || arg === '--delisting');
assert(scenario, '必须选择 --listing 或 --delisting');
const listing = scenario === '--listing';
const asset = { symbol: listing ? '603350.SH' : '600462.SH', market: 'CN', assetType: 'stock' };
// 现有日线策略需要一根真实预热Bar；上市首日用于预热，不补上市前价格。
const range = listing
  ? { start: '2024-07-04', end: '2024-07-11' }
  : { start: '2025-07-10', end: '2025-07-22' };
const source = listing ? 'cn-stock-initial-listing' : 'cn-stock-delisting-period';
const clock = new Date().toISOString();
const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const raw = await fixture('backtest-v2.exchange.json');
raw.name = `${asset.symbol} ${listing ? '上市初期' : '退市整理与摘牌'}原价研究`;
raw.executionInstrument = asset;
raw.signalSources = [{ id: 'execution', asset, timeframe: '1d', series: ['close'] }];
const condition = {
  type: 'compare',
  operator: 'gt',
  left: { type: 'series', sourceId: 'execution', field: 'close' },
  right: { type: 'constant', value: '0' },
};
const position = { type: 'positionState', field: 'isOpen' };
raw.entry = { type: 'all', conditions: [condition, { type: 'not', expression: position }] };
raw.exit = { type: 'all', conditions: [condition, position] };
raw.sizing = { type: 'fixedAmount', amount: '50000' };
raw.risk = [];
raw.cost = { commissionRate: '0', slippageRate: '0' };
const strategy = strategySchema.parse(raw);
const model = await fixture('backtest-execution-model.cn-2024q1.json');
model.id = `${asset.symbol}-listing-lifecycle-research`;
model.scope = { ...model.scope, symbol: asset.symbol, range };
for (const segment of model.segments) {
  segment.range = range;
  segment.source = {
    kind: 'userConfiguration',
    revision: '1',
    configuredAt: clock,
    description: '原价、实际股数及明确上市阶段研究模型',
    references: ['docs/specs/2026-10-07-p6-market-state-expansion.md'],
  };
  segment.assumptions = [
    '零佣金、零公共收费与零滑点；分红和拆合股未纳入。',
    '已知上市阶段和日限制由冻结公告覆盖；未知维度沿用本模型。',
    '缺失价格不补造，末次价格不是摘牌后可变现价值；不模拟持仓注销或退市板块交易。',
  ];
  segment.fees.commission.rate = '0';
  segment.fees.commission.minimum = { kind: 'none' };
  for (const code of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
    segment.fees[code] = { treatment: 'notApplicable', reason: '本次阶段研究明确不收费' };
  segment.execution.price = {
    kind: 'noDailyLimit',
    reason: '仅未知限制沿用此研究假设，已知公告覆盖',
  };
}
const intent = {
  contractVersion: 3,
  requestId: randomUUID(),
  adjustment: 'none',
  accountingBasis: 'raw-events',
  history: { basis: 'fixed-provider-snapshot' },
  marketRuleResearch: 'raw-prices-no-corporate-actions-v1',
  warmupBudgetSessions: 1,
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
    executionModel: backtestExecutionModelSchemaV3.parse(model),
  },
};
async function api(path, body, method = 'POST') {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    method: body ? method : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  assert(response.ok, `${path}: ${response.status}: ${JSON.stringify(result).slice(0, 1800)}`);
  return result;
}
const routeKey = (value) =>
  JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }, null, 2));
} else {
  const original = await api('/api/market-data/policy');
  const desired = [
    {
      key: {
        kind: 'bar',
        market: 'CN',
        assetType: 'STOCK',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'none',
      },
      targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }],
    },
    {
      key: {
        kind: 'data',
        market: 'CN',
        assetType: 'STOCK',
        capability: 'HISTORICAL_TRADING_STATUS',
      },
      targets: [{ providerId: 'official-states', upstreamSource: source }],
    },
  ];
  const desiredKeys = new Set(desired.map((route) => routeKey(route.key)));
  const selected = [
    ...original.routes.filter((route) => !desiredKeys.has(routeKey(route.key))),
    ...desired,
  ];
  await api(
    '/api/market-data/policy',
    {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: randomUUID(),
      revision: original.revision + 1,
      enabled: original.enabled,
      routes: selected,
    },
    'PUT',
  );
  try {
    assert.equal((await api('/api/market-data/policy')).syncState, 'applied');
    const saved = await api('/api/v1/backtests/strategies', {
      name: `${strategy.name} ${clock}`,
      schema: strategy,
      description: 'P6 上市阶段、原价限制和摘牌禁成交真实目标验收',
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
        idempotencyKey: `p6-lifecycle-${randomUUID()}`,
      }),
    );
    console.error(JSON.stringify({ stage: 'queued', jobId: created.id }));
    let job = created;
    const deadline = Date.now() + 180_000;
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
    assert.equal(job.snapshotManifest.tradingStatus.freezeVersion, 'frozen-trading-status-v3');
    const disclosure = result.tradingStatusDisclosure;
    assert.equal(disclosure.status, 'source');
    assert.equal(disclosure.response.provenance.upstreamSource, source);
    if (listing) {
      assert.equal(disclosure.response.days[0].listingPhase, 'initialListing');
      assert(disclosure.response.days.some((day) => day.noDailyPriceLimit));
      assert(disclosure.response.days.some((day) => day.dailyPriceLimit?.maxUpRatio === '0.1'));
    } else {
      assert(disclosure.response.days.some((day) => day.listingPhase === 'delistingPeriod'));
      assert(disclosure.response.days.some((day) => day.listingPhase === 'delisted'));
      assert(result.simulationFills.every((fill) => fill.occurredAt.slice(0, 10) <= '2025-07-14'));
    }
    console.log(
      JSON.stringify(
        { mode: 'run', scenario, strategyId: saved.id, strategyVersionId, prepared, job },
        null,
        2,
      ),
    );
  } finally {
    const current = await api('/api/market-data/policy');
    const unchanged = desired.every(
      (route) =>
        JSON.stringify(
          current.routes.find((item) => routeKey(item.key) === routeKey(route.key))?.targets,
        ) === JSON.stringify(route.targets),
    );
    if (unchanged) {
      const restored = [
        ...current.routes.filter((route) => !desiredKeys.has(routeKey(route.key))),
        ...original.routes.filter((route) => desiredKeys.has(routeKey(route.key))),
      ];
      await api(
        '/api/market-data/policy',
        {
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: randomUUID(),
          revision: current.revision + 1,
          enabled: current.enabled,
          routes: restored,
        },
        'PUT',
      );
      console.error(
        JSON.stringify({ stage: 'original-routes-restored', revision: current.revision + 1 }),
      );
    } else
      console.error(
        JSON.stringify({ stage: 'restore-skipped', reason: '其他操作已修改目标路由，保留现态' }),
      );
  }
}
