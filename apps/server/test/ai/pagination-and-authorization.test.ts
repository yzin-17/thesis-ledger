import { describe, expect, it, vi } from 'vitest';
import { AiRunService } from '../../src/ai/ai.service.js';

const run = (id: string, createdAt: string) => ({
  id,
  provider: 'fixture',
  model: 'research-fixture',
  promptVersion: 'research-v1',
  status: 'succeeded',
  question: '风险？',
  context: { scope: 'portfolio' },
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
  startedAt: new Date(createdAt),
  completedAt: new Date(createdAt),
  retryOfRunId: null,
  errorCode: null,
  errorSummary: null,
  modelMetadata: null,
});

describe('AI 研究分页与上下文授权', () => {
  it('按 createdAt + id 使用稳定游标分页，并单独分页 Tool call', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        run('31111111-1111-4111-8111-111111111111', '2026-08-26T03:00:00.000Z'),
        run('21111111-1111-4111-8111-111111111111', '2026-08-26T02:00:00.000Z'),
        run('11111111-1111-4111-8111-111111111111', '2026-08-26T01:00:00.000Z'),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: '61111111-1111-4111-8111-111111111111',
          aiRunId: '31111111-1111-4111-8111-111111111111',
          tool: 'getRisk',
          permission: 'risk:read',
          status: 'ok',
          inputSummary: '{}',
          createdAt: new Date('2026-08-26T03:00:00.000Z'),
        },
      ]);
    const service = new AiRunService({
      aiRun: {
        findMany,
        findUnique: vi.fn(async () => ({ id: '31111111-1111-4111-8111-111111111111' })),
      },
      aiToolCall: { findMany },
    } as never);

    const page = await service.listPage(2);
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
    await service.listPage(2, undefined, page.nextCursor ?? undefined);
    expect(findMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: {
          OR: [
            { createdAt: { lt: new Date('2026-08-26T02:00:00.000Z') } },
            {
              createdAt: new Date('2026-08-26T02:00:00.000Z'),
              id: { lt: '21111111-1111-4111-8111-111111111111' },
            },
          ],
        },
      }),
    );
    const toolPage = await service.listToolCalls('31111111-1111-4111-8111-111111111111', 10);
    expect(toolPage.items[0]?.tool).toBe('getRisk');
  });

  it('研究启动拒绝不存在或停用的上下文实体', async () => {
    const create = vi.fn();
    const service = new AiRunService({
      account: { findUnique: vi.fn(async () => null) },
      aiRun: { create },
    } as never);

    await expect(
      service.startResearch({
        question: '账户风险？',
        context: { scope: 'account', accountId: '91111111-1111-4111-8111-111111111111' },
      }),
    ).rejects.toThrow('账户不存在');
    expect(create).not.toHaveBeenCalled();
  });

  it('租约过期按重试上限重新排队或进入失败终态', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const service = new AiRunService({ aiRun: { updateMany } } as never);
    await expect(
      service.recoverStaleRuns(new Date('2026-08-26T00:00:00.000Z'), 3),
    ).resolves.toEqual({
      requeued: 2,
      failed: 1,
    });
    expect(updateMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ where: expect.objectContaining({ status: 'running' }) }),
    );
    expect(updateMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: 'worker_lease_exhausted' }),
      }),
    );
  });
});
