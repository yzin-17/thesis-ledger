import { describe, expect, it } from 'vitest';
import {
  parseStrategyDefinitionDraft,
  patchStrategyDefinitionDraft,
  renameStrategySource,
  removeStrategySource,
  removeStrategySourceField,
  useStrategyExecutionForSource,
  appendStrategyEditorItem,
  changeStrategyEditorVariant,
  editStrategyDefinition,
} from '../src/index.js';

const sample = () => ({
  schemaVersion: '3',
  executionInstrument: { symbol: 'SPY.US', market: 'US', assetType: 'etf' },
  primaryTimeframe: '1d',
  signalSources: [
    {
      id: 'execution',
      asset: { symbol: '600519.SH' },
      timeframe: '60m',
      series: ['open', 'high', 'low', 'close', 'volume'],
    },
    { id: 'other', series: ['close'] },
  ],
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'constant', value: '0.005000000000000001' },
  },
  exit: { type: 'unknown', sourceId: 'execution', extra: { keep: true } },
  tradePlan: {
    initialStop: {
      kind: 'entryAtr',
      sourceId: 'execution',
      period: 14,
      multiple: '2',
      activateWhen: { type: 'sessionValue', sourceId: 'execution', field: 'vwap' },
    },
    trailing: { kind: 'currentAtr', sourceId: 'execution' },
  },
  extension: { precision: '0.000000000000000001', untouched: [null, true] },
});
describe('共享策略编辑草稿', () => {
  it('只在应用阶段要求合法对象，业务错误和未知节点完整保留', () => {
    for (const text of ['null', '[]', '1', '"x"', '{'])
      expect(() => parseStrategyDefinitionDraft(text)).toThrow();
    expect(
      parseStrategyDefinitionDraft('{"schemaVersion":"future","entry":{"type":"unknown"}}'),
    ).toEqual({ schemaVersion: 'future', entry: { type: 'unknown' } });
  });
  it('只改指定路径，保留精度、扩展字段和原对象', () => {
    const original = sample(),
      before = structuredClone(original);
    const next = patchStrategyDefinitionDraft(original, ['entry', 'right', 'value'], '0.005');
    expect(next).toMatchObject({
      entry: { right: { value: '0.005' } },
      extension: original.extension,
    });
    expect(next.extension).toBe(original.extension);
    expect(original).toEqual(before);
    expect(() => patchStrategyDefinitionDraft(original, ['__proto__', 'x'], 1)).toThrow();
  });
  it('重命名原子更新普通条件、未知引用、ATR 和启用条件，不修改原定义', () => {
    const original = sample(),
      before = structuredClone(original);
    const next = renameStrategySource(original, 0, 'daily');
    expect(JSON.stringify(next)).not.toContain('"sourceId":"execution"');
    expect(next).toMatchObject({
      entry: { left: { sourceId: 'daily' } },
      tradePlan: {
        initialStop: { sourceId: 'daily', activateWhen: { sourceId: 'daily' } },
        trailing: { sourceId: 'daily' },
      },
    });
    expect((next.signalSources as { id: string }[])[0]!.id).toBe('daily');
    expect(original).toEqual(before);
    expect(() => renameStrategySource(original, 0, 'other')).toThrow('重复');
    expect(() => renameStrategySource(original, 0, '')).toThrow('不能为空');
  });
  it('删除与替换字段都检查引用，保护 ATR 三价和会话累计量；无引用字段可删除', () => {
    const original = sample();
    expect(() => removeStrategySource(original, 0)).toThrow('entry.left');
    for (const index of [1, 2, 3, 4])
      expect(() => removeStrategySourceField(original, 0, index)).toThrow('仍被引用');
    expect(() =>
      editStrategyDefinition(original, ['signalSources', 0, 'series', 3], 'open'),
    ).toThrow();
    expect(
      (removeStrategySourceField(original, 0, 0).signalSources as { series: string[] }[])[0]!
        .series,
    ).toEqual(['high', 'low', 'close', 'volume']);
    expect(removeStrategySource(original, 1).signalSources as unknown[]).toHaveLength(1);
  });
  it('执行标的与主周期只有显式复制才改变来源；添加标识不冲突', () => {
    const original = sample();
    expect(
      (useStrategyExecutionForSource(original, 0, 'asset').signalSources as unknown[])[0],
    ).toMatchObject({ asset: original.executionInstrument, timeframe: '60m' });
    expect(
      (useStrategyExecutionForSource(original, 0, 'timeframe').signalSources as unknown[])[0],
    ).toMatchObject({ asset: original.signalSources[0]!.asset, timeframe: '1d' });
    const once = appendStrategyEditorItem(original, ['signalSources'], 'source');
    const twice = appendStrategyEditorItem(once, ['signalSources'], 'source');
    expect((twice.signalSources as { id: string }[]).map((s) => s.id)).toEqual([
      'execution',
      'other',
      'source1',
      'source2',
    ]);
  });
  it('切换规则只移除旧规则的已知字段，保留扩展字段', () => {
    expect(
      changeStrategyEditorVariant(
        'sizing',
        { type: 'fixedAmount', amount: '10', future: 'keep' },
        'fixedQuantity',
      ),
    ).toEqual({ type: 'fixedQuantity', quantity: '100', future: 'keep' });
  });
});
