import { describe, expect, it } from 'vitest';
import {
  matchesFinalizationSelection,
  parseExperimentAction,
} from '../src/features/optimization-results/experiment-actions';
const candidateId = '11111111-1111-4111-8111-111111111111';
const body = {
  candidateIds: [candidateId],
  selectedCandidateId: null,
  expectedStage: 'awaiting_finalization' as const,
};

describe('移动端测试候选凭据', () => {
  it('原实验失败重试保存幂等键和执行 attempt，丢失响应后仍找回同一请求', () => {
    const retry = { id: 'experiment', action: 'retry', body: { idempotencyKey: 'retry-1', expectedExecutionAttempt: 3 } };
    expect(parseExperimentAction(retry)).toEqual(retry);
    expect(() => parseExperimentAction({ ...retry, body: { idempotencyKey: 'retry-1' } })).toThrow();
  });
  it('按实验身份保存重试意图，不保存新的候选选择', () => {
    expect(parseExperimentAction({ id: 'experiment', action: 'complete', body: {} }))
      .toEqual({ id: 'experiment', action: 'complete', body: {} });
    expect(() => parseExperimentAction({ id: 'experiment', action: 'complete', body: { candidateIds: [candidateId] } })).toThrow();
  });
  it('无预选的请求可以保存并恢复', () => {
    expect(parseExperimentAction({ id: 'experiment', action: 'finalize', body })).toEqual({
      id: 'experiment',
      action: 'finalize',
      body,
    });
  });
  it('恢复必须匹配完整集合及原预选状态', () => {
    expect(
      matchesFinalizationSelection(body, {
        lockedCandidateIds: [candidateId],
        exposure: { preselectedCandidateId: null },
      }),
    ).toBe(true);
    expect(
      matchesFinalizationSelection(body, {
        lockedCandidateIds: [candidateId],
        exposure: { preselectedCandidateId: candidateId },
      }),
    ).toBe(false);
    expect(
      matchesFinalizationSelection(body, {
        lockedCandidateIds: [candidateId, 'other'],
        exposure: { preselectedCandidateId: null },
      }),
    ).toBe(false);
  });
});
