import { expect, it } from 'vitest';
import { runDeterministicSimulation, runDeterministicSimulationCooperatively, runExchangeSimulation,
  runExchangeSimulationCooperatively, advanceBacktestComputation, evaluateIndicatorSteps, evaluateIndicator,
  buildBacktestAnalyticsSteps, buildBacktestAnalytics, type BacktestAnalyticsInput, type BacktestIndicatorName } from '../src/index.js';
import { baseInput, exchangeRunInput, sourceSeries, compare } from './backtest-simulation.fixtures.js';
import { dailyInput } from './backtest-daily-engine.fixtures.js';

it.each([1, 7, 256])('分批大小%s保持全部事件、信号、成交、拒单和账本一致', async (batchSize) => {
  const signal = new AbortController().signal;
  expect(await runDeterministicSimulationCooperatively(baseInput(), { signal, batchSize })).toEqual(runDeterministicSimulation(baseInput()));
  expect(await runExchangeSimulationCooperatively(exchangeRunInput(), { signal, batchSize })).toEqual(runExchangeSimulation(exchangeRunInput()));
  expect(await runExchangeSimulationCooperatively(dailyInput(), { signal, batchSize })).toEqual(runExchangeSimulation(dailyInput()));
});
it('CPU排队与模拟允许计时器登记取消，并在有界时间内实际退出计算', async () => {
  const controller = new AbortController();
  const ticks = Array.from({ length: 3_000 }, (_, n) => ({ occurredAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString() }));
  const input = baseInput({ ticks, strategy: { ...baseInput().strategy, entry: compare('lt', '0') },
    sourceSeries: new Map([['close', sourceSeries(ticks.map((tick) => ({ ...tick, availableAt: tick.occurredAt, status: 'available' as const, value: '10' }))) ]]) });
  let registeredAt = 0;
  const timer = setTimeout(() => { registeredAt = performance.now(); controller.abort(new Error('fixture-cancelled')); }, 40);
  try {
    await expect(runDeterministicSimulationCooperatively(input, { signal: controller.signal, batchSize: 128 })).rejects.toThrow('fixture-cancelled');
    expect(registeredAt).toBeGreaterThan(0);
    expect(performance.now() - registeredAt).toBeLessThan(5_000);
  } finally { clearTimeout(timer); }
});

const indicatorPoints = (length: number) => Array.from({ length }, (_, n) => ({
  occurredAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(), availableAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
  value: String(100 + n % 20), high: String(102 + n % 20), low: String(98 + n % 20), close: String(100 + n % 20), volume: '100', status: 'available' as const,
}));
it.each(['MA', 'EMA', 'RSI', 'MACD', 'ADX', 'ATR', 'VWAP', 'Highest', 'Lowest'] satisfies BacktestIndicatorName[])(
  '指标%s分批保持预热、可见时点及所有长十进制结果一致', async (name) => {
    const points = indicatorPoints(60), params = { period: 5, fastPeriod: 3, slowPeriod: 8, signalPeriod: 4 };
    const expected = evaluateIndicator(name, points, params);
    const result = await advanceBacktestComputation(evaluateIndicatorSteps(name, points, params), { signal: new AbortController().signal, batchSize: 32 });
    expect(result).toEqual(expected);
  },
);
const analyticsInput = (length: number): BacktestAnalyticsInput => ({
  runId: 'fixture', strategyVersionId: 'fixture', snapshotId: 'fixture', contentHash: 'fixture', engineVersion: 'fixture',
  schemaVersion: '2', marketRuleVersion: 'fixture', calendarVersion: 'fixture', aggregationVersion: 'fixture',
  baseCurrency: 'CNY', periodsPerYear: 252, trades: [],
  equityCurve: indicatorPoints(length).map((point) => ({ occurredAt: point.occurredAt, value: { amount: point.value, currency: 'CNY' } })),
});
it('分析分批保持完整指标、警示、权益／回撤曲线和checksum一致', async () => {
  const input = analyticsInput(300), expected = buildBacktestAnalytics(input);
  expect(await advanceBacktestComputation(buildBacktestAnalyticsSteps(input), { signal: new AbortController().signal, batchSize: 32 })).toEqual(expected);
});
it.each(['indicator', 'analytics'] as const)('长CPU阶段%s实际让出事件循环并可停止', async (stage) => {
  const work = stage === 'indicator' ? evaluateIndicatorSteps('RSI', indicatorPoints(20_000), { period: 100 }) : buildBacktestAnalyticsSteps(analyticsInput(20_000));
  const controller = new AbortController();
  let registered = 0;
  const timer = setTimeout(() => { registered = performance.now(); controller.abort(new Error('stage-cancelled')); }, 30);
  try {
    await expect(advanceBacktestComputation(work as Generator<void, unknown, void>, { signal: controller.signal })).rejects.toThrow('stage-cancelled');
    expect(registered).toBeGreaterThan(0);
    expect(performance.now() - registered).toBeLessThan(5_000);
  } finally { clearTimeout(timer); }
});
