import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import type { BacktestStrategy, RunConfigV3 } from '@thesis-ledger/schemas';
import { calendarDependencyRequests } from '../../src/backtest/backtest-settlement-calendar.js';
import { readSnapshotDependencyV3 } from '../../src/backtest/backtest-snapshot-v3-dependency-collector.js';
import { planSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-input-plan.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { readAdditionalSignalPricesV3 } from '../../src/backtest/backtest-signal-price-inputs-v3.js';
import { planBacktestPriceInputs } from '../../src/backtest/backtest-dependency-price.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { sessionVwapInput } from './session-vwap-snapshot.fixture.js';

export async function multitimeframeFixture(primaryTimeframe: '1d' | '60m' = '1d') {
  const f = await completeSnapshotFixture();
  const strategy = f.input.strategy;
  strategy.schemaVersion = 'strategy-definition-v1';
  strategy.primaryTimeframe = primaryTimeframe;
  if (primaryTimeframe === '60m') {
    f.input.executionRouteKey.capability = 'MINUTE_BAR';
    f.input.executionRouteKey.timeframe = '1m';
  }
  strategy.signalSources = [
    {
      ...strategy.signalSources[0]!,
      id: 'execution',
      priceCoordinate: 'run',
      timeframe: primaryTimeframe,
      series: ['close'],
    },
    {
      ...strategy.signalSources[0]!,
      id: 'hourly',
      priceCoordinate: 'run',
      timeframe: primaryTimeframe === '1d' ? '60m' : '1d',
      series: ['close'],
    },
  ];
  const rising = (sourceId: string) => ({
    type: 'compare' as const,
    operator: 'gt' as const,
    left: { type: 'series' as const, sourceId, field: 'close' as const },
    right: {
      type: 'lag' as const,
      periods: 1,
      input: { type: 'series' as const, sourceId, field: 'close' as const },
    },
  });
  strategy.entry = { type: 'all', conditions: [rising('execution'), rising('hourly')] };
  strategy.exit = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  };
  strategy.sizing = { type: 'percentOfEquity', percent: '0.2' };
  strategy.risk = [];
  f.input.strategyVersionHash = hashCanonicalManifest(strategy);
  f.input.runConfig.priceInputBindings!.signals = strategy.signalSources.map((source) => ({
    sourceId: source.id,
    binding: 'execution-series',
  }));
  f.input.runConfig.executionPriceProtocol.priceBasis.volumeBasis = 'split-adjusted';
  const minutes = await sessionVwapInput(strategy as BacktestStrategy);
  const daily = f.reader.readV3.getMockImplementation()!,
    minute = minutes.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (request) => {
    const intraday = request.routeKey.timeframe === '1m';
    const selectedRequest =
      request.routeKey.adjustment === 'hfq'
        ? { ...request, routeKey: { ...request.routeKey, adjustment: 'qfq' as const } }
        : request;
    const result = await (intraday ? minute(selectedRequest) : daily(selectedRequest));
    if (result.status !== 'selected') return result;
    const response = result.selection.response;
    result.request.routeKey = request.routeKey;
    response.routeKey = request.routeKey;
    response.sourcePriceBasis.adjustment = request.routeKey.adjustment;
    result.evidence.routeKey = request.routeKey;
    response.sourcePriceBasis.volumeBasis = 'split-adjusted';
    response.bars = response.bars.map((bar, index) => {
      const day = intraday ? Math.floor(index / 240) : index;
      const base = 1 + day / 1000;
      const close = base + (intraday ? Math.floor((index % 240) / 60) / 10000 : 0.0003);
      return {
        ...bar,
        open: base,
        high: base + 0.001,
        low: base - 0.001,
        close,
        volume: intraday ? 1000 : 240000,
        amount: close * (intraday ? 1000 : 240000),
      };
    });
    const proof = tradabilityFixtureV3(
      tradabilityWindowFromResponseV3(response),
      request.dailyObservationContract,
    );
    proof.barSource.routeKey.capability = request.routeKey.capability;
    proof.barSource.routeKey.timeframe = intraday ? '1m' : '1d';
    response.historicalTradabilityWindows = [proof];
    result.evidence.sourcePriceBasis = response.sourcePriceBasis;
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
    if (request.frozenWindowRef) result.frozenWindowRef = request.frozenWindowRef;
    return result;
  });
  const plan = planBacktestPriceInputs(strategy, f.input.runConfig);
  const extra = await readAdditionalSignalPricesV3({
    strategy,
    runConfig: f.input.runConfig,
    reader: f.reader,
    warmupStart: plan.warmup.startDate,
    requireFrozen: false,
  });
  f.input.runConfig.signalPriceWindows = extra.map((item) => ({
    artifactKey: item.plan.artifactKey,
    frozenWindowRef: item.frozenWindowRef,
  }));
  return { ...f, researchCalendar: async (definition: BacktestStrategy, runConfig: RunConfigV3, plan = planSnapshotInputsV3({ strategy: definition, runConfig }).plan) => {
    const input = { strategy: definition, runConfig, plan };
    const requests = calendarDependencyRequests(input, (message): never => { throw new Error(message); });
    const calendars = await Promise.all(requests.map((request) => readSnapshotDependencyV3(input, request, f.dsa as never)));
    return calendars.flatMap((calendar) => calendar.rows);
  } };
}
