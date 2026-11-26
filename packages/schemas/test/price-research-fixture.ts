import {
  backtestResultSchemaV3,
  projectPriceResearchStrategy,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import definition from '../fixtures/backtest-v2.exchange.json';
import manifest from '../fixtures/backtest-snapshot-v3.manifest.json';
import preset from '../fixtures/backtest-execution-model.cn-2024q1.json';

export const legacyVersion = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  schema: {
    ...definition,
    sizing: { type: 'fixedQuantity', quantity: '100' },
    signalSources: [
      {
        id: 'execution',
        asset: definition.executionInstrument,
        timeframe: '1d',
        series: ['open', 'close'],
      },
    ],
    entry: {
      type: 'compare',
      operator: 'lt',
      left: { type: 'series', sourceId: 'execution', field: 'close' },
      right: { type: 'constant', value: '4' },
    },
  },
};
export const researchVersion = {
  ...legacyVersion,
  id: '44444444-4444-4444-8444-444444444444',
  version: 2,
  schema: projectPriceResearchStrategy(legacyVersion.schema as BacktestStrategy),
};
export const sampleStrategy = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '价格研究样本',
  status: 'active',
  versions: [legacyVersion],
};
export const researchModel = structuredClone(preset);
for (const segment of researchModel.segments) {
  segment.execution.price = { kind: 'noDailyLimit', reason: '受控收益研究样本' } as never;
  Object.assign(segment.execution, {
    normalizedExecution: {
      priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal',
      lotSizeConstraint: 'not-applied',
      tickSizeConstraint: 'not-applied',
      dailyPriceLimit: 'not-applied',
      feeBasis: 'simulatedTurnover',
    },
  });
}
const protocol = {
  ...manifest.executionPriceProtocol,
  priceBasis: {
    ...manifest.executionPriceProtocol.priceBasis,
    adjustment: 'hfq',
    quantityBasis: 'normalized-units',
  },
  accountingBasis: 'normalized-series',
};
export const researchResult = backtestResultSchemaV3.parse({
  source: 'BACKTEST',
  schemaVersion: 'backtest-trade-result-v1',
  snapshotVersion: 'backtest-trade-snapshot-manifest-v1',
  runId: '33333333-3333-4333-8333-333333333333',
  strategyVersionId: researchVersion.id,
  snapshotId: manifest.contentHash,
  contentHash: manifest.contentHash,
  engineVersion: 'controlled',
  marketRuleVersion: 'controlled',
  calendarVersion: 'controlled',
  aggregationVersion: 'controlled',
  resultChecksum: 'controlled',
  completeness: 'complete',
  warnings: [],
  rejectedOrders: [],
  trades: [],
  executionPriceProtocol: protocol,
  comparableDataFingerprint: manifest.comparableDataFingerprint,
  actualSources: manifest.actualSources.map((source) => ({
    ...source,
    routeKey: { ...source.routeKey, adjustment: 'hfq' },
  })),
  priceResearch: {
    protocolVersion: 'price-research-v1',
    fundsBalance: { amount: '600', currency: 'CNY' },
    positionUnits: '50',
    simulatedPnl: { amount: '50', currency: 'CNY' },
  },
  equityCurve: [
    { occurredAt: '2024-01-02T07:00:00Z', value: { amount: '1000', currency: 'CNY' } },
    { occurredAt: '2024-03-29T07:00:00Z', value: { amount: '1050', currency: 'CNY' } },
  ],
  metrics: { totalReturn: { status: 'available', value: '0.05' } },
  simulationFills: [
    {
      fillId: 'sample',
      orderId: 'sample',
      executionSymbol: '600519.SH',
      side: 'buy',
      quantity: '50',
      price: '8',
      charges: [],
      occurredAt: '2024-01-03T01:30:00Z',
      availableAt: '2024-01-03T01:30:00Z',
      reason: 'signal',
      actualReferencePrice: '4',
      researchSizing: { actualPrice: '4', referenceQuantity: '100', requestedNotional: '400' },
    },
  ],
});
export const researchJob = {
  id: researchResult.runId,
  strategyVersionId: researchVersion.id,
  mode: 'frozen',
  status: 'succeeded',
  readEligibility: {
    state: 'readable',
    code: 'READABLE',
    scope: 'none',
    accessedAt: null,
    revealedAt: null,
  },
  result: researchResult,
  input: { runConfig: { baseCurrency: 'CNY', valuationPolicy: { baseTimezone: 'Asia/Shanghai' } } },
};
