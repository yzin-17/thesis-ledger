import { expect, it } from 'vitest';
import { expressionChildren, type Expression, type BooleanExpression } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { practicalV6IntentReview as review } from './practical-v6-intent-oracle.fixture.js';
import { practicalIntentReference as reference, intentSeries, intentValue, type PracticalIntentParameters } from './practical-v6-intent-contract.fixture.js';
import { fixedAuthoringPlan } from './trade-plan-authoring-content.fixture.js';
import { compileBacktestStrategy } from '../../src/backtest/backtest-strategy-compiler.js';

const ids = ['count-confirmation', 'statistics-gap', 'captured-retest', 'timeframes-anchor',
  'session-vwap-arithmetic', 'hfq-only-discovery', 'stop-only-policy'];
const baseline = fixedAuthoringPlan(false);
delete baseline.tradePlan;
baseline.entry = { type: 'cross', direction: 'above', left: { type: 'series', sourceId: 'execution', field: 'close' },
  right: { type: 'indicator', name: 'EMA', input: { type: 'series', sourceId: 'execution', field: 'close' }, params: { period: 20 } } };
baseline.exit = { ...baseline.entry, direction: 'below' };
const nodes = (expression: Expression): Expression[] => [expression, ...expressionChildren(expression).flatMap(nodes)];
const correct = (id: string, changes: Partial<PracticalIntentParameters> = {}) => reference(id, changes, baseline);
const accepted = (id: string, actual: BacktestStrategy, changes: Partial<PracticalIntentParameters> = {}) =>
  review(id, actual, baseline, changes).passed;
const compile = (strategy: BacktestStrategy) => compileBacktestStrategy({ ...strategy,
  signalSources: strategy.signalSources.map((source) => Object.fromEntries(Object.entries(source).filter(([field]) => field !== 'series'))) });

it.each(ids)('独立需求正确配置通过，原对象保持：%s', (id) => {
  const strategy = correct(id), before = structuredClone(strategy);
  expect(accepted(id, strategy)).toBe(true);
  expect(compile(strategy).status).toBe('compiled');
  expect(strategy).toEqual(before);
});

it.each(ids)('参数变化按本次需求判断，不固定七个原参数：%s', (id) => {
  const variations = { countWindow: 9, minimumUp: 4, consecutive: 2, averagePeriod: 13,
    highPeriod: 17, within: 7, confirmationMultiple: '1.04', hourlyPeriod: 8,
    quantileWindow: 45, quantile: '0.35', gap: '0.03', deviation: '0.015',
    anchorAt: '2026-03-05T15:00:00+08:00', allocation: '0.3', stop: '0.07' };
  const changes = id === 'stop-only-policy' ? { stop: '0.07' } : variations;
  const actual = correct(id, changes);
  expect(accepted(id, actual, changes)).toBe(true);
  expect(compile(actual).status).toBe('compiled');
  expect(accepted(id, actual)).toBe(false);
});

it.each(['statistics-gap', 'timeframes-anchor', 'count-confirmation'])('空仓取反不能被技术合法或reason掩盖：%s', (id) => {
  const good = correct(id);
  const entry = good.entry;
  if (entry.type !== 'all') throw new Error('测试合取缺失');
  good.entry = { type: 'all', conditions: [{ type: 'not', expression: { type: 'positionState', field: 'isOpen' } }, entry] };
  expect(accepted(id, good)).toBe(true);
  const bad = structuredClone(good);
  if (bad.entry.type !== 'all') throw new Error('测试合取缺失');
  bad.entry.conditions[0] = { type: 'positionState', field: 'isOpen' };
  expect(accepted(id, bad)).toBe(false);
});

it('计数不能用事件或省略阈值替代', () => {
  const bad = correct('count-confirmation');
  if (bad.entry.type !== 'all') throw new Error('测试合取缺失');
  const up: BooleanExpression = { type: 'compare', operator: 'gt', left: { type: 'series', sourceId: 'day', field: 'close' }, right: { type: 'series', sourceId: 'day', field: 'open' } };
  bad.entry.conditions[0] = { type: 'sequence', trigger: up, confirm: up, invalidation: { type: 'compare', operator: 'eq', left: intentValue('0'), right: intentValue('1') }, within: 5, allowSameBar: true, repeat: false };
  expect(accepted('count-confirmation', bad)).toBe(false);
});

it('恒假退出不依赖市场价格，收盘等于零不等同于两个不同常量相等', () => {
  const correctExit = correct('count-confirmation');
  expect(compile(correctExit).status).toBe('compiled');
  expect(accepted('count-confirmation', correctExit)).toBe(true);
  correctExit.exit = { type: 'compare', operator: 'eq', left: intentSeries('close'), right: intentValue('0') };
  expect(compile(correctExit).status).toBe('rejected');
  expect(accepted('count-confirmation', correctExit)).toBe(false);
});

it('严格比较仍需保留量纲，开盘与前收的价格差不能与百分比比较', () => {
  const strategy = correct('statistics-gap');
  expect(compile(strategy).status).toBe('compiled');
  expect(accepted('statistics-gap', strategy)).toBe(true);
  const gap = nodes(strategy.entry).find((node) => node.type === 'absolute');
  if (gap?.type !== 'absolute') throw new Error('测试跳空条件缺失');
  gap.input = { type: 'arithmetic', operator: 'subtract', left: intentSeries('open'),
    right: { type: 'lag', periods: 1, input: intentSeries('close') } };
  expect(compile(strategy).status).toBe('rejected');
  expect(accepted('statistics-gap', strategy)).toBe(false);
});

it('均线结果可用sum除周期等价表达，不能用周期常量代替', () => {
  const good = correct('statistics-gap');
  for (const node of nodes(good.entry)) if (node.type === 'arithmetic' && node.operator === 'divide' && node.right.type === 'indicator') {
    const average = node.right;
    node.right = { type: 'arithmetic', operator: 'divide', left: { type: 'rolling', statistic: 'sum', periods: 20, input: average.input }, right: intentValue('20') };
  }
  expect(accepted('statistics-gap', good)).toBe(true);
  const bad = correct('statistics-gap');
  for (const node of nodes(bad.entry)) if (node.type === 'arithmetic' && node.operator === 'divide' && node.right.type === 'indicator') node.right = intentValue('20');
  expect(accepted('statistics-gap', bad)).toBe(false);
});

it.each([['lte', 'lt'], ['lt', 'lte']] as const)('合取中每一项的等值边界独立保持：%s改为%s', (operator, changed) => {
  const good = correct('statistics-gap', { gap: '0.025' });
  expect(accepted('statistics-gap', good, { gap: '0.025' })).toBe(true);
  const comparison = nodes(good.entry).find((node) => node.type === 'compare' && node.operator === operator);
  if (comparison?.type !== 'compare') throw new Error('测试比较缺失');
  comparison.operator = changed;
  expect(compile(good).status).toBe('compiled');
  expect(accepted('statistics-gap', good, { gap: '0.025' })).toBe(false);
});

it('比较翻转、合取顺序、十进制与来源重命名保持等价', () => {
  const good = correct('statistics-gap');
  if (good.entry.type !== 'all') throw new Error('测试合取缺失');
  good.entry.conditions.reverse();
  for (const node of nodes(good.entry)) if (node.type === 'compare') {
    if (node.operator === 'lte') { [node.left, node.right] = [node.right, node.left]; node.operator = 'gte'; }
    if (node.operator === 'lt') { [node.left, node.right] = [node.right, node.left]; node.operator = 'gt'; }
  }
  for (const source of good.signalSources) {
    const before = source.id;
    source.id += '-renamed';
    for (const node of [...nodes(good.entry), ...nodes(good.exit)]) if ((node.type === 'series' || node.type === 'sessionValue') && node.sourceId === before) node.sourceId = source.id;
  }
  for (const node of nodes(good.entry)) if (node.type === 'constant') node.value += node.value.includes('.') ? '0' : '.0';
  expect(accepted('statistics-gap', good)).toBe(true);
});

it.each(['capture', 'reference', 'repeat', 'lag', 'sameBar'] as const)('冻结事件必须完整保持：%s', (kind) => {
  const bad = correct('captured-retest');
  if (bad.entry.type !== 'sequence') throw new Error('测试事件缺失');
  if (kind === 'capture') delete bad.entry.capture;
  if (kind === 'repeat') bad.entry.repeat = false;
  if (kind === 'sameBar') bad.entry.allowSameBar = true;
  if (kind === 'lag' && bad.entry.capture?.type === 'lag') bad.entry.capture = bad.entry.capture.input;
  if (kind === 'reference' && bad.entry.confirm.type === 'compare') bad.entry.confirm.right = intentValue('1.02');
  expect(accepted('captured-retest', bad)).toBe(false);
});

it('触发和捕获即使完全相同，也必须共同排除当根', () => {
  const strategy = correct('captured-retest');
  expect(accepted('captured-retest', strategy)).toBe(true);
  const sequence = strategy.entry;
  if (sequence.type !== 'sequence' || sequence.trigger.type !== 'compare' || sequence.capture?.type !== 'lag')
    throw new Error('测试前窗缺失');
  sequence.trigger.right = sequence.capture.input;
  sequence.capture = sequence.capture.input;
  expect(compile(strategy).status).toBe('compiled');
  expect(accepted('captured-retest', strategy)).toBe(false);
});

it('小时lag与锚点时区分别识别，同一锚点的UTC表达通过', () => {
  const good = correct('timeframes-anchor');
  for (const node of nodes(good.entry)) if (node.type === 'cumulative') node.anchorAt = '2026-03-02T07:00:00Z';
  expect(accepted('timeframes-anchor', good)).toBe(true);
  const bad = correct('timeframes-anchor');
  if (bad.entry.type !== 'all' || bad.entry.conditions[1]?.type !== 'compare') throw new Error('测试小时条件缺失');
  const hour = bad.entry.conditions[1];
  hour.left = { type: 'lag', periods: 1, input: hour.left };
  expect(accepted('timeframes-anchor', bad)).toBe(false);
  const noZone = correct('timeframes-anchor');
  for (const node of nodes(noZone.entry)) if (node.type === 'cumulative') node.anchorAt = '2026-03-02T15:00';
  expect(accepted('timeframes-anchor', noZone)).toBe(false);
});

it('滚动VWAP、附送保护条件、政策变化分别拒绝', () => {
  const session = correct('session-vwap-arithmetic');
  for (const node of nodes(session.entry)) if (node.type === 'arithmetic' && node.operator === 'divide') node.right = { type: 'indicator', name: 'VWAP', input: { type: 'series', sourceId: 'minute', field: 'close' }, params: { period: 1 } };
  expect(accepted('session-vwap-arithmetic', session)).toBe(false);
  const stop = correct('stop-only-policy');
  if (!stop.tradePlan?.initialStop) throw new Error('测试保护缺失');
  delete stop.tradePlan.initialStop.activation;
  expect(accepted('stop-only-policy', stop)).toBe(true);
  stop.tradePlan.initialStop.activation = { kind: 'condition', condition: { type: 'positionState', field: 'isOpen' } };
  expect(accepted('stop-only-policy', stop)).toBe(false);
  const policy = correct('stop-only-policy'); policy.entryTrigger = 'while-flat';
  expect(accepted('stop-only-policy', policy)).toBe(false);
});

it('quantity零、双重否定、嵌套合取及突破上穿保持已列明等价', () => {
  const good = correct('statistics-gap');
  const entry = good.entry;
  if (entry.type !== 'all') throw new Error('测试合取缺失');
  good.entry = { type: 'all', conditions: [{ type: 'compare', operator: 'eq',
    left: intentValue('0.0'), right: { type: 'positionState', field: 'quantity' } },
  { type: 'all', conditions: [{ type: 'all', conditions: entry.conditions }] }] };
  expect(accepted('statistics-gap', good)).toBe(true);
  good.entry = { type: 'not', expression: { type: 'not', expression: good.entry } };
  expect(accepted('statistics-gap', good)).toBe(true);
  const cross = correct('captured-retest');
  if (cross.entry.type !== 'sequence' || cross.entry.trigger.type !== 'compare') throw new Error('测试突破缺失');
  cross.entry.trigger = { type: 'cross', direction: 'above', left: cross.entry.trigger.left, right: cross.entry.trigger.right };
  expect(accepted('captured-retest', cross)).toBe(true);
});
