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

it('历史条件不附加默认方式，双填错误的两个字段均可见并修复', () => {
  const original = { drawdownPercent: '0.05', activateWhen: condition };
  const changed = changeStrategyEditorVariant('trailing', original, 'currentAtr');
  expect(changed).toHaveProperty('activateWhen', condition);
  expect(changed).not.toHaveProperty('activation');
  expect(strategyEditorFields('trailing', original).map((field) => field.key)).toContain(
    'activateWhen',
  );
  const both = strategyEditorFields('trailing', {
    ...original,
    activation: { kind: 'immediate' },
  }).map((field) => field.key);
  expect(both).toContain('activation');
  expect(both).toContain('activateWhen');
});
