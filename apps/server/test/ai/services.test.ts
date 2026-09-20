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

  it('研究启动保存问题、精确上下文和重试关系，列表支持状态筛选', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: 'run-2', ...data }));
    const findMany = vi.fn(async () => [{ id: 'run-2', status: 'queued', question: '风险？' }]);
    const findUnique = vi.fn(async ({ select }: { select?: Record<string, unknown> }) => {
      if (select?.promptVersion) {
        return {
          id: '11111111-1111-4111-8111-111111111111',
          promptVersion: 'research-v1',
          status: 'failed',
          question: '旧问题',
          context: { scope: 'portfolio' },
          modelMetadata: { templateId: 'primary-risks' },
          errorCode: 'provider_error',
        };
      }
      return { id: 'run-2', toolCalls: [] };
    });
    const service = new AiRunService({ aiRun: { create, findMany, findUnique } } as never);

    await expect(
      service.startResearch({
        question: '  当前组合最主要的风险是什么？ ',
        context: { scope: 'portfolio' },
        templateId: 'primary-risks',
        retryOfRunId: '11111111-1111-4111-8111-111111111111',
        retryConfirmation: {
          contextConfirmed: true,
          acknowledgeUnknownOutcomeRisk: false,
        },
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
        data: expect.objectContaining({
          provider: 'pending',
          model: 'pending',
          createdAt: expect.any(Date),
          modelMetadata: expect.objectContaining({
            templateId: 'primary-risks',
            researchPolicy: expect.objectContaining({ maxAiCalls: 2, maxCost: '0' }),
            sdkExecution: expect.objectContaining({
              version: 'sdk-execution-v1',
              deadlineAt: expect.any(String),
              requests: [],
            }),
          }),
        }),
      }),
    );
    await service.list(20, 'failed');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'failed' }, take: 20 }),
    );
    await service.resume('run-2');
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run-2' } }));
  });

  it('再次生成预填保留来源模板，unknown 来源必须由服务端确认风险', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: 'new-run', ...data }));
    const findUnique = vi.fn(async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      promptVersion: 'research-v1',
      status: 'failed',
      question: '原问题',
      context: { scope: 'portfolio' },
      modelMetadata: { templateId: 'counter-evidence' },
      errorCode: 'research_unknown_outcome',
    }));
    const service = new AiRunService({ aiRun: { create, findUnique } } as never);

    await expect(
      service.researchRetryPrefill('11111111-1111-4111-8111-111111111111'),
    ).resolves.toMatchObject({
      question: '原问题',
      context: { scope: 'portfolio' },
      templateId: 'counter-evidence',
      sourceOutcome: 'unknown',
      contextState: 'valid',
      requiresUnknownOutcomeAcknowledgement: true,
    });
    await expect(
      service.startResearch({
        question: '原问题',
        context: { scope: 'portfolio' },
        retryOfRunId: '11111111-1111-4111-8111-111111111111',
        retryConfirmation: {
          contextConfirmed: true,
          acknowledgeUnknownOutcomeRisk: false,
        },
      }),
    ).rejects.toThrow('必须确认风险');
    expect(create).not.toHaveBeenCalled();
    await expect(
      service.startResearch({
        question: '原问题',
        context: { scope: 'portfolio' },
        retryOfRunId: '11111111-1111-4111-8111-111111111111',
        retryConfirmation: {
          contextConfirmed: true,
          acknowledgeUnknownOutcomeRisk: true,
        },
      }),
    ).resolves.toMatchObject({ id: 'new-run', retryOfRunId: expect.any(String) });
  });

  it('研究创建时冻结同模型候选路由和配置指纹', async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: 'run-routes', ...data }));
    const providers = {
      defaultModel: () => 'fixture-model',
      readyContractCandidates: vi.fn(() => [
        {
          provider: { id: 'primary' },
          execution: {
            adapter: 'openai-compatible',
            mode: 'json_validated',
            readiness: { configurationFingerprint: 'primary-fingerprint' },
          },
        },
        {
          provider: { id: 'fallback' },
          execution: {
            adapter: 'openai-compatible',
            mode: 'json_validated',
            readiness: { configurationFingerprint: 'fallback-fingerprint' },
          },
        },
      ]),
    };
    const service = new AiRunService({ aiRun: { create } } as never, providers as never);

    await service.startResearch({ question: '风险？', context: { scope: 'portfolio' } });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'primary',
          model: 'fixture-model',
          modelMetadata: expect.objectContaining({
            researchRoutes: [
              expect.objectContaining({
                provider: 'primary',
                model: 'fixture-model',
                configurationFingerprint: 'primary-fingerprint',
              }),
              expect.objectContaining({
                provider: 'fallback',
                model: 'fixture-model',
                configurationFingerprint: 'fallback-fingerprint',
              }),
            ],
          }),
        }),
      }),
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
