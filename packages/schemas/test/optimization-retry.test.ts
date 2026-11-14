import { describe, expect, it } from 'vitest';
import {
  optimizationRetryRequestSchema,
  optimizationRetryStateSchema,
  canRetryOptimizationExperiment,
} from '../src/optimization-retry.js';

describe('原地实验重试合同', () => {
  it('请求绑定预期 attempt 与幂等身份，拒绝重置预算或改配置', () => {
    const request = { idempotencyKey: 'retry-1', expectedExecutionAttempt: 2 };
    expect(optimizationRetryRequestSchema.parse(request)).toEqual(request);
    expect(() => optimizationRetryRequestSchema.parse({ ...request, budget: {} })).toThrow();
    expect(() =>
      optimizationRetryRequestSchema.parse({
        ...request,
        expectedExecutionAttempt: -1,
      }),
    ).toThrow();
  });
  it('历史空状态没有未知请求授权，只有未锁定失败实验展示入口', () => {
    expect(optimizationRetryStateSchema.parse({})).toEqual({
      roundOffset: 0,
      history: [],
      allowedUnknownAttemptIds: [],
    });
    expect(canRetryOptimizationExperiment({ status: 'failed' })).toBe(true);
    for (const status of [
      'queued',
      'running',
      'cancelled',
      'succeeded',
      'testing',
      'awaiting_finalization',
    ])
      expect(canRetryOptimizationExperiment({ status })).toBe(false);
    expect(
      canRetryOptimizationExperiment({
        status: 'failed',
        lockedCandidateIds: ['locked'],
      }),
    ).toBe(false);
  });
});
