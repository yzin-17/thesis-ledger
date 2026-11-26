import { expect, it } from 'vitest';
import { researchStrategyInputNeeds } from '../src/backtest-research-inputs.js';
import { buildResearchDataScope, researchScopeIssues, researchStrategyScopeIssues } from '../src/backtest-research-data-scope.js';
import type { BacktestStrategy, BooleanExpression, NumericExpression } from '../src/backtest-strategy.js';
import type { BacktestSeries } from '../src/backtest-series.js';
import { researchJointWindowIssues } from '../src/backtest-research-window-availability.js';

const asset = { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } as const;
const ref = (field: 'close' | 'open' | 'volume'): NumericExpression => ({ type: 'series', sourceId: 'main', field });
const constant = { type: 'constant', value: '0' } as const;
const ma = (input: NumericExpression, period = 20): NumericExpression => ({ type: 'indicator', name: 'MA', input, params: { period } });
const strategy = (entry: BooleanExpression = { type: 'compare', operator: 'gt', left: ref('close'), right: ma(ref('close')) }): BacktestStrategy => ({
  schemaVersion: '3', name: '依赖研究', executionInstrument: asset, primaryTimeframe: '1d',
  signalSources: [{ id: 'main', asset, timeframe: '1d', priceCoordinate: 'research', series: ['open', 'close', 'volume'] }],
  entry, exit: { type: 'compare', operator: 'eq', left: constant, right: { type: 'constant', value: '1' } },
  sizing: { type: 'fixedAmount', amount: '1000' }, risk: [],
  execution: { mode: 'exchange', timing: 'nextEligibleBarOpen', orderType: 'market', timeInForce: 'DAY' },
  cost: { commissionRate: '0', slippageRate: '0' },
});
const series = (field: 'open' | 'close' | 'volume', values: (string | null)[]): BacktestSeries => ({
  sourceId: 'main', symbol: asset.symbol, market: asset.market, assetType: asset.assetType,
  timeframe: '1d', field, adjusted: true,
  points: values.map((value, index) => ({ occurredAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    availableAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    ...(value === null ? { status: 'unavailable' as const, reason: '字段未知' } : { status: 'available' as const, value }),
  })),
});
const scope = (volumes: (string | null)[]) => buildResearchDataScope({ executionInstrument: asset, primaryTimeframe: '1d',
  sources: [{ sourceId: 'main', coordinate: 'research', timeframe: '1d', volumeBasis: 'unknown',
    analysisStartAt: '2026-01-20T00:00:00Z', series: [series('open', volumes.map(() => '100')),
      series('close', volumes.map(() => '100')), series('volume', volumes)] }],
});

it('纯价格与金额投入不引入原价、成交量或额外来源', () => {
  const value = strategy(), before = JSON.stringify(value);
  const plan = researchStrategyInputNeeds(value, { executionCoordinate: 'research' });
  expect(plan.issues).toEqual([]);
  expect(plan.needs.flatMap((need) => need.fields)).not.toContain('volume');
  expect(plan.needs.every((need) => need.coordinate === 'research')).toBe(true);
  expect(researchScopeIssues(plan.needs, scope(Array(40).fill(null)))).toEqual([]);
  expect(JSON.stringify(value)).toBe(before);
});

it('组合与嵌套窗口按实际子树传播，当前量过滤不承担另一支均线的长窗', () => {
  const entry: BooleanExpression = { type: 'all', conditions: [
    { type: 'compare', operator: 'gt', left: { type: 'rolling', statistic: 'sum', periods: 20,
      input: { type: 'arithmetic', operator: 'divide', left: ref('close'), right: ma(ref('close')) } }, right: constant },
    { type: 'compare', operator: 'gt', left: ref('volume'), right: constant },
  ] };
  const plan = researchStrategyInputNeeds(strategy(entry), { executionCoordinate: 'research' });
  const signal = plan.needs.find((need) => need.sourceKind === 'signal')!;
  expect(signal.consumers.some((consumer) => consumer.fields.includes('close') && consumer.minimumWarmupRows === 39)).toBe(true);
  expect(signal.consumers.filter((consumer) => consumer.fields.includes('volume')).map((consumer) => consumer.minimumWarmupRows)).toEqual([1]);
  expect(signal.consumers.some((consumer) => consumer.path.join('.') === 'entry.conditions.1.left')).toBe(true);
  expect(researchScopeIssues(plan.needs, scope([...Array(39).fill(null), '100']))).toEqual([]);
});

it('全窗无量不开量能力，单根有效量也不能开放二十根量均线', () => {
  const entry: BooleanExpression = { type: 'compare', operator: 'gt', left: ma(ref('volume')), right: constant };
  const plan = researchStrategyInputNeeds(strategy(entry), { executionCoordinate: 'research' });
  const empty = scope(Array(40).fill(null));
  expect(empty.sources[0]!.fields).not.toContain('volume');
  expect(researchScopeIssues(plan.needs, empty).some((issue) => issue.code === 'DATA_SCOPE_FIELD')).toBe(true);
  const one = scope([...Array(39).fill(null), '100']);
  expect(one.sources[0]!.fieldWindows.find((field) => field.field === 'volume'))
    .toMatchObject({ validRows: 1, longestWindowRows: 1 });
  expect(researchScopeIssues(plan.needs, one).some((issue) => issue.code === 'DATA_SCOPE_WARMUP' && issue.details.requiredRows === 20)).toBe(true);
});

it('保护ATR与固定份数分别增加必要字段与原价开盘用途，程序不添加来源', () => {
  const value = strategy();
  value.sizing = { type: 'fixedQuantity', quantity: '10' };
  value.tradePlan = { stages: [], initialStop: { kind: 'entryAtr', sourceId: 'main', period: 14, multiple: '2' } };
  const before = JSON.stringify(value);
  const plan = researchStrategyInputNeeds(value, { executionCoordinate: 'research' });
  expect(plan.needs.find((need) => need.sourceKind === 'signal')?.fields).toEqual(['close', 'high', 'low']);
  expect(plan.needs.some((need) => need.coordinate === 'actual' && need.consumers.some((consumer) => consumer.kind === 'sizing'))).toBe(true);
  expect(researchScopeIssues(plan.needs, scope(Array(40).fill('100'))).some((issue) => issue.code === 'DATA_SCOPE_SOURCE')).toBe(true);
  expect(JSON.stringify(value)).toBe(before);
});

it('可选预留不阻断，引用同一输入后升级为必需，未声明来源给出真实路径', () => {
  const value = strategy();
  const optional = { sourceId: '$execution', sourceKind: 'execution' as const, asset,
    coordinate: 'actual' as const, timeframe: '1d' as const, fields: ['open' as const], minimumWarmupRows: 1,
    necessity: 'optional' as const, consumers: [{ kind: 'sizing' as const, path: ['sizing'], fields: ['open' as const], minimumWarmupRows: 1 }] };
  const first = researchStrategyInputNeeds(value, { executionCoordinate: 'research', additionalInputs: [optional] });
  expect(researchScopeIssues(first.needs, scope(Array(40).fill(null)))).toEqual([]);
  value.sizing = { type: 'fixedQuantity', quantity: '10' };
  const required = researchStrategyInputNeeds(value, { executionCoordinate: 'research', additionalInputs: [optional] });
  expect(required.needs.filter((need) => need.coordinate === 'actual')).toHaveLength(1);
  expect(required.needs.find((need) => need.coordinate === 'actual')?.necessity).toBe('required');
  value.entry = { type: 'compare', operator: 'gt', left: { type: 'series', sourceId: 'undeclared', field: 'close' }, right: constant };
  expect(researchStrategyInputNeeds(value, { executionCoordinate: 'research' }).issues)
    .toMatchObject([{ code: 'UNDECLARED_SOURCE', path: ['entry', 'left', 'sourceId'] }]);
});

it('无效量与范围外资产不能被降为可选缺失', () => {
  expect(() => scope(['-1'])).toThrow('无效数值');
  const prepared = scope(Array(40).fill(null));
  const value = strategy();
  value.signalSources[0]!.asset = { ...asset, symbol: '510300.SH' };
  expect(researchScopeIssues(researchStrategyInputNeeds(value, { executionCoordinate: 'research' }).needs, prepared)
    .some((issue) => issue.code === 'DATA_SCOPE_ASSET')).toBe(true);
});

it('缺值位置不丢失，不把三次分散有效量冒充连续三根输入', () => {
  const prepared = scope(['1', null, '1', null, '1']);
  const field = prepared.sources[0]!.fieldWindows.find((field) => field.field === 'volume');
  expect(field).toMatchObject({ validRows: 3, longestWindowRows: 1 });
  const entry: BooleanExpression = { type: 'compare', operator: 'gt', left: ma(ref('volume'), 3), right: constant };
  expect(researchScopeIssues(researchStrategyInputNeeds(strategy(entry), { executionCoordinate: 'research' }).needs, prepared)
    .some((issue) => issue.code === 'DATA_SCOPE_WARMUP' && issue.details.field === 'volume')).toBe(true);
});

it('周期元数据必须与实际逻辑序列一致，不能把日线行数当成小时数量', () => {
  expect(() => buildResearchDataScope({ executionInstrument: asset, primaryTimeframe: '60m',
    sources: [{ sourceId: 'main', coordinate: 'research', timeframe: '60m',
      series: [series('close', ['100'])], analysisStartAt: '2026-01-01T00:00:00Z', volumeBasis: 'unknown' }],
  })).toThrow('周期');
});

it('逐字段长窗通过仍复核联合窗口，禁止错开的价格与量冒充共同可用', () => {
  const value = strategy({ type: 'compare', operator: 'gt', left: ma(ref('close'), 3),
    right: ma(ref('volume'), 3) });
  const inputs = [{ sourceId: 'main', coordinate: 'research' as const, timeframe: '1d' as const,
    analysisStartAt: '2026-01-01T00:00:00Z', volumeBasis: 'unknown' as const,
    series: [series('open', Array(6).fill('100')), series('close', ['100', '100', '100', null, null, null]),
      series('volume', [null, null, null, '100', '100', '100'])] }];
  const plan = researchStrategyInputNeeds(value, { executionCoordinate: 'research' });
  const summary = buildResearchDataScope({ executionInstrument: asset, primaryTimeframe: '1d', sources: inputs });
  expect(researchScopeIssues(plan.needs, summary)).toEqual([]);
  const decisions = inputs[0]!.series[0]!.points.map((point) => point.occurredAt);
  expect(researchJointWindowIssues(plan.needs, inputs, decisions, inputs[0]!.analysisStartAt))
    .toMatchObject([{ code: 'DATA_SCOPE_JOINT_WINDOW', path: ['entry'] }]);
  inputs[0]!.series[1] = series('close', Array(6).fill('100'));
  expect(researchJointWindowIssues(plan.needs, inputs, decisions, inputs[0]!.analysisStartAt)).toEqual([]);
});

it('投入方式也服从冻结的能力许可，字段足够不能绕过本次投入范围', () => {
  const prepared = scope(Array(40).fill(null));
  prepared.sizingModes = ['equityRatio'];
  expect(researchStrategyScopeIssues(strategy(), prepared).issues)
    .toMatchObject([{ code: 'DATA_SCOPE_SIZING', path: ['sizing'] }]);
});
