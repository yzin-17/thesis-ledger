import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { backtestPreparationFailureInputSchema } from '@thesis-ledger/schemas';
import { assertCurrentRunForRead, isCurrentRunForRead } from '../../src/backtest/backtest-current-run-read.js';
import { recordBacktestPreparationFailure } from '../../src/backtest/backtest-preparation-failure.js';
import { preparationFailureFixture } from './preparation-failure.fixture.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';

describe('准备失败的独立终态读取合同', () => {
  it('保留原请求并允许无正式配置和快照的失败读取', async () => {
    const { preparation } = await preparationFailureFixture();
    const upsert = vi.fn(async ({ create }) => ({ ...create, id: randomUUID(), runConfig: null,
      snapshotManifest: null, snapshotId: null, result: null, resultChecksum: null }));
    const job = await recordBacktestPreparationFailure({ backtestJob: { upsert } } as never, {
      submissionId: randomUUID(), preparation, reason: '行情区间不完整', createdAt: new Date(),
    });
    expect(backtestPreparationFailureInputSchema.parse(job.input).preparation).toEqual(preparation);
    expect(job).toMatchObject({ status: 'failed', stage: 'preparation-failed' });
    expect(() => assertCurrentRunForRead(job)).not.toThrow();
    expect(isCurrentRunForRead(job)).toBe(true);
    const enqueue = vi.fn();
    const retryRun = vi.fn();
    const service = new BacktestService({ backtestJob: { findUnique: async () => job } } as never,
      { ensureEnqueued: enqueue } as never, { retryRun } as never, {} as never);
    await expect(service.runCurrentRunForRead(job.id)).rejects.toThrow('准备阶段失败');
    await expect(service.retryCurrentRunForRead(job.id)).rejects.toThrow('准备阶段失败');
    expect(enqueue).not.toHaveBeenCalled(); expect(retryRun).not.toHaveBeenCalled();
    for (const patch of [{ status: 'queued' }, { status: 'succeeded' }, { result: {} },
      { runConfig: {} }, { snapshotId: 'fabricated' }, { snapshotManifest: {} },
      { strategyVersionId: randomUUID() }, { errorCode: 'UNKNOWN' }]) {
      expect(isCurrentRunForRead({ ...job, ...patch })).toBe(false);
    }
  });

  it('拒绝复用为另一请求的幂等记录', async () => {
    const { preparation } = await preparationFailureFixture();
    await expect(recordBacktestPreparationFailure({ backtestJob: {
      upsert: async () => ({ input: { unrelated: true } }),
    } } as never, { submissionId: randomUUID(), preparation, reason: '失败', createdAt: new Date() }))
      .rejects.toThrow('其他回测任务');
  });
});
