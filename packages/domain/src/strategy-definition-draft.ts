/** 编辑草稿允许不完整的业务配置；只有 JSON 语法和对象根节点在应用时校验。 */
export type StrategyDefinitionDraft = Record<string, unknown>;
export type StrategyDefinitionPath = readonly (string | number)[];

export function strategyDraftRecord(value: unknown): StrategyDefinitionDraft {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as StrategyDefinitionDraft)
    : {};
}

export function parseStrategyDefinitionDraft(text: string): StrategyDefinitionDraft {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error('JSON 格式无效，请检查括号、逗号和字符串引号。');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw Error('策略定义必须是 JSON 对象。');
  return value as StrategyDefinitionDraft;
}

export function strategyDraftValue(draft: unknown, path: StrategyDefinitionPath): unknown {
  return path.reduce<unknown>((value, key) => {
    if (Array.isArray(value)) return value[Number(key)];
    return strategyDraftRecord(value)[key];
  }, draft);
}

/** 仅复制修改路径，保留未知字段和原始十进制字符串；undefined 表示删除。 */
export function patchStrategyDefinitionDraft(
  draft: StrategyDefinitionDraft,
  path: StrategyDefinitionPath,
  next: unknown,
): StrategyDefinitionDraft {
  if (path.some((key) => ['__proto__', 'prototype', 'constructor'].includes(String(key))))
    throw Error('不支持的配置路径。');
  const patch = (value: unknown, depth: number): unknown => {
    if (depth === path.length) return next;
    const key = path[depth]!;
    if (typeof key === 'number') {
      const copy: unknown[] = Array.isArray(value) ? [...(value as unknown[])] : [];
      if (depth === path.length - 1 && next === undefined) copy.splice(key, 1);
      else copy[key] = patch(copy[key], depth + 1);
      return copy;
    }
    const copy = { ...strategyDraftRecord(value) };
    if (depth === path.length - 1 && next === undefined) delete copy[key];
    else copy[key] = patch(copy[key], depth + 1);
    return copy;
  };
  return strategyDraftRecord(patch(draft, 0));
}

export function strategySourceReferences(draft: unknown, sourceId: string) {
  const references: { path: (string | number)[]; fields: string[] }[] = [];
  const visit = (value: unknown, path: (string | number)[]) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, [...path, i]));
      return;
    }
    const row = strategyDraftRecord(value);
    if (row.sourceId === sourceId) {
      let fields: string[] = [];
      if (row.type === 'series' && typeof row.field === 'string') fields = [row.field];
      if (row.type === 'sessionValue') fields = row.field === 'vwap' ? ['close', 'volume'] : [];
      if (row.kind === 'entryAtr' || row.kind === 'currentAtr') fields = ['high', 'low', 'close'];
      references.push({ path, fields });
    }
    for (const [key, child] of Object.entries(row)) visit(child, [...path, key]);
  };
  visit(draft, []);
  return references;
}

export function renameStrategySource(draft: StrategyDefinitionDraft, index: number, id: string) {
  const sources = Array.isArray(draft.signalSources) ? draft.signalSources : [];
  const previous = strategyDraftRecord(sources[index]).id;
  if (!id.trim()) throw Error('来源标识不能为空。');
  if (sources.some((source, i) => i !== index && strategyDraftRecord(source).id === id))
    throw Error('来源标识不能重复。');
  if (sources.some((source, i) => i !== index && strategyDraftRecord(source).id === previous))
    throw Error('原来源标识存在重复，请先在高级 JSON 中确认引用归属。');
  let next = patchStrategyDefinitionDraft(draft, ['signalSources', index, 'id'], id);
  if (typeof previous === 'string') {
    for (const reference of strategySourceReferences(draft, previous))
      next = patchStrategyDefinitionDraft(next, [...reference.path, 'sourceId'], id);
  }
  return next;
}

export function removeStrategySource(draft: StrategyDefinitionDraft, index: number) {
  const source = strategyDraftRecord(strategyDraftValue(draft, ['signalSources', index]));
  if (typeof source.id === 'string') {
    const references = strategySourceReferences(draft, source.id);
    if (references.length)
      throw Error(`来源仍被引用：${references.map((r) => r.path.join('.')).join('、')}`);
  }
  return patchStrategyDefinitionDraft(draft, ['signalSources', index], undefined);
}

export function removeStrategySourceField(
  draft: StrategyDefinitionDraft,
  index: number,
  fieldIndex: number,
) {
  const source = strategyDraftRecord(strategyDraftValue(draft, ['signalSources', index]));
  const field: unknown = Array.isArray(source.series) ? source.series[fieldIndex] : undefined;
  if (Array.isArray(source.series) && source.series.filter((item) => item === field).length > 1)
    return patchStrategyDefinitionDraft(
      draft,
      ['signalSources', index, 'series', fieldIndex],
      undefined,
    );
  if (typeof source.id === 'string') {
    const references = strategySourceReferences(draft, source.id).filter((r) =>
      r.fields.includes(String(field)),
    );
    if (references.length)
      throw Error(`字段仍被引用：${references.map((r) => r.path.join('.')).join('、')}`);
  }
  return patchStrategyDefinitionDraft(
    draft,
    ['signalSources', index, 'series', fieldIndex],
    undefined,
  );
}

/** 显式复制当前执行标的／主周期；不建立后续隐式联动。 */
export function useStrategyExecutionForSource(
  draft: StrategyDefinitionDraft,
  index: number,
  key: 'asset' | 'timeframe',
) {
  const value = key === 'asset' ? draft.executionInstrument : draft.primaryTimeframe;
  return patchStrategyDefinitionDraft(draft, ['signalSources', index, key], value);
}
