import { describe, expect, it, vi } from 'vitest';
import { prepareBacktestExecution } from '../../src/backtest/backtest-execution-owner.js';

const prepare = (job: Record<string, unknown>) => {
  const findUnique = vi.fn(async () => job);
  const updateMany = vi.fn();
  const prisma = { backtestJob: { findUnique, updateMany } };
  return { result: prepareBacktestExecution(prisma as never, String(job.id), 3), updateMany };
};

describe('现行回测持久化领取', () => {
  it.each(['V1', 'V2'])('旧 %s 记录不再领取且不改写状态', async (mode) => {
    const { result, updateMany } = prepare({
      id: 'old-run',
      mode,
      status: 'queued',
      executionAttempt: 1,
      cancelRequestedAt: null,
      input: { schemaVersion: mode === 'V1' ? '1' : '2' },
    });
    await expect(result).resolves.toEqual({ action: 'skip', reason: 'unsupported_contract' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('现行记录从 PostgreSQL attempt=1 继续领取 ownerAttempt=2', async () => {
    const { result, updateMany } = prepare({
      id: 'current-run',
      mode: 'V3',
      status: 'queued',
      executionAttempt: 1,
      cancelRequestedAt: null,
      input: { contractVersion: 3, schemaVersion: '3' },
    });
    await expect(result).resolves.toEqual({ action: 'run', ownerAttempt: 2, maxAttempts: 3 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('仍处于 running 的现行 owner 不被新运输记录抢占', async () => {
    const { result } = prepare({
      id: 'current-run',
      mode: 'V3',
      status: 'running',
      executionAttempt: 2,
      cancelRequestedAt: null,
      input: { contractVersion: 3, schemaVersion: '3' },
    });
    await expect(result).resolves.toEqual({ action: 'skip', reason: 'already_running' });
  });
});
