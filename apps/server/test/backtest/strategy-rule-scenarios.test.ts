import { expect, it } from 'vitest';
import {
  evaluateBooleanExpression,
  type BooleanExpression as B,
  type NumericExpression as N,
  type BacktestSeriesPoint,
} from '@thesis-ledger/domain';
import { projectPriceResearchStrategy } from '@thesis-ledger/schemas';
import {
  constant as c,
  series as s,
  definition,
  inputPoints,
  context,
} from './numeric-expression.fixtures.js';

const op = (operator: 'add' | 'subtract' | 'multiply' | 'divide', left: N, right: N): N => ({
  type: 'arithmetic',
  operator,
  left,
  right,
});
const cmp = (left: N, operator: 'gt' | 'gte' | 'lt' | 'lte', right: N): B => ({
  type: 'compare',
  left,
  operator,
  right,
});
const lag = (input: N, periods = 1): N => ({ type: 'lag', periods, input });
const indicator = (name: 'MA' | 'RSI', period: number, input: N = s('close')): N => ({
  type: 'indicator',
  name,
  input,
  params: { period },
});
const values = (items: number[]): BacktestSeriesPoint[] =>
  inputPoints(items.length).map((point, index) => ({ ...point, value: String(items[index]!) }));
const run = (entry: B, closes: number[], overrides: Parameters<typeof context>[3] = {}) => {
  expect(definition(entry).entry).toEqual(entry);
  const points = values(closes);
  return evaluateBooleanExpression(
    entry,
    context(entry, points, String(closes.at(-1)), { close: points, ...overrides }),
  );
};

it('R10 前 20 日均量排除今日，严格 1.5 倍与收阳独立满足', () => {
  const entry: B = {
    type: 'all',
    conditions: [
      cmp(s('volume'), 'gt', op('multiply', lag(indicator('MA', 20, s('volume'))), c('1.5'))),
      cmp(s('close'), 'gt', s('open')),
    ],
  };
  const closes = Array(20).fill(100).concat(105);
  expect(
    run(entry, closes, {
      open: values(Array(21).fill(100)),
      volume: values(Array(20).fill(100).concat(150)),
    }),
  ).toMatchObject({ value: false });
  expect(
    run(entry, closes, {
      open: values(Array(21).fill(100)),
      volume: values(Array(20).fill(100).concat(151)),
    }),
  ).toMatchObject({ value: true });
});

it('R14 20 根涨幅和昨收跳空各自计算；比例条件的研究投影不误转实际价格', () => {
  const returns = op('subtract', op('divide', s('close'), lag(s('close'), 20)), c('1'));
  const gap: N = {
    type: 'absolute',
    input: op('subtract', op('divide', s('open'), lag(s('close'))), c('1')),
  };
  const entry: B = {
    type: 'all',
    conditions: [cmp(returns, 'gt', c('0.05')), cmp(gap, 'lt', c('0.02'))],
  };
  const closes = Array(19).fill(100).concat(105, 106);
  expect(run(entry, closes, { open: values(Array(20).fill(100).concat(106)) })).toMatchObject({
    value: true,
  });
  expect(run(entry, closes, { open: values(Array(20).fill(100).concat(108)) })).toMatchObject({
    value: false,
  });
  const research = {
    ...definition(entry),
    signalSources: definition(entry).signalSources.map((source) => ({
      ...source,
      priceCoordinate: 'research' as const,
    })),
  };
  expect(
    projectPriceResearchStrategy(research).signalSources.every(
      (source) => source.priceCoordinate === 'research',
    ),
  ).toBe(true);
});

it('R15 收缩后突破布林上轨，收缩窗口先于突破且使用分位与总体标准差', () => {
  const mean = indicator('MA', 20);
  const std: N = {
    type: 'rolling',
    statistic: 'standardDeviation',
    periods: 20,
    ddof: 0,
    input: s('close'),
  };
  const upper = op('add', mean, op('multiply', std, c('2')));
  const bandwidth = op('divide', op('multiply', std, c('4')), mean);
  const lowQuantile: N = {
    type: 'rolling',
    statistic: 'quantile',
    periods: 60,
    quantile: '0.2',
    input: bandwidth,
  };
  const entry: B = {
    type: 'sequence',
    trigger: cmp(bandwidth, 'lte', lowQuantile),
    confirm: { type: 'cross', direction: 'above', left: s('close'), right: upper },
    invalidation: cmp(s('close'), 'lt', c('0')),
    within: 5,
    allowSameBar: false,
    repeat: true,
  };
  expect(run(entry, Array(100).fill(100).concat(110))).toMatchObject({
    status: 'available',
    value: true,
  });
  expect(run(entry, Array(101).fill(100))).toMatchObject({ value: false });
});

it('R16 RSI 先低于 30 再上穿，跌破 20 的开始已失效', () => {
  const rsi = indicator('RSI', 2);
  const entry: B = {
    type: 'sequence',
    trigger: cmp(rsi, 'lt', c('30')),
    confirm: { type: 'cross', direction: 'above', left: rsi, right: c('30') },
    invalidation: cmp(rsi, 'lt', c('20')),
    within: 5,
    allowSameBar: false,
    repeat: true,
  };
  expect(run(entry, [100, 101, 98, 99])).toMatchObject({ value: true });
  expect(run(entry, [100, 101, 95, 96])).toMatchObject({ value: false });
});

it('R17 回踩使用冻结突破价 100，不被突破后的新最高 110 替换', () => {
  const previous: N = lag({
    type: 'indicator',
    name: 'Highest',
    input: s('high'),
    params: { period: 20 },
  });
  const frozen: N = { type: 'eventValue' };
  const entry: B = {
    type: 'sequence',
    trigger: cmp(s('close'), 'gt', previous),
    capture: previous,
    confirm: {
      type: 'all',
      conditions: [cmp(s('low'), 'lte', frozen), cmp(s('close'), 'gt', frozen)],
    },
    invalidation: cmp(s('low'), 'lt', op('multiply', frozen, c('0.98'))),
    within: 10,
    allowSameBar: false,
    repeat: true,
  };
  const closes = Array(30).fill(99).concat(105, 101);
  const high = values(Array(30).fill(100).concat(110, 103));
  expect(run(entry, closes, { high, low: values(Array(32).fill(99)) })).toMatchObject({
    value: true,
  });
  expect(run(entry, closes, { high, low: values(Array(31).fill(99).concat(97)) })).toMatchObject({
    value: false,
  });
});

it('R18 短均线连续上升两期与长均线正差分均用各自历史值', () => {
  const short = indicator('MA', 2),
    long = indicator('MA', 3);
  const entry: B = {
    type: 'all',
    conditions: [
      cmp(short, 'gt', lag(short)),
      cmp(lag(short), 'gt', lag(short, 2)),
      cmp(long, 'gt', lag(long)),
    ],
  };
  expect(run(entry, [1, 2, 3, 4, 5])).toMatchObject({ value: true });
  expect(run(entry, [1, 2, 3, 4, 1])).toMatchObject({ value: false });
});

it('R19 ADX14 与两方向分量在正式 OHLC 消费路径按不同输出比较', () => {
  const adx = (output: 'adx' | 'plusDI' | 'minusDI'): N => ({
    type: 'indicator',
    name: 'ADX',
    params: { period: 14 },
    output,
    input: s('close'),
  });
  const entry: B = {
    type: 'all',
    conditions: [cmp(adx('adx'), 'gt', c('25')), cmp(adx('plusDI'), 'gt', adx('minusDI'))],
  };
  const closes = Array.from({ length: 40 }, (_, n) => 100 + n);
  expect(
    run(entry, closes, {
      high: values(closes.map((n) => n + 1)),
      low: values(closes.map((n) => n - 1)),
    }),
  ).toMatchObject({ value: true });
});

it('R20 两个低点的价格与 RSI 背离只在第二个右侧确认完成后可用', () => {
  const pivot = (offset: 0 | 1, sample?: N): N => ({
    type: 'confirmedPivot',
    side: 'low',
    leftBars: 2,
    rightBars: 2,
    offset,
    input: { type: 'series', sourceId: 'primary', field: 'low' },
    ...(sample ? { sample } : {}),
  });
  const entry: B = {
    type: 'all',
    conditions: [
      cmp(pivot(0), 'lt', pivot(1)),
      cmp(pivot(0, indicator('RSI', 2)), 'gt', pivot(1, indicator('RSI', 2))),
    ],
  };
  const closes = [5, 4, 2, 4, 5, 3, 1, 4, 5];
  expect(run(entry, closes, { low: values(closes) })).toMatchObject({
    status: 'available',
    value: true,
  });
  expect(run(entry, closes.slice(0, -1), { low: values(closes.slice(0, -1)) }).status).toBe(
    'unavailable',
  );
});
