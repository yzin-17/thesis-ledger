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
      inputTokens: 30,
      outputTokens: 15,
      cost: 0.30000000000000004,
    });
    await expect(service.resume('run-1')).resolves.toMatchObject({
      checkpoint: { step: 'critic' },
    });
    await expect(service.list()).resolves.toHaveLength(2);
  });

  it('研究启动保存问题、精确上下文和重试关系，列表支持状态筛选', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: 'run-2', ...data }));
    const findMany = vi.fn(async () => [{ id: 'run-2', status: 'queued', question: '风险？' }]);
    const findUnique = vi.fn(async () => ({ id: 'run-2', toolCalls: [] }));
    const service = new AiRunService({ aiRun: { create, findMany, findUnique } } as never);

    await expect(
      service.startResearch({
        question: '  当前组合最主要的风险是什么？ ',
        context: { scope: 'portfolio' },
        templateId: 'primary-risks',
        retryOfRunId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toMatchObject({
      id: 'run-2',
      status: 'queued',
      question: '当前组合最主要的风险是什么？',
      context: { scope: 'portfolio' },
      retryOfRunId: '11111111-1111-4111-8111-111111111111',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'pending', model: 'pending' }),
      }),
    );
    await service.list(20, 'failed');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'failed' }, take: 20 }),
    );
    await service.resume('run-2');
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run-2' } }));
  });
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
