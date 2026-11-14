import { describe, expect, it } from 'vitest';
import { optimizationFinalizeSchema } from '../src/strategy-optimization.js';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const body = { candidateIds: [id], expectedStage: 'awaiting_finalization' };

describe('封存测试的可选预选采纳', () => {
  it.each([{}, { selectedCandidateId: null }])('没有预选时保留批次并规范为空值', (selection) => {
    expect(optimizationFinalizeSchema.parse({ ...body, ...selection })).toEqual({
      ...body,
      selectedCandidateId: null,
    });
  });
  it('兼容批次内预选，拒绝批次外预选', () => {
    expect(
      optimizationFinalizeSchema.parse({ ...body, selectedCandidateId: id }).selectedCandidateId,
    ).toBe(id);
    expect(
      optimizationFinalizeSchema.safeParse({ ...body, selectedCandidateId: other }).success,
    ).toBe(false);
  });
  it('没有测试候选时仍不能提交', () => {
    expect(optimizationFinalizeSchema.safeParse({ ...body, candidateIds: [] }).success).toBe(false);
  });
});
