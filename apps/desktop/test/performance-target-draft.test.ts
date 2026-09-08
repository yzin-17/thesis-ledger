import { describe, expect, it } from 'vitest';
import { validateTargetDraft } from '../src/features/performance/performance.target-draft.js';

describe('配置目标草稿校验', () => {
  it('新增分类允许组成完整目标', () => {
    expect(validateTargetDraft([{ id: 'stock', category: 'stock', percent: 100 }]).valid).toBe(
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
        { id: 'one', category: 'stock', percent: 50 },
        { id: 'two', category: 'stock', percent: 50 },
      ]),
    ).toMatchObject({ total: 100, duplicate: true, valid: false });
    expect(validateTargetDraft([{ id: 'old', category: 'unknown', percent: 100 }])).toMatchObject({
      unknown: true,
      valid: false,
    });
  });
});
