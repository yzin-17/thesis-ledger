import { describe, expect, it, vi } from 'vitest';
import { AiRunService } from '../../src/ai/ai.service.js';

describe('AI 运行审计', () => {
  it('记录 context、Tool call、checkpoint 和 token/cost 汇总', async () => {
    const prisma = {
      aiRun: {
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'run-1', ...data })),
        update: vi.fn(async ({ data }: { data: object }) => ({ id: 'run-1', ...data })),
        findUnique: vi.fn(async () => ({ id: 'run-1', checkpoint: { step: 'critic' } })),
        findMany: vi.fn(async () => [
          { inputTokens: 10, outputTokens: 5, cost: 0.1 },
          { inputTokens: 20, outputTokens: 10, cost: 0.2 },
        ]),
      },
      aiToolCall: { create: vi.fn(async ({ data }: { data: object }) => data) },
      aiDecisionLog: {
        create: vi.fn(async ({ data }: { data: object }) => data),
        findMany: vi.fn(),
      },
    };
    const service = new AiRunService(prisma as never);
    await expect(
      service.start('mock', 'm1', 'research-v2', { scope: 'position', symbol: '600519.SH' }),
    ).resolves.toMatchObject({ id: 'run-1', context: { scope: 'position' } });
    await service.checkpoint('run-1', { step: 'research' });
    await service.recordToolCall({
      runId: 'run-1',
      tool: 'quote',
      permission: 'market:read',
      status: 'ok',
      inputSummary: '600519.SH',
      fetchedAt: '2025-01-01T00:00:00Z',
    });
    await expect(service.usageSummary()).resolves.toEqual({
      runs: 2,
      reportedInputTokens: 0,
      reportedOutputTokens: 0,
      partialRuns: 0,
      unknownRuns: 0,
      legacyUnknownRuns: 2,
      unknownCostRuns: 0,
      unconfirmedInputTokenReservation: 0,
      unconfirmedOutputTokenReservation: 0,
      costs: [],
    });
    await expect(service.resume('run-1')).resolves.toMatchObject({
      checkpoint: { step: 'critic' },
    });
    await expect(service.list()).resolves.toHaveLength(2);
  });

});

describe("研究创建与冻结执行归属", () => {
  it('通用运行列表按状态过滤，详情排除归属到研究的运行', async () => {
    const findMany = vi.fn(async () => []);
    const findUnique = vi.fn(async () => null);
    const service = new AiRunService({ aiRun: { findMany, findUnique } } as never);
    await service.list(20, 'failed');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'failed', researchOwnerId: null }, take: 20 }),
    );
    await expect(service.resume('run-2')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-2', researchOwnerId: null } }),
    );
  });

  it('过期 Optimization AiRun 标记 unknown outcome，不能进入 Research 自动重试', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new AiRunService({ aiRun: { updateMany } } as never);
    const now = new Date('2026-09-12T00:00:00.000Z');

    await expect(service.recoverStaleRuns(now)).resolves.toEqual({
      requeued: 0,
      failed: 1,
      optimizationUnknown: 1,
    });
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'running',
          promptVersion: 'strategy-optimization-v1',
          leaseUntil: { lt: now },
        }),
        data: expect.objectContaining({
          status: 'failed',
          errorCode: 'optimization_unknown_outcome',
        }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          promptVersion: { notIn: ['strategy-optimization-v1', 'research-v1'] },
        }),
      }),
    );
  });

});

describe("研究列表与决策时间线", () => {
  it('列表只向客户端暴露脱敏后的 Provider fallback 摘要', async () => {
    const service = new AiRunService({
      aiRun: {
        findMany: vi.fn(async () => [
          {
            id: 'run-3',
            modelMetadata: { fallbackErrors: ['provider-a: temporary secret-like detail'] },
          },
        ]),
      },
    } as never);
    await expect(service.list()).resolves.toMatchObject([
      { id: 'run-3', fallbackSummary: 'provider-a: temporary secret-like detail' },
    ]);
  });

  it('Decision Log 按标的保留研究时间线', async () => {
    const prisma = {
      aiDecisionLog: {
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'd1', ...data })),
        findMany: vi.fn(async () => [{ id: 'd1', symbol: '600519.SH' }]),
      },
    };
    const service = new AiRunService(prisma as never);
    await expect(
      service.createDecisionLog({
        symbol: '600519.SH',
        question: '风险?',
        assumptions: [],
        conclusion: { value: '谨慎' },
      }),
    ).resolves.toMatchObject({ symbol: '600519.SH' });
    await expect(service.listDecisionLogs('600519.SH')).resolves.toEqual([
      { id: 'd1', symbol: '600519.SH' },
    ]);
  });
});
