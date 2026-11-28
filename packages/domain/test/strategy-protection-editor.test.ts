import { expect, it } from 'vitest';
import {
  strategyEditorFields,
  strategyEditorInitial,
  strategyEditorVariant,
  changeStrategyEditorVariant,
} from '../src/strategy-definition-editor.js';

const condition = { type: 'positionState', field: 'isOpen' };
it('显式启用方式可编辑，切换为立即启用移除条件，距离切换保留启用方式', () => {
  const activation = { kind: 'condition', condition };
  expect(strategyEditorInitial('protectionActivation')).toEqual({ kind: 'immediate' });
  expect(strategyEditorVariant('protectionActivation', activation)).toBe('condition');
  expect(strategyEditorFields('protectionActivation', activation)).toEqual([
    { key: 'condition', label: '启用条件', kind: 'object', context: 'boolean' },
  ]);
  expect(changeStrategyEditorVariant('protectionActivation', activation, 'immediate')).toEqual({
    kind: 'immediate',
  });
  const original = { kind: 'percent', percent: '0.05', activation };
  expect(changeStrategyEditorVariant('stop', original, 'entryAtr')).toMatchObject({
    kind: 'entryAtr',
    activation,
  });
  expect(original).toEqual({ kind: 'percent', percent: '0.05', activation });
});

it('切换追踪距离类型保留显式启用条件', () => {
  const activation = { kind: 'condition', condition };
  const original = { activation, drawdownPercent: '0.05' };
  const atr = changeStrategyEditorVariant('trailing', original, 'currentAtr');
  expect(atr).toEqual({ activation, kind: 'currentAtr', sourceId: '', period: 14, multiple: '2' });
  expect(strategyEditorFields('trailing', atr).map((field) => field.key)).toEqual([
    'sourceId', 'period', 'multiple', 'activation', 'activationGainPercent', 'breakEvenGainPercent',
  ]);
  expect(changeStrategyEditorVariant('trailing', atr, 'percent')).toEqual(original);
});
