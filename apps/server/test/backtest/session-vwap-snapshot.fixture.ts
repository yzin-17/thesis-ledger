import { marketDataBarSeriesResponseV3Schema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { freezeTradePlanFixture } from './trade-plan-snapshot.fixture.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';

export function fixedSessionPlan(cumulative: boolean): BacktestStrategy {
  const sourceId = 'execution';
  const price = { type: 'series' as const, sourceId, field: 'close' as const };
  return {
    schemaVersion: 'strategy-definition-v1',
    name: cumulative ? '当日累计均价' : '滚动二十根均价',
    executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
    primaryTimeframe: '1m',
    signalSources: [
      {
        id: sourceId,
        priceCoordinate: 'run',
        asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
        timeframe: '1m',
        series: ['close', 'volume'],
      },
    ],
    entry: {
      type: 'all',
      conditions: [
        {
          type: 'compare',
          operator: 'gt',
          left: price,
          right: cumulative
            ? { type: 'sessionValue', sourceId, field: 'vwap' }
            : { type: 'indicator', name: 'VWAP', input: price, params: { period: 20 } },
        },
        {
          type: 'compare',
          operator: 'lte',
          left: { type: 'sessionValue', sourceId, field: 'elapsedMinutes' },
          right: { type: 'constant', value: '60' },
        },
        // 固定样本只在第31分钟允许发信号，避免更早价格掩盖两种统计差异。
        {
          type: 'compare',
          operator: 'eq',
          left: { type: 'sessionValue', sourceId, field: 'elapsedMinutes' },
          right: { type: 'constant', value: '31' },
        },
        { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
      ],
    },
    exit: {
      type: 'compare',
      operator: 'eq',
      left: { type: 'constant', value: '0' },
      right: { type: 'constant', value: '1' },
    },
    sizing: { type: 'percentOfEquity', percent: '0.25' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
  };
}

/** 独立模拟日历与一分钟行情，声明标签和量价坐标；冻结后禁止读取适配器。 */
export async function sessionVwapInput(
  strategy = fixedSessionPlan(true),
  pricesByCompletedMinute: Readonly<Record<number, number>> = {},
) {
  const fixture = await completeSnapshotFixture();
  fixture.input.strategy = strategy;
  const research =
    strategy.signalSources.every((source) => source.priceCoordinate === 'research');
  if (research) {
    fixture.input.runConfig.executionPriceProtocol.priceBasis.adjustment = 'hfq';
    const facts = fixture.dsa.backtestInstrumentFacts.getMockImplementation()!;
    fixture.dsa.backtestInstrumentFacts.mockImplementation((request) =>
      facts({ ...request, barAdjustment: 'qfq' }),
    );
  }
  fixture.input.runConfig.priceInputBindings!.signals = collectUsedSignalSources(strategy).map(
    (source) => ({ sourceId: source.id, binding: 'execution-series' as const }),
  );
  fixture.input.strategyVersionHash = hashCanonicalManifest(strategy);
  fixture.input.executionRouteKey = {
    ...fixture.input.executionRouteKey,
    capability: 'MINUTE_BAR',
    timeframe: '1m',
    adjustment: fixture.input.runConfig.executionPriceProtocol.priceBasis.adjustment,
  };
  // 此模拟供应商明确声明量随拆分调整；不代表真实供应商已具备此证明。
  fixture.input.runConfig.executionPriceProtocol.priceBasis.volumeBasis = 'split-adjusted';
  const original = fixture.reader.readV3.getMockImplementation()!;
  fixture.reader.readV3.mockImplementation(async (request) => {
    const { tradabilityMode, ...baseRequest } = request;
    const result = await original(
      research
        ? { ...baseRequest, routeKey: { ...baseRequest.routeKey, adjustment: 'qfq' } }
        : baseRequest,
    );
    if (result.status !== 'selected') return result;
    if (tradabilityMode) result.request.tradabilityMode = tradabilityMode;
    const response = result.selection.response;
    if (research) {
      result.request.routeKey = request.routeKey;
      response.routeKey = request.routeKey;
      response.sourcePriceBasis.adjustment = request.routeKey.adjustment;
      result.evidence.routeKey = request.routeKey;
    }
    const dates = response.bars.map((bar) => bar.timestamp.slice(0, 10));
    response.timestampConvention = 'interval-start';
    response.sourcePriceBasis.volumeBasis = 'split-adjusted';
    response.bars = dates.flatMap((date) =>
      Array.from({ length: 240 }, (_, index) => {
        const offset = index < 120 ? index : index + 90;
        const at = Date.parse(`${date}T01:30:00Z`) + offset * 60000;
        let close = 140;
        if (index < 20) close = 100;
        else if (index < 30) close = 200;
        close = pricesByCompletedMinute[index + 1] ?? close;
        return {
          timestamp: new Date(at).toISOString(),
          availableAt: new Date(at + 60000).toISOString(),
          completionStatus: 'complete' as const,
          open: close,
          high: close,
          low: close,
          close,
          volume: 1000,
          amount: 1000 * close,
        };
      }),
    );
    response.coverage.actualStart = response.bars[0]!.timestamp;
    response.coverage.actualEnd = response.bars.at(-1)!.timestamp;
    marketDataBarSeriesResponseV3Schema.parse(response);
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
    result.evidence.sourcePriceBasis = response.sourcePriceBasis;
    const proof = tradabilityFixtureV3(tradabilityWindowFromResponseV3(response));
    proof.barSource.routeKey.capability = 'MINUTE_BAR';
    proof.barSource.routeKey.timeframe = '1m';
    response.historicalTradabilityWindows = [proof];
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
    return result;
  });
  return fixture;
}

export async function sessionVwapSnapshot(
  root: string,
  strategy = fixedSessionPlan(true),
  pricesByCompletedMinute: Readonly<Record<number, number>> = {},
) {
  return freezeTradePlanFixture(root, await sessionVwapInput(strategy, pricesByCompletedMinute));
}
