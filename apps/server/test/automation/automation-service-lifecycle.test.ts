import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationService, type AutomationHandler } from '../../src/automation/automation.service.js';

const job = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: '测试自动化',
  type: 'backup',
  enabled: true,
  cron: '0 * * * *',
  timezone: 'Asia/Shanghai',
  retryPolicy: { maxAttempts: 1, backoffMs: 1 },
  lockTtlMs: 300,
  nextRunAt: new Date('2026-09-12T01:00:00Z'),
  ...overrides,
});

const makeService = (row: ReturnType<typeof job>) => {
  const prisma = {
    automationJob: {
      findUniqueOrThrow: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: object }) => data),
    },
  };
  const service = new AutomationService(prisma as never, {} as never, {} as never);
  return { service, prisma };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('AutomationService durable lifecycle', () => {
  it('heartbeat 丢失 owner 后不由旧 worker 写 failed 或 succeeded', async () => {
    vi.useFakeTimers();
    const { service } = makeService(job());
    const executionStore = {
      createClaimedManualRun: vi.fn(async () => ({
        runId: '00000000-0000-4000-8000-000000000002',
        traceId: 'trace-manual',
        ownerAttempt: 1,
      })),
      setHandlerAttempt: vi.fn(async () => true),
      renewLease: vi.fn(async () => false),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => true),
    };
    (service as unknown as { executionStore: typeof executionStore }).executionStore = executionStore;
    const handler: AutomationHandler = {
      type: 'backup',
      run: vi.fn(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true }), 300);
          }),
      ),
    };

    const execution = service.execute(job().id, handler, new Date('2026-09-12T01:00:00Z'));
    await vi.advanceTimersByTimeAsync(300);

    await expect(execution).rejects.toThrow('Automation 执行所有权已丢失');
    expect(executionStore.renewLease).toHaveBeenCalled();
    expect(executionStore.complete).not.toHaveBeenCalled();
    expect(executionStore.fail).not.toHaveBeenCalled();
  });

  it('nextRunAt 尚未到期时不制造 scheduled occurrence', async () => {
    const { service } = makeService(
      job({ nextRunAt: new Date('2026-09-12T02:00:00Z') }),
    );
    const handler: AutomationHandler = {
      type: 'backup',
      run: vi.fn(async () => ({ ok: true })),
    };

    await expect(
      service.executeScheduled(job().id, handler, new Date('2026-09-12T01:00:00Z')),
    ).resolves.toEqual({ skipped: true, reason: '尚未到调度时间' });
    expect(handler.run).not.toHaveBeenCalled();
  });

  it('scheduled completion 只更新 lastRunAt，不覆盖 occurrence 已推进的新 schedule', async () => {
    const scheduledAt = new Date('2026-09-12T01:00:00Z');
    const { service, prisma } = makeService(job({ nextRunAt: scheduledAt }));
    const executionStore = {
      reserveScheduledOccurrence: vi.fn(async () => ({
        runId: '00000000-0000-4000-8000-000000000003',
        traceId: 'trace-scheduled',
      })),
      claim: vi.fn(async () => 1),
      setHandlerAttempt: vi.fn(async () => true),
      renewLease: vi.fn(async () => true),
      complete: vi.fn(async () => true),
      fail: vi.fn(async () => true),
    };
    (service as unknown as { executionStore: typeof executionStore }).executionStore = executionStore;
    const handler: AutomationHandler = {
      type: 'backup',
      run: vi.fn(async () => ({ ok: true })),
    };

    await expect(service.executeScheduled(job().id, handler, scheduledAt)).resolves.toEqual({
      skipped: false,
      output: { ok: true },
    });

    expect(prisma.automationJob.update).toHaveBeenCalledWith({
      where: { id: job().id },
      data: { lastRunAt: scheduledAt },
    });
    expect(
      prisma.automationJob.update.mock.calls.some(([input]) => 'nextRunAt' in input.data),
    ).toBe(false);
  });
});
