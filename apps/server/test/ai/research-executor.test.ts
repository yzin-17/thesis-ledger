import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiResearchExecutor } from '../../src/ai/ai-research.executor.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { submissionV2Execution } from './research-submission-v2.fixture.js';

const runId = '11111111-1111-4111-8111-111111111111';

function setup(frozenResearch: unknown = null, providers = new AiProviderRegistry()) {
  const runs = {
    recoverStaleRuns: vi.fn().mockResolvedValue({}),
    claim: vi.fn().mockResolvedValue({
      id: runId,
      provider: 'fixture',
      model: 'controlled-model',
      executionAttempt: 1,
      modelMetadata: {
        frozenResearch,
        sdkExecution: {
          ...submissionV2Execution().sdkExecution,
          deadlineAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    }),
    recordToolCall: vi.fn(),
  };
  const prisma = { aiRun: { findMany: vi.fn().mockResolvedValue([]) } };
  const executions = { renewLease: vi.fn().mockResolvedValue(true), failOwned: vi.fn() };
  const sdk = { execute: vi.fn() };
  const executor = new AiResearchExecutor(
    runs as never,
    prisma as never,
    providers,
    executions as never,
    sdk as never,
  );
  return { executor, runs, prisma, executions, sdk };
}

afterEach(() => vi.unstubAllEnvs());

describe('具名研究合同执行器', () => {
  it('停用开关阻止恢复、领取和执行', async () => {
    vi.stubEnv('AI_RESEARCH_EXECUTION_ENABLED', 'false');
    const { executor, runs, sdk } = setup();
    executor.dispatch(runId);
    await executor.tick();
    expect(runs.recoverStaleRuns).not.toHaveBeenCalled();
    expect(runs.claim).not.toHaveBeenCalled();
    expect(sdk.execute).not.toHaveBeenCalled();
  });

  it('仅轮询具名合同，旧冻结输入在读取证据或发送模型请求前失败', async () => {
    const { executor, prisma, runs, executions, sdk } = setup({ version: 'frozen-research-v2' });
    await executor.tick();
    expect(prisma.aiRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'queued',
        modelMetadata: { path: ['frozenResearch', 'version'], equals: 'research-frozen-input-v1' },
      },
    }));
    executor.dispatch(runId);
    await vi.waitFor(() => expect(executions.failOwned).toHaveBeenCalledWith(
      { runId, executionAttempt: 1 },
      expect.objectContaining({ errorCode: 'research_frozen_evidence_invalid' }),
    ));
    expect(runs.recordToolCall).not.toHaveBeenCalled();
    expect(sdk.execute).not.toHaveBeenCalled();
  });

  it('能力预检显示异常 Provider 及其影响', () => {
    const providers = new AiProviderRegistry();
    providers.register({
      id: 'down-provider',
      models: ['m1'],
      metadata: { health: 'down' },
      complete: vi.fn(),
    });
    const capabilities = setup(null, providers).executor.capabilities();
    expect(capabilities.canStart).toBe(false);
    expect(capabilities.providers[0]).toMatchObject({
      provider: 'down-provider',
      state: 'error',
      impact: [expect.stringContaining('健康检查失败')],
    });
  });
});
