import { describe, expect, it, vi } from 'vitest';
import { prepareBacktestExecution } from '../../src/backtest/backtest-execution-owner.js';

const statefulRun = (input: Record<string, unknown>, executionAttempt: number) => {
  let job = {
    id: 'current-run',
    mode: 'V3',
    status: 'queued',
    cancelRequestedAt: null,
    executionAttempt,
    input: { contractVersion: 3, schemaVersion: '3', ...input },
  };
  const updateMany = vi.fn(async ({ data }: { data: Partial<typeof job> }) => {
    job = { ...job, ...data };
    return { count: 1 };
  });
  const prisma = { backtestJob: { findUnique: vi.fn(async () => job), updateMany } };
  return {
    prepare: () => prepareBacktestExecution(prisma as never, job.id, 3),
    read: () => job,
    updateMany,
  };
};

describe('现行 Run 重试预算隔离', () => {
  it.each([
    [{ retryAttemptBase: 'invalid' }, 1],
    [{ retryAttemptBase: 0 }, 3],
  ])('预算收敛拒绝读取后变为旧模式的记录', async (input, executionAttempt) => {
    const snapshot = {
      mode: 'V3',
      status: 'queued',
      executionAttempt,
      cancelRequestedAt: null,
      input: { contractVersion: 3, schemaVersion: '3', ...input },
    };
    const persisted = { ...snapshot, mode: 'V2' };
    const updateMany = vi.fn(async ({ where, data }) => {
      if (where.mode !== persisted.mode) return { count: 0 };
      Object.assign(persisted, data);
      return { count: 1 };
    });
    await prepareBacktestExecution(
      {
        backtestJob: {
          findUnique: vi.fn(async () => snapshot),
          updateMany,
        },
      } as never,
      'current-run',
      3,
    );
    expect(updateMany).toHaveBeenCalledOnce();
    expect(persisted).toEqual({ ...snapshot, mode: 'V2' });
  });

  it('手动重试从持久化基数计算三次执行上限', async () => {
    const state = statefulRun({ retryAttemptBase: 4 }, 4);
    await expect(state.prepare()).resolves.toEqual({
      action: 'run',
      ownerAttempt: 5,
      maxAttempts: 7,
    });
    expect(state.updateMany).not.toHaveBeenCalled();
  });

  it('预算耗尽时原子收敛为失败', async () => {
    const state = statefulRun({ retryAttemptBase: 4 }, 7);
    await expect(state.prepare()).resolves.toEqual({
      action: 'skip',
      reason: 'attempts_exhausted',
    });
    expect(state.read()).toMatchObject({
      status: 'failed',
      errorCode: 'worker_attempts_exhausted',
    });
    expect(state.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ executionAttempt: 7 }) }),
    );
  });

  it.each(['1', -1, 1.5, 2])('无效预算基数 %s 在执行前失败', async (retryAttemptBase) => {
    const state = statefulRun({ retryAttemptBase }, 1);
    await expect(state.prepare()).resolves.toEqual({
      action: 'skip',
      reason: 'invalid_retry_budget',
    });
    expect(state.read()).toMatchObject({ status: 'failed', errorCode: 'invalid_retry_budget' });
  });
});
