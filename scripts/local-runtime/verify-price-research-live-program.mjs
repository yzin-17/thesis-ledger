import { PrismaClient } from '@prisma/client';
import {
  projectPriceResearchStrategy,
  backtestRunPreparationRequestV3Schema,
} from '@thesis-ledger/schemas';
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import { MarketBarWindowReaderV3 } from '/app/apps/server/dist/src/market/market-bar-reader-v3.js';
import { MarketWindowEvidenceV3Repository } from '/app/apps/server/dist/src/market/market-window-evidence-v3.repository.js';
import { marketPolicyCatalogResponse } from '/app/apps/server/dist/src/market/market-policy-catalog.js';
import { strategyResearchExecutionModel } from '/app/apps/server/dist/src/backtest/backtest-strategy-research-model.js';
import { prepareBacktestRunConfigV3 } from '/app/apps/server/dist/src/backtest/backtest-run-preparation.js';

const prisma = new PrismaClient();
const tables = [
  'Strategy',
  'StrategyVersion',
  'BacktestJob',
  'Account',
  'LedgerEvent',
  'DesiredProviderPolicy',
  'DesiredProviderPolicyRevision',
];
async function witness() {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const [row] = await prisma.$queryRawUnsafe(
          `SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS hash FROM "${table}" t`,
        );
        return [table, row];
      }),
    ),
  );
}
try {
  const before = await witness();
  const stored = await prisma.desiredProviderPolicy.findUnique({
    where: { consumer: 'thesis-ledger' },
    include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
  });
  if (!stored || stored.syncState !== 'applied')
    throw Error('当前路由不是已应用状态，停止只读核验');
  const policy = marketPolicyCatalogResponse(stored);
  const control = { getPolicy: () => Promise.resolve(policy) };
  const dsa = new DsaClient();
  const windowReader = new MarketBarWindowReaderV3(
    control,
    dsa,
    new MarketWindowEvidenceV3Repository(prisma),
  );
  const cases = [];
  for (const [symbol, assetType] of [
    ['510300.SH', 'etf'],
    ['600519.SH', 'stock'],
  ]) {
    const now = new Date().toISOString(),
      startDate = '2026-10-10',
      endDate = '2026-11-10';
    const instrument = { symbol, market: 'CN', assetType };
    const strategy = projectPriceResearchStrategy({
      schemaVersion: '2',
      name: '只读收益研究核验',
      executionInstrument: instrument,
      primaryTimeframe: '1d',
      signalSources: [
        { id: 'price', asset: instrument, timeframe: '1d', series: ['open', 'close'] },
      ],
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'price', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      exit: { type: 'positionState', field: 'isOpen' },
      sizing: { type: 'fixedQuantity', quantity: '100' },
      risk: [],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0.0003', slippageRate: '0.001' },
    });
    const model = strategyResearchExecutionModel(
      {
        strategyVersionId: 'readonly-price-research',
        startDate,
        endDate,
        currency: 'CNY',
        adjustment: 'hfq',
        policy: 'research-defaults',
      },
      strategy,
      now,
    ).model;
    const request = backtestRunPreparationRequestV3Schema.parse({
      contractVersion: 1,
      requestId: 'readonly-price-research',
      strategyVersionId: '11111111-1111-4111-8111-111111111111',
      priceResearch: 'price-research-v1',
      adjustment: 'hfq',
      accountingBasis: 'normalized-series',
      history: { basis: 'fixed-provider-snapshot' },
      freezeTimePolicy: 'after-acquisition',
      runConfig: {
        startDate,
        endDate,
        dataAsOf: now,
        baseCurrency: 'CNY',
        initialCash: { CNY: '100000' },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
        executionModel: model,
      },
    });
    const reads = [];
    const reader = {
      readV3: async (input) => {
        const read = await windowReader.read(input);
        reads.push({
          adjustment: input.routeKey.adjustment,
          status: read.status,
          ...(read.status === 'selected'
            ? {
                provenance: read.selection.response.provenance,
                bars: read.selection.response.bars.length,
                listing: read.selection.response.coverageProof.listing,
              }
            : { selection: read.selection }),
        });
        return read;
      },
    };
    const result = await prepareBacktestRunConfigV3({
      request,
      strategy,
      reader,
      control,
      checkedAt: now,
    });
    cases.push({
      symbol,
      startDate,
      endDate,
      status: result.status,
      reads,
      ...(result.status === 'prepared'
        ? {
            research: result.runConfig.priceResearch,
            executionWindow: result.runConfig.frozenExecutionWindow,
          }
        : { diagnostics: result.diagnostics }),
    });
  }
  const businessStateUnchanged = JSON.stringify(await witness()) === JSON.stringify(before);
  console.log(
    'PRICE_RESEARCH_LIVE_RECEIPT=' +
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        policyRevision: policy.revision,
        businessStateUnchanged,
        persistedResearchVersions: 0,
        createdBacktestJobs: 0,
        cases,
      }),
  );
  if (!businessStateUnchanged || cases.some((item) => item.status !== 'prepared'))
    process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
