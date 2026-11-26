import { expect, it } from 'vitest';
import { backtestStrategyPlanReadback } from '../src/index.js';
import { describeBacktestExpression } from '../src/backtest-expression-display.js';

function configuration(market: string, anchorAt: string) {
  return {
    entry: {
      type: 'compare', operator: 'gt',
      left: { type: 'cumulative', statistic: 'sum', anchorAt,
        input: { type: 'series', sourceId: 'daily', field: 'volume' } },
      right: { type: 'constant', value: '0' },
    },
    exit: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
    sizing: { type: 'percentOfEquity', percent: '0.2' }, risk: [],
    signalSources: [{ id: 'daily', asset: { symbol: 'sample', market, assetType: 'stock' } }],
  } satisfies Parameters<typeof backtestStrategyPlanReadback>[0];
}

it.each([
  ['CN', '2026-03-02T15:00:00+08:00', '2026/3/2 15:00:00（Asia/Shanghai）'],
  ['HK', '2026-03-02T16:00:00+08:00', '2026/3/2 16:00:00（Asia/Hong_Kong）'],
  ['US', '2026-01-02T21:00:00Z', '2026/1/2 16:00:00（America/New_York）'],
  ['US', '2026-07-02T20:00:00Z', '2026/7/2 16:00:00（America/New_York）'],
  ['unknown', '2026-03-02T15:00:00+08:00', '2026/3/2 07:00:00（UTC）'],
])('累计锚点按来源市场回读且保留原始时点：%s %s', (market, anchorAt, expected) => {
  const strategy = configuration(market, anchorAt);
  const before = structuredClone(strategy);
  expect(backtestStrategyPlanReadback(strategy)[0]).toContain(expected);
  expect(strategy).toEqual(before);
});

it('嵌套累计值继承来源时区，无来源上下文时明确使用UTC', () => {
  const entry = configuration('CN', '2026-03-02T15:00:00+08:00').entry;
  const strategy = { ...configuration('CN', entry.left.anchorAt), entry: {
    ...entry, left: { type: 'absolute' as const, input: entry.left },
  } };
  expect(backtestStrategyPlanReadback(strategy)[0]).toContain('15:00:00（Asia/Shanghai）');
  expect(describeBacktestExpression(strategy.entry, new Map())).toContain('07:00:00（UTC）');
});

it('算术中的会话指标也显示缺量与可见时点说明', () => {
  const strategy = configuration('CN', '2026-03-02T15:00:00+08:00');
  const entry = { ...strategy.entry, left: {
    type: 'absolute' as const,
    input: { type: 'sessionValue' as const, sourceId: 'daily', field: 'vwap' as const },
  } };
  expect(backtestStrategyPlanReadback({ ...strategy, entry }).join('\n')).toContain('累计均价缺量');
});
