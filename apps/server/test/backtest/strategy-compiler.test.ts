import { expect, it } from 'vitest';
import { compileBacktestStrategy, requireCompiledStrategy } from '../../src/backtest/backtest-strategy-compiler.js';
import { strategyOutlineV6Schema, generatedStrategyDefinitionV6Schema, strategySchema } from '@thesis-ledger/schemas';

const source = { id: 'main', timeframe: '1d', priceCoordinate: 'research',
  asset: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } } as const;
const close = { type: 'series', sourceId: 'main', field: 'close' } as const;
const off = { type: 'compare', operator: 'eq', left: { type: 'constant', value: '0' }, right: { type: 'constant', value: '1' } } as const;
const outline = () => ({ schemaVersion: 'strategy-definition-v1', name: '编译样本', entryTrigger: 'rising-edge',
  signalSources: [source], executionInstrument: source.asset, primaryTimeframe: '1d',
  entry: { type: 'compare', operator: 'gt', left: close,
    right: { type: 'indicator', name: 'MA', input: close, params: { period: 20 } } }, exit: off,
  sizing: { type: 'fixedAmount', amount: '1000' }, risk: [],
  execution: { mode: 'exchange', timing: 'nextEligibleBarOpen', orderType: 'market', timeInForce: 'DAY' },
  cost: { commissionRate: '0', slippageRate: '0' },
});

it('新结构不再接收重复字段，编译从AST及ATR保护派生字段而不修改原文', () => {
  const value = { ...outline(), tradePlan: { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'entryAtr', sourceId: 'main',
    period: 14, multiple: '2', activation: { kind: 'immediate' } } } };
  const before = JSON.stringify(value);
  const parsed = generatedStrategyDefinitionV6Schema.safeParse(value);
  expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
  const output = requireCompiledStrategy(value);
  expect(output.definition.signalSources[0]?.series).toEqual(['close', 'high', 'low']);
  expect(output.definition.entry).toEqual(value.entry);
  expect(output.definition.tradePlan).toEqual(value.tradePlan);
  expect(JSON.stringify(value)).toBe(before);
  expect(strategyOutlineV6Schema.safeParse({ ...value, signalSources: [{ ...source, series: ['close'] }] }).success).toBe(false);
});

it('未知来源与无绑定事件值一次报告，不能新增来源或capture', () => {
  const value = { ...outline(), entry: { type: 'compare', operator: 'gt',
    left: { ...close, sourceId: 'missing' }, right: { type: 'eventValue' } } };
  const before = JSON.stringify(value), output = compileBacktestStrategy(value);
  expect(output.status).toBe('rejected');
  expect(output.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'UNDECLARED_SOURCE', path: ['entry', 'left', 'sourceId'] }),
    expect.objectContaining({ code: 'EVENT_VALUE_UNBOUND', path: ['entry', 'right'] }),
  ]));
  expect(output.candidate?.signalSources.map((item) => item.id)).toEqual(['main']);
  expect(output.candidate?.entry).toEqual(value.entry);
  expect(JSON.stringify(value)).toBe(before);
  expect(() => requireCompiledStrategy(value)).toThrow('编译与正式校验');
});

it('事件生成区分有无capture，程序原样保留capture、lag及阈值', () => {
  const entry = { type: 'sequence', trigger: outline().entry,
    capture: { type: 'lag', periods: 1, input: close },
    confirm: { type: 'compare', operator: 'gt', left: close, right: { type: 'eventValue' } },
    invalidation: off, within: 7, allowSameBar: false, repeat: false };
  const value = { ...outline(), entry };
  expect(generatedStrategyDefinitionV6Schema.safeParse(value).success).toBe(true);
  expect(requireCompiledStrategy(value).definition.entry).toEqual(entry);
  const unbound = { ...value, entry: { ...entry } }; delete (unbound.entry as { capture?: unknown }).capture;
  expect(generatedStrategyDefinitionV6Schema.safeParse(unbound).success).toBe(false);
  expect(compileBacktestStrategy(unbound).diagnostics.some((issue) => issue.code === 'EVENT_VALUE_UNBOUND')).toBe(true);
});

it('编译保留来源声明与实际字段，旧定义版本被拒绝', () => {
  const empty = { ...outline(), entry: off, signalSources: [] };
  expect(requireCompiledStrategy(empty).definition.signalSources).toEqual([]);
  const unused = requireCompiledStrategy({ ...empty, signalSources: [source] });
  expect(unused.definition.signalSources).toEqual([{ ...source, series: [] }]);
  expect(strategySchema.safeParse({ ...unused.definition, schemaVersion: '2' }).success).toBe(false);
  const otherPeriod = { ...outline(), signalSources: [{ ...source, timeframe: '60m' }] };
  expect(requireCompiledStrategy(otherPeriod).definition.signalSources[0]?.timeframe).toBe('60m');
});

it('结构错误保留具体位置并停止编译，不把错误输出改写成候选', () => {
  const value = { ...outline(), signalSources: [{ ...source, timeframe: '2h' }] };
  const output = compileBacktestStrategy(value);
  expect(output.status).toBe('rejected');
  expect(output.candidate).toBeUndefined();
  expect(output.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: 'structure', code: 'STRUCTURE_INVALID', path: ['signalSources', 0, 'timeframe'] }),
  ]));
});
