import { describe, expect, it } from 'vitest';
import { optimizationAttemptFailureStatus, optimizationRemainingDurationMs } from '../../src/strategy-optimization/strategy-optimization-common.js';

describe('strategy optimization duration budget', () => {
  it('uses maxDurationSeconds as a hard elapsed-time budget', () => {
    const createdAt = new Date('2026-09-11T00:00:00.000Z');
    expect(optimizationRemainingDurationMs({ createdAt, budget: { maxDurationSeconds: 120 } }, createdAt.getTime() + 30_000)).toBe(90_000);
    expect(optimizationRemainingDurationMs({ createdAt, budget: { maxDurationSeconds: 120 } }, createdAt.getTime() + 121_000)).toBe(0);
  });

  it('marks timeout and abort ambiguity as unknown_outcome', () => {
    const timeout = new Error('timeout');
    timeout.name = 'TimeoutError';
    const abort = new Error('abort');
    abort.name = 'AbortError';
    expect(optimizationAttemptFailureStatus(timeout)).toBe('unknown_outcome');
    expect(optimizationAttemptFailureStatus(abort)).toBe('unknown_outcome');
    expect(optimizationAttemptFailureStatus(new Error('validation'))).toBe('failed');
  });
});
