import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';

export const protectionDates = [
  '2026-05-18',
  '2026-05-19',
  '2026-05-20',
  '2026-05-21',
  '2026-05-22',
  '2026-05-25',
  '2026-05-26',
  '2026-05-27',
  '2026-05-28',
];
export async function protectionStrategy(
  kind: 'frozen-atr' | 'current-atr' | 'unconditional-stop' | 'armed-stop',
) {
  const { input } = await completeSnapshotFixture();
  const s = input.strategy;
  s.entry = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
  s.exit = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  };
  s.risk = [];
  s.signalSources[0]!.series = ['high', 'low', 'close'];
  const sourceId = s.signalSources[0]!.id;
  const plan: NonNullable<BacktestStrategy['tradePlan']> = {
    version: 1,
    evaluation: 'barClose',
    stages: [],
    cooldown: { bars: 10, stopBars: 10 },
  };
  if (kind === 'frozen-atr')
    plan.initialStop = { kind: 'entryAtr', sourceId, period: 2, multiple: '2' };
  else if (kind === 'current-atr')
    plan.trailing = { kind: 'currentAtr', sourceId, period: 2, multiple: '2' };
  else {
    plan.initialStop = { kind: 'percent', percent: '0.05' };
    if (kind === 'armed-stop')
      plan.initialStop.activation = { kind: 'condition', condition: {
        type: 'cross',
        direction: 'above',
        left: {
          type: 'indicator',
          name: 'RSI',
          input: { type: 'series', sourceId, field: 'close' },
          params: { period: 2 },
        },
        right: { type: 'constant', value: '60' },
      } };
  }
  s.tradePlan = plan;
  return strategySchema.parse(s) as BacktestStrategy;
}

export async function protectionSnapshot(
  root: string,
  kind: Parameters<typeof protectionStrategy>[0],
  strategy?: BacktestStrategy,
) {
  return tradePlanSnapshot(root, strategy ?? (await protectionStrategy(kind)), {
    dates: protectionDates,
    closes: kind.endsWith('atr')
      ? [10, 10, 12, 12, 11, 9, 9, 7, 7]
      : [10, 10, 9, 12, 11, 9, 9, 9, 9],
    intrabarRange: 0.5,
  });
}
