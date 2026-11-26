import { isEqual } from 'es-toolkit';
import { parseStrategyDefinitionDraft } from '@thesis-ledger/domain';
import {
  strategySchema,
  strategyDefinitionCreateSchema,
  type StrategyDefinitionRead,
  projectStrategyEntryPolicyForEditing,
} from '@thesis-ledger/schemas';
export const initialStrategyDefinition = (name: string) => ({
  schemaVersion: 'strategy-definition-v1',
  entryTrigger: 'rising-edge',
  name,
  description: '示例规则，保存前请核对信号、执行与成本。',
  signalSources: [
    {
      id: 'execution',
      priceCoordinate: 'research',
      asset: { symbol: '', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['open', 'close'],
    },
  ],
  executionInstrument: { symbol: '', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'series', sourceId: 'execution', field: 'open' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedAmount', amount: '10000' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
});
export function definitionRecord(text: string): Record<string, unknown> {
  return parseStrategyDefinitionDraft(text);
}
export function validatedDefinition(text: string) {
  const value = definitionRecord(text);
  if (value.entryTrigger === undefined) throw Error('入场政策：请选择并核对入场方式后保存新版本。');
  const parsed = strategySchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw Error(`${first?.path.join('.')}：${first?.message ?? '定义无效'}`);
  }
  return value;
}

/** 原待确认保存回执不改；可编辑草稿按原版本政策投影并保留未应用JSON。 */
export function projectStrategyEditorDraft<T extends { text: string; definition?: Record<string, unknown>; pending: unknown }>(draft: T, baseline?: unknown): T {
  if (draft.pending) return draft;
  let parsed: Record<string, unknown>;
  try { parsed = definitionRecord(draft.text); }
  catch { return draft; }
  const definition = projectStrategyEntryPolicyForEditing(draft.definition ?? parsed, baseline ?? parsed);
  const text = JSON.stringify(projectStrategyEntryPolicyForEditing(parsed, baseline ?? parsed), null, 2);
  return { ...draft, definition, text };
}
export type PendingStrategySave = {
  name: string;
  schema: Record<string, unknown>;
  strategyId?: string;
  baselineIds: string[];
};
export function parsePendingStrategySave(value: unknown): PendingStrategySave {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('待确认保存记录无效。');
  const row = value as Record<string, unknown>;
  const body = strategyDefinitionCreateSchema.parse({ name: row.name, schema: row.schema });
  if (
    !Array.isArray(row.baselineIds) ||
    !row.baselineIds.every((x) => typeof x === 'string') ||
    (row.strategyId !== undefined && typeof row.strategyId !== 'string')
  )
    throw Error('保存基线无效。');
  return {
    ...body,
    baselineIds: row.baselineIds,
    ...(typeof row.strategyId === 'string' ? { strategyId: row.strategyId } : {}),
  };
}
/** 只认原基线之后、定义完全一致的唯一回执；列表读取失败由调用方保留原凭据。 */
export function recoverStrategySave(pending: PendingStrategySave, rows: StrategyDefinitionRead[]) {
  if (pending.strategyId) {
    const owner = rows.find((v) => v.id === pending.strategyId);
    const matches =
      owner?.versions.filter(
        (v) => !pending.baselineIds.includes(v.id) && isEqual(v.schema, pending.schema),
      ) ?? [];
    return matches.length === 1
      ? { strategyId: pending.strategyId, versionId: matches[0]!.id }
      : null;
  }
  const matches = rows.filter(
    (v) =>
      !pending.baselineIds.includes(v.id) &&
      v.name.trim() === pending.name.trim() &&
      v.versions.some((version) => isEqual(version.schema, pending.schema)),
  );
  if (matches.length !== 1) return null;
  const versions = matches[0]!.versions.filter((v) => isEqual(v.schema, pending.schema));
  return versions.length === 1 ? { strategyId: matches[0]!.id, versionId: versions[0]!.id } : null;
}
