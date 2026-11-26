import type { StrategyEditorField } from './strategy-definition-editor.js';
import type { StrategyDefinitionDraft } from './strategy-definition-draft.js';

export function strategyProtectionEditorVariants(
  context: string,
  condition: StrategyDefinitionDraft,
): Record<string, StrategyDefinitionDraft> | undefined {
  if (context === 'stop')
    return {
      percent: { activation: { kind: 'immediate' }, kind: 'percent', percent: '0.05' },
      entryAtr: {
        activation: { kind: 'immediate' },
        kind: 'entryAtr',
        sourceId: '',
        period: 14,
        multiple: '2',
      },
    };
  if (context === 'trailing')
    return {
      percent: { activation: { kind: 'immediate' }, drawdownPercent: '0.05' },
      currentAtr: {
        activation: { kind: 'immediate' },
        kind: 'currentAtr',
        sourceId: '',
        period: 14,
        multiple: '2',
      },
    };
  if (context === 'protectionActivation')
    return {
      immediate: { kind: 'immediate' },
      condition: { kind: 'condition', condition },
    };
}

export function strategyProtectionEditorFields(
  context: string,
  row: Record<string, unknown>,
): StrategyEditorField[] {
  if (context === 'protectionActivation')
    return row.kind === 'condition'
      ? [{ key: 'condition', label: '启用条件', kind: 'object', context: 'boolean' }]
      : [];
  const fields: StrategyEditorField[] =
    row.kind === 'entryAtr' || row.kind === 'currentAtr'
      ? [
          { key: 'sourceId', label: 'ATR 来源', kind: 'text' },
          { key: 'period', label: 'ATR 周期', kind: 'integer' },
          { key: 'multiple', label: 'ATR 倍数（不除以100）', kind: 'text' },
        ]
      : [
          {
            key: context === 'stop' ? 'percent' : 'drawdownPercent',
            label: '保护幅度比例',
            kind: 'text',
            help: '按小数比例填写：0.005 = 0.5%，0.5 = 50%。',
          },
        ];
  fields.push({
      key: 'activation',
      label: '启用方式',
      kind: 'object',
      context: 'protectionActivation',
      optional: true,
    });
  if (context === 'trailing')
    for (const [key, label] of [
      ['activationGainPercent', '启用浮盈比例'],
      ['breakEvenGainPercent', '保本浮盈比例'],
    ] as const)
      fields.push({
        key,
        label,
        kind: 'text',
        optional: true,
        help: '按小数比例填写：0.005 = 0.5%，0.5 = 50%。',
      });
  return fields;
}

/** 距离类型切换保留已选启用方式。 */
export function preserveProtectionActivation(
  row: Record<string, unknown>,
  value: Record<string, unknown>,
) {
  if (row.activation !== undefined) value.activation = structuredClone(row.activation);
  return value;
}
