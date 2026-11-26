import { expect, it } from 'vitest';
import {
  numericExpressionKey,
  sourceSeriesKey,
  evaluateBooleanExpression,
  type BacktestSeries,
  type BacktestSeriesPoint,
  type BooleanExpression,
  advanceBacktestComputation,
} from '@thesis-ledger/domain';
import { strategySchema, type RunConfigV3, type BacktestStrategy } from '@thesis-ledger/schemas';
import { buildExchangeSessionSeries, exchangeSessionSeriesSteps } from '../../src/backtest/backtest-session-series.js';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';
import { fixedSessionPlan } from './session-vwap-snapshot.fixture.js';

const point = (day: string, minute: number, volume = '10'): BacktestSeriesPoint => {
  const start = Date.parse(day + 'T01:30:00Z') + minute * 60000;
  const openedAt = new Date(start).toISOString(),
    closedAt = new Date(start + 60000).toISOString();
  return {
    openedAt,
    closedAt,
    occurredAt: closedAt,
    availableAt: closedAt,
    value: minute === 0 ? '100' : '120',
    volume,
    status: 'available',
  };
};
const calendar = {
  market: 'CN',
  timezone: 'Asia/Shanghai',
  provider: 'fixture',
  providerRevision: '1',
  availableAt: '2026-01-01T00:00:00Z',
  range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
  sessions: JSON.stringify([
    { startMinute: 570, endMinute: 690 },
    { startMinute: 780, endMinute: 900 },
  ]),
  sessionOverrides: '[]',
  holidays: '[]',
};
const sessionInput = (
  points: BacktestSeriesPoint[],
  ticks = points.map(({ occurredAt, availableAt }) => ({ occurredAt, availableAt })),
) => {
  const source: BacktestSeries = {
    sourceId: 'execution',
    symbol: '159516.SZ',
    market: 'CN',
    assetType: 'etf',
    timeframe: '1m',
    field: 'close',
    adjusted: true,
    points,
  };
  return {
    strategy: fixedSessionPlan(true),
    sourceSeries: new Map([[sourceSeriesKey('execution', 'close'), source]]),
    calendarRows: [calendar],
    ticks,
    runConfig: { executionPriceProtocol: { history: { basis: 'point-in-time' } } } as RunConfigV3,
  };
};
const build = (...input: Parameters<typeof sessionInput>) => buildExchangeSessionSeries(sessionInput(...input)).get(
    numericExpressionKey({ type: 'sessionValue', sourceId: 'execution', field: 'vwap' }),
  )!.points;

it('会话分批构建保留全部状态、值与时点，并可在长CPU阶段停止', async () => {
  const input = sessionInput(Array.from({ length: 120 }, (_, n) => point('2026-05-18', n)));
  const result = await advanceBacktestComputation(exchangeSessionSeriesSteps(input), { signal: new AbortController().signal, batchSize: 32 });
  expect(result).toEqual(buildExchangeSessionSeries(input));
  const points: BacktestSeriesPoint[] = [];
  for (let day = 0; day < 90; day++) {
    const date = new Date(Date.UTC(2026, 4, 18 + day));
    if ([0, 6].includes(date.getUTCDay())) continue;
    for (let minute = 0; minute < 240; minute++) points.push(point(date.toISOString().slice(0, 10), minute + (minute >= 120 ? 90 : 0)));
  }
  const controller = new AbortController();
  let registeredAt = 0;
  const timer = setTimeout(() => { registeredAt = performance.now(); controller.abort(new Error('session-cancelled')); }, 30);
  try {
    await expect(advanceBacktestComputation(exchangeSessionSeriesSteps(sessionInput(points)), { signal: controller.signal })).rejects.toThrow('session-cancelled');
    expect(registeredAt).toBeGreaterThan(0);
    expect(performance.now() - registeredAt).toBeLessThan(5_000);
  } finally { clearTimeout(timer); }
});

it('当前收盘缺失、零量与缺量不回退旧值，次日重新累计', () => {
  const first = point('2026-05-18', 0),
    second = point('2026-05-18', 1, '0');
  const third = point('2026-05-18', 2),
    next = point('2026-05-19', 0);
  const missing = { ...second };
  delete missing.volume;
  const points = build([first, missing, third, next]);
  expect(points.map((value) => value.status)).toEqual([
    'available',
    'unavailable',
    'unavailable',
    'available',
  ]);
  expect(points.at(-1)?.value).toBe('100');
  expect(build([{ ...first, volume: '0' }])[0]?.status).toBe('unavailable');
  const ticks = [first, second, third].map(({ occurredAt, availableAt }) => ({
    occurredAt,
    availableAt,
  }));
  expect(build([first, third], ticks).map((value) => value.status)).toEqual([
    'available',
    'unavailable',
    'unavailable',
  ]);
});

it('迟到事实不提前可见，后续决策可恢复，乱序与重复决策拒绝', () => {
  const first = point('2026-05-18', 0),
    second = point('2026-05-18', 1);
  const points = build([{ ...first, availableAt: second.availableAt }, second]);
  expect(points[0]?.status).toBe('unavailable');
  expect(points[1]).toMatchObject({
    status: 'available',
    value: '110',
    availableAt: second.availableAt,
  });
  expect(() => build([second, first])).toThrow('严格递增');
  expect(() => build([first, first])).toThrow('严格递增');
});

const vwap = { type: 'sessionValue', sourceId: 'execution', field: 'vwap' } as const;
const close = { type: 'series', sourceId: 'execution', field: 'close' } as const;
const ratioRule: BooleanExpression = {
  type: 'compare', operator: 'gt', left: close,
  right: { type: 'arithmetic', operator: 'multiply', left: vwap,
    right: { type: 'constant', value: '1.02' } },
};
const distanceRule: BooleanExpression = {
  type: 'compare', operator: 'gt',
  left: { type: 'absolute', input: {
    type: 'arithmetic', operator: 'subtract', left: vwap, right: close,
  } }, right: { type: 'constant', value: '9' },
};

it.each([ratioRule, distanceRule])('合法会话嵌套从依赖准备到求值一致', (entry) => {
  const strategy = strategySchema.parse({ ...fixedSessionPlan(true), entry }) as BacktestStrategy;
  const dependencies = collectUsedSignalSources(strategy);
  expect(dependencies.find((source) => source.id === 'execution')?.fields)
    .toEqual(expect.arrayContaining(['close', 'volume']));
  const points = [point('2026-05-18', 0), point('2026-05-18', 1)];
  const source: BacktestSeries = {
    sourceId: 'execution', symbol: '159516.SZ', market: 'CN', assetType: 'etf',
    timeframe: '1m', field: 'close', adjusted: true, points,
  };
  const sourceSeries = new Map([[sourceSeriesKey('execution', 'close'), source]]);
  const ticks = points.map(({ occurredAt, availableAt }) => ({ occurredAt, availableAt }));
  const indicatorSeries = buildExchangeSessionSeries({ strategy, sourceSeries,
    calendarRows: [calendar], ticks,
    runConfig: { executionPriceProtocol: { history: { basis: 'point-in-time' } } } as RunConfigV3,
  });
  expect(indicatorSeries.get(numericExpressionKey(vwap))?.points.at(-1))
    .toMatchObject({ status: 'available', value: '110' });
  expect(evaluateBooleanExpression(entry, { tick: ticks[1]!, sourceSeries, indicatorSeries }))
    .toMatchObject({ status: 'available', value: true });
});

it('结构遍历不放开动态会话值的历史预计算', () => {
  expect(strategySchema.safeParse({ ...fixedSessionPlan(true), entry: {
    type: 'compare', operator: 'gt', left: close,
    right: { type: 'lag', periods: 1, input: vwap },
  } }).success).toBe(false);
});

it('会话价差仍拒绝时间与价格混算及跨坐标相减', () => {
  const definition = fixedSessionPlan(true);
  expect(strategySchema.safeParse({ ...definition, entry: {
    ...distanceRule, left: { type: 'arithmetic', operator: 'subtract',
      left: { ...vwap, field: 'elapsedMinutes' }, right: close },
  } }).success).toBe(false);
  expect(strategySchema.safeParse({ ...definition,
    signalSources: [
      { ...definition.signalSources[0]!, priceCoordinate: 'research' },
      { ...definition.signalSources[0]!, id: 'actual', priceCoordinate: 'actual' },
    ], entry: { type: 'compare', operator: 'gt', left: {
      type: 'absolute', input: { type: 'arithmetic', operator: 'subtract', left: vwap,
        right: { ...close, sourceId: 'actual' } },
    }, right: { type: 'constant', value: '9' } },
  }).success).toBe(false);
});
