import { describe, expect, it } from 'vitest';
import {
  aiProviderDraft,
  buildAiProviderInput,
  researchCandidateReason,
} from '../../src/features/ai-providers/ai-provider-draft';
import { aiProviderRecordSchema, aiProviderInputSchema } from '@thesis-ledger/schemas';
import { b5Ai } from './batch5-fixture';
describe('第 5 批配置语义与秘密边界', () => {
  it('编辑只从安全摘要生成，密钥没有草稿字段，未知费用不会转换为零', () => {
    const row = aiProviderRecordSchema.parse({ ...b5Ai, apiKey: 'fixture-dummy' });
    const draft = aiProviderDraft(row);
    expect(JSON.stringify(draft)).not.toContain('fixture-dummy');
    expect(draft.modelPricing).toBe('{}');
    const input = buildAiProviderInput(draft, 'fixture-new', row);
    expect(input.expectedRevision).toBe(b5Ai.updatedAt);
    expect(input.apiKey).toBe('fixture-new');
    expect(input.modelPricing).toEqual({});
  });
  it('未填写、零价格及非法超时分别处理，协议约束不能被 JSON 绕过', () => {
    const row = aiProviderRecordSchema.parse(b5Ai);
    const draft = aiProviderDraft(row);
    const input = buildAiProviderInput(
      { ...draft, modelPricing: '{"fixture":{"costPer1kInput":0,"costCurrency":"USD"}}' },
      '',
      row,
    );
    expect(input.modelPricing?.fixture?.costPer1kInput).toBe(0);
    expect(input.modelPricing?.fixture?.costPer1kOutput).toBeUndefined();
    expect(() => buildAiProviderInput({ ...draft, firstOutputTimeoutMs: '-1' }, '', row)).toThrow();
    expect(() => buildAiProviderInput({ ...draft, modelPricing: '{invalid}' }, '', row)).toThrow();
    expect(
      buildAiProviderInput({ ...draft, authMode: 'none' }, 'fixture-new', row),
    ).not.toHaveProperty('apiKey');
    expect(() =>
      aiProviderInputSchema.parse({ ...input, authMode: 'none', apiKey: 'fixture-new' }),
    ).toThrow();
  });
  it('健康连接与已填价格不足以开放默认用途', () => {
    const row = aiProviderRecordSchema.parse({ ...b5Ai, enabled: true, health: 'healthy' });
    expect(researchCandidateReason(row, 'fixture', false)).toContain('费用');
    expect(researchCandidateReason(row, 'fixture', true)).toContain('研究用途');
  });
});
