import { readFileSync } from 'node:fs';
import { runConfigSchemaV3, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { freezeTradePlanFixture } from './trade-plan-snapshot.fixture.js';
import { dailyPolicy } from './daily-order-worker.fixture.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';

/** 独立原价规则研究样本；不宣称公司行动或真实来源资格。 */
export async function dailyOrderRawSnapshot(root: string) {
  return freezeTradePlanFixture(root, await dailyOrderRawInput());
}

export async function dailyOrderRawInput(scenario?: {
  end: string;
  prices: (date: string) => { open: number; high: number; low: number; close: number };
}) {
  const f = await completeSnapshotFixture('stock');
  const protocol = JSON.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/execution-price.raw-events.json', import.meta.url), 'utf8'));
  const end = scenario?.end ?? f.input.runConfig.endDate;
  protocol.priceBasis.observedAt = end + 'T07:02:00.000Z';
  f.input.runConfig.endDate = end;
  f.input.runConfig.dataAsOf = new Date(Date.parse(end) + 86400000).toISOString();
  f.input.runConfig.executionModel!.scope.range.end = end;
  protocol.history = { basis: 'fixed-provider-snapshot' };
  if (!scenario) protocol.marketRuleResearch = 'raw-prices-no-corporate-actions-v1';
  for (const segment of f.input.runConfig.executionModel!.segments) {
    segment.range.end = end;
    if (segment.execution.mode === 'exchange') delete segment.execution.normalizedExecution;
  }
  f.input.runConfig = runConfigSchemaV3.parse({ ...f.input.runConfig, executionPriceProtocol: protocol, dailyOrderMatching: { ...dailyPolicy, liquidity: { kind: 'perBarCap', quantity: '1000' } } });
  f.input.executionRouteKey.adjustment = 'none';
  f.input.runConfig.priceInputBindings!.signals = [];
  const s = f.input.strategy;
  s.schemaVersion = 'strategy-definition-v1';
  s.signalSources = s.signalSources.map(source => ({ ...source, priceCoordinate: 'run', series: ['open', 'high', 'low', 'close'] }));
  s.entry = { type: 'compare', operator: 'gt', left: { type: 'constant', value: '1' }, right: { type: 'constant', value: '0' } };
  s.exit = { type: 'compare', operator: 'gt', left: { type: 'constant', value: '0' }, right: { type: 'constant', value: '1' } };
  s.sizing = { type: 'fixedQuantity', quantity: '2700' };
  s.risk = [];
  s.execution = { mode: 'exchange', timing: 'dailyBarOrders', orders: [
    { id: 'buy', action: { kind: 'entry' }, order: { kind: 'market' }, validity: { kind: 'bars', bars: 3 } },
    { id: 'exit', action: { kind: 'exit' }, order: { kind: 'market' }, validity: { kind: 'DAY' } },
    { id: 'stop', action: { kind: 'stopLoss' }, order: { kind: 'stopMarket', price: { type: 'constant', value: '9.7' } }, validity: { kind: 'position' }, parent: { templateId: 'buy', activation: 'eachFill' } },
  ] };
  f.input.strategy = strategySchema.parse(s) as BacktestStrategy;
  f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
  const original = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async request => {
    const result = await original({ ...request, routeKey: { ...request.routeKey, adjustment: 'qfq' } });
    if (result.status !== 'selected') throw new Error('fixture');
    const response = result.selection.response;
    if (scenario) {
      result.selection.effectivePolicyRevision = result.selection.desiredRevision;
      response.provenance.effectivePolicyRevision = result.selection.desiredRevision;
      result.evidence.effectivePolicyRevision = result.selection.desiredRevision;
    }
    result.request.routeKey = request.routeKey;
    response.routeKey = request.routeKey;
    result.evidence.routeKey = request.routeKey;
    const { quantityBasis, ...sourceBasis } = f.input.runConfig.executionPriceProtocol.priceBasis;
    void quantityBasis;
    response.sourcePriceBasis = sourceBasis;
    for (const bar of response.bars) {
      if (bar.volume === null) throw new Error('独立样本缺少成交量');
      const prices = scenario?.prices(bar.timestamp.slice(0, 10)) ?? { open: 10, high: 10.5, low: 9.5, close: 10 };
      Object.assign(bar, prices, { amount: bar.volume * prices.close, availableAt: response.sourcePriceBasis.observedAt });
    }
    if (request.tradabilityMode) response.historicalTradabilityWindows = [tradabilityFixtureV3(tradabilityWindowFromResponseV3(response))];
    result.evidence.sourcePriceBasis = response.sourcePriceBasis;
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
    return result;
  });
  const facts = f.dsa.backtestInstrumentFacts.getMockImplementation()!;
  f.dsa.backtestInstrumentFacts.mockImplementation(async request => {
    const result = await facts({ ...request, barAdjustment: 'qfq' });
    return result;
  });
  return f;
}
