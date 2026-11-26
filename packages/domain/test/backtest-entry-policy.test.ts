import { expect, it } from 'vitest';
import { evaluateSignalAt, runExchangeSimulation, materializeEntryPolicy, runDeterministicSimulation,
  type EdgeState, type SimulationPositionState } from '../src/index.js';
import { baseInput, sourceSeries, point, compare, exchangeRunInput, exchangeBar,
  frozenExchangeExecutionModel } from './backtest-simulation.fixtures.js';
import { dailyInput, daily } from './backtest-daily-engine.fixtures.js';

const at = (n: number) => new Date(Date.UTC(2026, 8, 8, 1, 35 + n * 10)).toISOString();
const protection = { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'percent', percent: '0.99' } } as const;

function signals(values: Array<boolean | null>, held: boolean[], policy: 'rising-edge' | 'while-flat', eligible: boolean[] = []) {
  let edge: EdgeState = {};
  return values.map((value, index) => {
    const position: SimulationPositionState = { isOpen: held[index]!, quantity: held[index] ? '1' : '0',
      averageCost: '10', holdingPeriods: 0, availableAt: at(index) };
    const input = baseInput({ strategy: { ...baseInput().strategy, entryTrigger: policy }, positionState: position,
      entryEligible: () => eligible[index] ?? true,
      sourceSeries: new Map([['close', sourceSeries([{ occurredAt: at(index), availableAt: at(index),
        ...(value === null ? { status: 'unavailable' as const } : { status: 'available' as const, value: value ? '11' : '9' }) }])]]) });
    const result = evaluateSignalAt(input, { occurredAt: at(index) }, edge, index);
    edge = result.state;
    return { kind: result.signal?.kind, edge: { ...edge }, status: result.entry.status };
  });
}

it.each(['rising-edge', 'while-flat'] as const)('持仓期间变假，退出后首次变真可以入场：%s', (policy) => {
  expect(signals([true, false, false, true], [false, true, true, false], policy).map((x) => x.kind))
    .toEqual(['entry', undefined, undefined, 'entry']);
});
it('持仓期间已经再次变真，退出后持续真；新边沿不重入，空仓政策可重入', () => {
  expect(signals([true, false, true, true], [false, true, true, false], 'rising-edge').map((x) => x.kind))
    .toEqual(['entry', undefined, undefined, undefined]);
  expect(signals([true, false, true, true], [false, true, true, false], 'while-flat').at(-1)?.kind).toBe('entry');
});
it('缺值不伪装false、不重置边沿；首次可计算及真实变假后恢复分别判断', () => {
  const result = signals([null, true, null, true, false, null, true], Array(7).fill(false), 'rising-edge');
  expect(result.map((x) => x.kind)).toEqual([undefined, 'entry', undefined, undefined, undefined, undefined, 'entry']);
  expect(result[2]).toMatchObject({ status: 'unavailable', edge: { entry: true } });
});
it('待执行／资金资格不阻止观测：恢复时边沿与空仓政策结果不同', () => {
  expect(signals([false, true, true], [false, false, false], 'rising-edge', [false, false, true]).map((x) => x.kind))
    .toEqual([undefined, undefined, undefined]);
  expect(signals([false, true, true], [false, false, false], 'while-flat', [false, false, true]).at(-1)?.kind).toBe('entry');
});

function runPair(values: string[], withPlan: boolean, policy?: 'rising-edge' | 'while-flat') {
  const input = exchangeRunInput();
  const prices = { ...sourceSeries(values.map((value, n) => ({ occurredAt: at(n), availableAt: at(n), status: 'available' as const, value }))), timeframe: '5m' as const };
  const exit = { ...prices, sourceId: 'exit', points: prices.points.map((p, n) => ({ ...p, value: n === 3 ? '1' : '0' })) };
  input.simulation = { ...input.simulation, strategy: { ...input.simulation.strategy,
    entry: compare('gt', '10'), exit: { ...compare('eq', '1'), left: { type: 'series', sourceId: 'exit', field: 'close' } },
    ...(withPlan ? { tradePlan: structuredClone(protection) as never } : {}), ...(policy ? { entryTrigger: policy } : {}) },
    ticks: prices.points.map((p) => ({ occurredAt: p.occurredAt, availableAt: p.availableAt, timeframe: '5m' })),
    sourceSeries: new Map([['close', prices], ['exit', exit]]) };
  input.exchange = { ...input.exchange, bars: values.map((_, n) => exchangeBar(new Date(Date.parse(at(n)) - 300_000).toISOString(), at(n), '10', '10')),
    tradePlanPrices: prices, executionModel: frozenExchangeExecutionModel(0), dataAsOf: '2026-09-09T00:00:00.000Z' };
  return runExchangeSimulation(input);
}
it.each([
  ['退出后才再次变真', ['11', '9', '9', '9', '11', '11', '11'], 2],
  ['持仓期已再次变真', ['11', '9', '11', '11', '11', '11', '11'], 1],
] as const)('实际队列／账本：先物化政策后仅加保护，成交保持；%s', (_label, values, buys) => {
  const original = runPair([...values], false);
  const explicit = runPair([...values], false, 'rising-edge');
  const protectedResult = runPair([...values], true, 'rising-edge');
  expect(explicit.fills).toEqual(original.fills);
  expect(protectedResult.fills.map((fill) => [fill.side, fill.occurredAt, fill.price, fill.quantity]))
    .toEqual(original.fills.map((fill) => [fill.side, fill.occurredAt, fill.price, fill.quantity]));
  expect(protectedResult.fills.filter((fill) => fill.side === 'buy'), JSON.stringify(protectedResult.rejects)).toHaveLength(buys);
});
it('旧有效计划保留原空仓行为；旧普通、空壳与显式政策分别投影', () => {
  const values = ['11', '9', '11', '11', '11', '11', '11'];
  expect(runPair(values, true).fills.filter((fill) => fill.side === 'buy')).toHaveLength(2);
  expect(runPair(values, true, 'rising-edge').fills.filter((fill) => fill.side === 'buy')).toHaveLength(1);
  const base = { entryTrigger: undefined };
  expect(materializeEntryPolicy(base).entryTrigger).toBe('rising-edge');
  expect(materializeEntryPolicy({ ...base, tradePlan: { version: 1, evaluation: 'barClose', stages: [] } }).entryTrigger).toBe('rising-edge');
  expect(materializeEntryPolicy({ ...base, tradePlan: structuredClone(protection) as never }).entryTrigger).toBe('while-flat');
  expect(materializeEntryPolicy({ ...base, entryTrigger: 'rising-edge' as const, tradePlan: structuredClone(protection) as never }).entryTrigger).toBe('rising-edge');
});
it.each(['rising-edge', 'while-flat'] as const)('拒单后按显式政策决定重试，不伪造边沿：%s', (policy) => {
  const input = exchangeRunInput();
  const prices = sourceSeries([0, 1, 2].map((n) => ({ occurredAt: at(n), availableAt: at(n), value: '11', status: 'available' as const })));
  input.simulation = { ...input.simulation, strategy: { ...input.simulation.strategy, entryTrigger: policy },
    ticks: prices.points.map((p) => ({ occurredAt: p.occurredAt })), sourceSeries: new Map([['close', prices]]) };
  input.exchange.bars = [exchangeBar(at(1), at(1), '100', '10'), exchangeBar(at(2), at(2), '10', '10')];
  const result = runExchangeSimulation(input);
  expect(result.rejects.length).toBeGreaterThan(0);
  expect(result.fills.filter((fill) => fill.side === 'buy')).toHaveLength(policy === 'while-flat' ? 1 : 0);
});
it('下一开盘尚未执行时即使仍有现金也只保留一个入场委托', () => {
  const input = exchangeRunInput();
  input.simulation.strategy.entryTrigger = 'while-flat';
  input.simulation.ticks = [0, 1, 2].map((n) => ({ occurredAt: at(n) }));
  input.simulation.sourceSeries = new Map([['close', sourceSeries([0, 1, 2].map((n) => ({ ...point('2026-09-08', '11'), occurredAt: at(n), availableAt: at(n) })))]]);
  input.exchange.bars = [exchangeBar(at(3), at(3), '10', '10')];
  const result = runExchangeSimulation(input);
  expect(result.targetIntents.filter((intent) => intent.side === 'buy')).toHaveLength(1);
  expect(result.fills).toHaveLength(1);
});
it.each([
  ['rising-edge', false], ['while-flat', false], ['rising-edge', true], ['while-flat', true],
] as const)('日线入场委托到期后保持边沿／允许再次空仓委托：%s，保护=%s', (policy, withPlan) => {
  const input = dailyInput(['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'].map((date) => daily(date, '10', '10', '11')));
  input.simulation.strategy.entryTrigger = policy;
  if (withPlan) {
    input.simulation.strategy.tradePlan = structuredClone(protection) as never;
    input.exchange.tradePlanPrices = (input.simulation.sourceSeries as Map<string, ReturnType<typeof sourceSeries>>).get('close')!;
  }
  const execution = input.exchange.dailyOrders!.execution;
  execution.orders = execution.orders.filter((order) => ['entry', 'exit'].includes(order.action.kind));
  execution.orders[0]!.validity = { kind: 'bars', bars: 1 };
  const result = runExchangeSimulation(input);
  expect(result.fills).toEqual([]);
  expect(result.targetIntents.filter((intent) => intent.side === 'buy').length).toBe(policy === 'while-flat' ? 4 : 1);
});
it('资金不可用仍正常返回零交易，条件观测继续推进', () => {
  const observed: boolean[] = [];
  const input = baseInput({ strategy: { ...baseInput().strategy, entryTrigger: 'while-flat' },
    entryEligible: () => false, observeRule: (observation) => { if (observation.ruleId === 'entry') observed.push(observation.applicable); } });
  const result = runDeterministicSimulation(input);
  expect(result.targetIntents).toEqual([]);
  expect(observed).toEqual([false]);
});
it('退出输入暂不可见也不丢失同一时点已观测的入场变假，缺值恢复不阻断真实新边沿', () => {
  const prices = sourceSeries([0, 1, 2, 3].map((n) => ({ occurredAt: at(n), availableAt: at(n),
    ...(n === 2 ? { status: 'unavailable' as const } : { status: 'available' as const, value: n === 1 ? '9' : '11' }) })));
  const exits = { ...prices, sourceId: 'exit', points: [1, 2, 3].map((n) => ({ occurredAt: at(n),
    availableAt: at(n === 1 ? 2 : n), status: 'available' as const, value: n === 2 ? '1' : '0' })) };
  const input = baseInput({ ticks: prices.points.map((p) => ({ occurredAt: p.occurredAt })),
    strategy: { ...baseInput().strategy, entryTrigger: 'rising-edge', exit: { ...compare('eq', '1'), left: { type: 'series', sourceId: 'exit', field: 'close' } } },
    sourceSeries: new Map([['close', prices], ['exit', exits]]), positionStateAt: (tick) => ({
      isOpen: [at(1), at(2)].includes(tick.occurredAt), quantity: [at(1), at(2)].includes(tick.occurredAt) ? '1' : '0',
      averageCost: '10', holdingPeriods: 1, availableAt: tick.occurredAt }) });
  const result = runDeterministicSimulation(input);
  expect(result.signals.map((signal) => [signal.kind, signal.occurredAt])).toEqual([['entry', at(0)], ['exit', at(2)], ['entry', at(3)]]);
  expect(result.rejects.some((reject) => reject.code === 'FUTURE_DATA')).toBe(true);
});
