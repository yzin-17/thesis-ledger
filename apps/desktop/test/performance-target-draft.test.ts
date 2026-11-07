import { describe, expect, it } from 'vitest';
import {
  rowsFromTargets,
  validateTargetDraft,
} from '../src/features/performance/performance.target-draft.js';

describe('配置目标草稿校验', () => {
  it('新增分类允许组成完整目标', () => {
    expect(validateTargetDraft([{ id: 'stock', category: 'stock', percent: '100' }]).valid).toBe(
      true,
    );
  });
  it('空草稿和未输入金额不能保存', () => {
    expect(validateTargetDraft([]).valid).toBe(false);
    expect(validateTargetDraft([{ id: 'stock', category: 'stock', percent: null }]).valid).toBe(
      false,
    );
  });
  it('合计为一百也不能保存重复或未知分类', () => {
    expect(
      validateTargetDraft([
        { id: 'one', category: 'stock', percent: '50' },
        { id: 'two', category: 'stock', percent: '50' },
      ]),
    ).toMatchObject({ total: 100, duplicate: true, valid: false });
    expect(validateTargetDraft([{ id: 'old', category: 'unknown', percent: '100' }])).toMatchObject(
      {
        unknown: true,
        valid: false,
      },
    );
  });
  it.each(['-1', '101', 'abc', 'Infinity', '1e-999', ''])('拒绝无效目标文本 %s', (percent) => {
    expect(validateTargetDraft([{ id: 'stock', category: 'stock', percent }])).toMatchObject({
      invalidNumber: true,
      valid: false,
    });
  });
  it('合计采用服务端权重容差，不能以显示为 100.00% 代替有效合计', () => {
    expect(
      validateTargetDraft([{ id: 'stock', category: 'stock', percent: '99.9995' }]),
    ).toMatchObject({ totalValid: false, valid: false });
    expect(
      validateTargetDraft([{ id: 'stock', category: 'stock', percent: '99.9999995' }]).valid,
    ).toBe(true);
  });
  it('旧分类按领域权重归并，保留未知项并投影完整百分比文本', () => {
    expect(rowsFromTargets({ stock: 1 / 6, 股票: 1 / 6, cash: 2 / 3, legacy: 0 })).toEqual([
      { id: 'stock', category: 'stock', percent: '33.33333333333333' },
      { id: 'cash', category: 'cash', percent: '66.66666666666666' },
      { id: 'legacy-3', category: 'legacy', percent: '0' },
    ]);
  });
});
