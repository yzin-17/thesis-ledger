import { describe, expect, it, vi } from 'vitest';
import { BacktestQueueService } from '../../src/backtest/backtest-queue.service.js';

describe('NAV Run 队列边界', () => {
  it.each([
    { inputKind: 'nav' },
    { runConfig: { navInput: { kind: 'nav', symbol: '110011.OF' } } },
  ])('拒绝派发 NAV 标记记录 %#', async (input) => {
    const job = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      mode: 'V3',
      status: 'queued',
      executionAttempt: 0,
      input: { contractVersion: 3, schemaVersion: '3', ...input },
    };
    const prisma = {
      backtestJob: {
        findUnique: vi.fn(async () => job),
        update: vi.fn(),
      },
    };
    const queue = { add: vi.fn(), getState: vi.fn() };
    const events = { publishJob: vi.fn() };
    const service = new BacktestQueueService(prisma as never, queue as never, events as never);

    await expect(service.ensureEnqueued(job.id)).rejects.toMatchObject({
      response: { code: 'NAV_V3_EXECUTION_UNAVAILABLE' },
      status: 409,
    });
    expect(queue.getState).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.backtestJob.update).not.toHaveBeenCalled();
    expect(events.publishJob).not.toHaveBeenCalled();
  });

  it('已失败的 NAV Run 保持终态且不会访问队列', async () => {
    const job = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      mode: 'V3',
      status: 'failed',
      input: { contractVersion: 3, schemaVersion: '3', inputKind: 'nav' },
    };
    const queue = { add: vi.fn() };
    const service = new BacktestQueueService(
      { backtestJob: { findUnique: vi.fn(async () => job) } } as never,
      queue as never,
      { publishJob: vi.fn() } as never,
    );

    await expect(service.ensureEnqueued(job.id)).resolves.toBe(job);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
