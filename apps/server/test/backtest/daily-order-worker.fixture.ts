import { strategySchema, type BacktestStrategy, type RunConfigV3 } from '@thesis-ledger/schemas';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';

export const dailyPolicy: NonNullable<RunConfigV3['dailyOrderMatching']> = {
  conflict: 'stopFirst',
  childActivation: 'openSameBarRangeNextBar',
  partialExit: 'protectRemaining',
  liquidity: { kind: 'perBarCap', quantity: '100' },
};
export async function dailyOrderStrategy(protection = false): Promise<BacktestStrategy> {
  const strategy = (await completeSnapshotFixture()).input.strategy;
  strategy.schemaVersion = 'strategy-definition-v1';
  strategy.signalSources = strategy.signalSources.map((source) => ({
    ...source,
    priceCoordinate: 'run',
  }));
  strategy.entry = {
    type: 'compare',
    operator: 'gt',
    left: { type: 'constant', value: '1' },
    right: { type: 'constant', value: '0' },
  };
  strategy.exit = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  };
  strategy.risk = [];
  delete strategy.tradePlan;
  strategy.signalSources[0]!.series = ['open', 'high', 'low', 'close'];
  strategy.execution = {
    mode: 'exchange',
    timing: 'dailyBarOrders',
    orders: [
      {
        id: 'buy',
        action: { kind: 'entry' },
        order: { kind: 'limit', price: { type: 'series', sourceId: 'execution', field: 'low' } },
        validity: { kind: 'bars', bars: 2 },
      },
      {
        id: 'exit',
        action: { kind: 'exit' },
        order: { kind: 'market' },
        validity: { kind: 'DAY' },
      },
      ...(protection
        ? [
            {
              id: 'stop',
              action: { kind: 'stopLoss' as const },
              order: {
                kind: 'stopMarket' as const,
                price: { type: 'constant' as const, value: '9' },
              },
              validity: { kind: 'position' as const },
              parent: { templateId: 'buy', activation: 'eachFill' as const },
              exitGroup: 'protect',
            },
            {
              id: 'profit',
              action: { kind: 'takeProfit' as const },
              order: { kind: 'limit' as const, price: { type: 'constant' as const, value: '12' } },
              validity: { kind: 'position' as const },
              parent: { templateId: 'buy', activation: 'eachFill' as const },
              exitGroup: 'protect',
            },
          ]
        : []),
    ],
  };
  return strategySchema.parse(strategy) as BacktestStrategy;
}
export async function dailyOrderSnapshot(
  root: string,
  protection = false,
  saved?: BacktestStrategy,
) {
  return tradePlanSnapshot(root, saved ?? (await dailyOrderStrategy(protection)), {
    dates: ['2026-05-18', '2026-05-19', '2026-05-20'],
    closes: [10, 10, 10],
    opens: protection ? [10, 10, 8.5] : [10, 10, 10],
    intrabarRange: 0.5,
    dailyOrderMatching: dailyPolicy,
  });
}
