import { expect, it } from 'vitest';
import { RuleDiagnosticsCollector } from '../src/backtest-rule-diagnostics.js';
import { runDeterministicSimulation, evaluateBooleanExpression,
  type SimulationEngineInput } from '../src/backtest-simulation.js';
import type { BooleanExpression } from '../src/backtest-strategy.js';
import { protectionArmed } from '../src/backtest-trade-protection.js';

const compare = (left: string, right: string): BooleanExpression => ({ type: 'compare', operator: 'eq',
  left: { type: 'constant', value: left }, right: { type: 'constant', value: right } });
const missing: BooleanExpression = { type: 'compare', operator: 'gt',
  left: { type: 'series', sourceId: 'missing', field: 'close' }, right: { type: 'constant', value: '0' } };
const ticks = Array.from({ length: 100 }, (_, index) => {
  const at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return { occurredAt: at, availableAt: at };
});

it.each([false, true])('三值组合由决定性分支确定，排列顺序不改变结果（any=%s）', (any) => {
  const decisive = compare('0', any ? '0' : '1');
  for (const conditions of [[missing, decisive], [decisive, missing]]) {
    const expression: BooleanExpression = { type: any ? 'any' : 'all', conditions };
    expect(evaluateBooleanExpression(expression, { tick: ticks[0]!, sourceSeries: new Map() }))
      .toMatchObject({ status: 'available', value: any });
  }
});

it('恒假入场与从未适用的缺值退出不会被记成数据失败', () => {
  const entry = compare('0', '1');
  const collector = new RuleDiagnosticsCollector([
    { path: ['entry'], expression: entry }, { path: ['exit'], expression: missing },
  ], new Map());
  const input: SimulationEngineInput = { runId: 'false-rule',
    strategy: { entry, exit: missing, primaryTimeframe: '1m',
      executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } },
    sourceSeries: new Map(), ticks, observeRule: collector.observe,
    positionState: { isOpen: false, quantity: '0', averageCost: '0', holdingPeriods: 0, availableAt: ticks[0]!.occurredAt },
  };
  const result = runDeterministicSimulation(input);
  expect(result.signals).toHaveLength(0);
  const rules = collector.snapshot().rules;
  expect(rules.find((rule) => rule.ruleId === 'entry')).toMatchObject({
    observations: 100, computableObservations: 100, trueObservations: 0, computableDecisions: 100,
  });
  expect(rules.find((rule) => rule.ruleId === 'exit')).toMatchObject({
    observations: 100, applicableDecisions: 0, unavailableReasons: [],
  });
});

it('全部适用时点缺值保留具体原因，重复窗口不会增长样本', () => {
  const collector = new RuleDiagnosticsCollector([{ path: ['entry'], expression: missing }], new Map());
  for (const tick of ticks) collector.observe({ ruleId: 'entry', applicable: true, tick,
    evaluation: { status: 'unavailable', reason: '缺少close', occurredAt: tick.occurredAt } });
  const rule = collector.snapshot().rules[0]!;
  expect(rule).toMatchObject({ applicableDecisions: 100, computableDecisions: 0 });
  expect(rule.unavailableReasons).toHaveLength(1);
  expect(rule.unavailableReasons[0]).toMatchObject({ count: 100 });
  expect(rule.unavailableReasons[0]!.samples).toHaveLength(3);
  expect(rule.unavailableReasons[0]!.samples[0]!.path).toEqual(['entry']);
});

it('已由false确定的分支不被未使用的迟到事实改成执行错误', () => {
  const entry: BooleanExpression = { type: 'all', conditions: [missing, compare('0', '1')] };
  const result = runDeterministicSimulation({ runId: 'short-circuit', ticks: ticks.slice(0, 2),
    strategy: { entry, exit: compare('0', '1'), primaryTimeframe: '1m',
      executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } },
    sourceSeries: new Map([['missing:close', { sourceId: 'missing', symbol: '159516.SZ', market: 'CN',
      assetType: 'etf', field: 'close', timeframe: '1m', adjusted: false,
      points: [{ occurredAt: ticks[0]!.occurredAt, availableAt: ticks[1]!.occurredAt, value: '100' }],
    }]]),
  });
  expect(result.signals).toHaveLength(0);
  expect(result.rejects).toHaveLength(0);
});

it('可计算窗口不足与已有足够观测后的缺输入分开统计', () => {
  const entry: BooleanExpression = { type: 'compare', operator: 'gt',
    left: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'main', field: 'close' }, params: { period: 20 } },
    right: { type: 'constant', value: '0' } };
  const source = { sourceId: 'main', symbol: '159516.SZ', market: 'CN', assetType: 'etf',
    timeframe: '1m', field: 'close', adjusted: false,
    points: ticks.map((tick) => ({ ...tick, value: '100', status: 'available' as const })) } as const;
  const collector = new RuleDiagnosticsCollector([{ path: ['entry'], expression: entry }], new Map([['main:close', source]]));
  for (const tick of [ticks[0]!, ticks[20]!]) collector.observe({ ruleId: 'entry', applicable: true, tick,
    evaluation: { status: 'unavailable', reason: '窗口输入不可用', occurredAt: tick.occurredAt } });
  expect(collector.snapshot().rules[0]).toMatchObject({ warmupObservations: 1,
    unavailableReasons: [ { code: 'RULE_WARMUP', count: 1 }, { code: 'RULE_INPUT_UNAVAILABLE', count: 1 } ],
  });
});

it('保护只在尚需启用的阶段记录条件，已启用后不把缺值追记为失败', () => {
  const collector = new RuleDiagnosticsCollector([
    { path: ['tradePlan', 'initialStop', 'activation', 'condition'], expression: missing },
  ], new Map());
  const context = { tick: ticks[0]!, sourceSeries: new Map(), observeRule: collector.observe };
  expect(protectionArmed(false, missing, context, 'tradePlan.initialStop')).toBe(false);
  expect(protectionArmed(true, missing, context, 'tradePlan.initialStop')).toBe(true);
  expect(collector.snapshot().rules[0]).toMatchObject({ observations: 1, applicableDecisions: 1,
    computableDecisions: 0 });
});
