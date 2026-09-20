import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { StrategyOptimizationSdkExecutor } from '../../src/strategy-optimization/strategy-optimization-sdk-executor.js';

const writeSse = (response: ServerResponse, content: string) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const common = {
    id: 'optimization-fixture',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'fixture-model',
  };
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...common,
      choices: [],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    })}\n\n`,
  );
  response.end('data: [DONE]\n\n');
};

describe('StrategyOptimizationSdkExecutor local HTTP vertical', () => {
  let responseContent = '';
  let requestCount = 0;
  let baseURL = '';
  const server = createServer((_request, response) => {
    requestCount += 1;
    if (responseContent === '__disconnect__') {
      response.destroy();
      return;
    }
    writeSse(response, responseContent);
  });
  const executions = {
    initialize: vi.fn(async (_owner, summary) => summary),
    prepareRequest: vi.fn(async (input) => ({ requestId: input.requestId })),
    authorizeDispatch: vi.fn(async () => true),
    markUnknown: vi.fn(async () => true),
  };
  const settlements = {
    completeAndSettle: vi.fn(async (): Promise<{ continuationBlockedReason: string | null }> => ({
      continuationBlockedReason: null,
    })),
  };
  const prisma = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ aiRunId: '00000000-0000-4000-8000-000000000002' }]),
    aiRun: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const provider = {
    id: 'local-fixture',
    models: ['fixture-model'],
    metadata: {
      costPer1kInput: 0.01,
      costPer1kOutput: 0.02,
      costCurrency: 'USD',
      pricingVersion: 'fixture-v1',
    },
    sdkRuntime: () => ({ baseURL: `${baseURL}/v1`, apiKey: 'fixture-secret', timeoutMs: 2_000 }),
  };
  const route = { provider: provider.id, model: 'fixture-model' };
  const step = {
    id: '00000000-0000-4000-8000-000000000001',
    experimentId: '00000000-0000-4000-8000-000000000003',
    modelKey: 'local-fixture:fixture-model',
    aiRunId: '00000000-0000-4000-8000-000000000002',
    attempt: 1,
    status: 'running',
    proposal: null,
    error: null,
    startedAt: new Date(),
    leaseUntil: new Date(Date.now() + 60_000),
    completedAt: null,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('本地 Provider fixture 启动失败');
    baseURL = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    requestCount = 0;
    vi.clearAllMocks();
    settlements.completeAndSettle.mockResolvedValue({ continuationBlockedReason: null });
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  const resolved = (
    contract: { id: string; version: string },
    freeEvidenceRef: string | null = null,
  ) => ({
    provider,
    execution: {
      adapter: 'openai-compatible',
      model: 'fixture-model',
      mode: 'json_validated',
      contract,
      allowedUpstreams: [],
      freeEvidenceRef,
      firstOutputTimeoutMs: 1_000,
      outputIdleTimeoutMs: 1_000,
      readiness: { state: 'ready', reasons: [], configurationFingerprint: 'fixture-fingerprint' },
    },
  });

  const executor = () =>
    new StrategyOptimizationSdkExecutor(
      prisma as never,
      {} as never,
      new AiSdkGenerationAdapter(),
      executions as never,
      settlements as never,
    );

  const common = (
    experiment: Record<string, unknown>,
    baseline: unknown,
    contract: { id: string; version: string },
  ) => ({
    experiment: {
      id: step.experimentId,
      createdAt: new Date(),
      budget: { maxCost: '10', maxDurationSeconds: 1_800 },
      ...experiment,
    },
    baseline,
    route,
    modelKey: step.modelKey,
    step,
    messages: [{ role: 'user', content: 'Return JSON.' }],
    inputTokenReservation: 100,
    outputTokenReservation: 100,
    estimatedCost: 0.003,
    resolved: resolved(contract),
    requestTimeoutMs: 2_000,
  });

  it('参数优化只发一次请求，完整保存用量并在超额后阻断继续', async () => {
    responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '本地 Provider 参数候选',
      evidenceRefs: [],
    });
    settlements.completeAndSettle.mockResolvedValue({
      continuationBlockedReason: 'budget_exceeded',
    });

    const result = await executor().completeProposal(
      common(
        { sourceMode: 'existing' },
        {},
        { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
      ) as never,
    );

    expect(requestCount).toBe(1);
    expect(result).toMatchObject({
      proposal: { changes: [{ parameterId: 'risk.0.percent', value: '0.07' }] },
      continuationBlockedReason: 'budget_exceeded',
    });
    expect(settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          usage: { status: 'reported', inputTokens: 11, outputTokens: 7 },
        }),
        outcome: expect.objectContaining({ status: 'complete', schemaAccepted: true }),
      }),
    );
  });

  it('免费证据引用超长时截断费用来源并仍只发一次请求', async () => {
    responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '免费 Provider 参数候选',
      evidenceRefs: [],
    });
    const input = common(
      { sourceMode: 'existing', budget: { maxCost: '0', maxDurationSeconds: 1_800 } },
      {},
      { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
    );
    input.resolved = resolved(
      { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
      `https://openrouter.ai/api/v1/models#${'free-model-segment-'.repeat(10)}`,
    );

    await executor().completeProposal(input as never);

    expect(requestCount).toBe(1);
    expect(executions.prepareRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: expect.objectContaining({
          cost: expect.objectContaining({
            status: 'unknown',
            amount: null,
            source: expect.stringMatching(/^free_evidence:/u),
          }),
        }),
      }),
    );
    const prepared = executions.prepareRequest.mock.calls.at(-1)?.[0];
    expect(prepared?.reservation.cost.source).toHaveLength(120);
  });

  it('discovery 由服务端装配 seed，非法引用保存用量后失败且不重试', async () => {
    const scope = {
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    };
    const seed = createDiscoverySeed(scope as never);
    responseContent = JSON.stringify({
      strategy: {
        name: '非法 discovery',
        series: ['close'],
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'other-source', field: 'close' },
          right: { type: 'constant', value: '0' },
        },
        exit: { type: 'positionState', field: 'isOpen' },
        sizing: { type: 'percentOfEquity', percent: '0.5' },
        risk: [],
      },
      evidenceRefs: [],
    });

    await expect(
      executor().completeProposal(
        common({ sourceMode: 'discovery', discoveryScope: scope }, seed, {
          id: 'strategy_discovery',
          version: 'strategy-discovery-v2',
        }) as never,
      ),
    ).rejects.toThrow();

    expect(requestCount).toBe(1);
    expect(settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          usage: { status: 'reported', inputTokens: 11, outputTokens: 7 },
        }),
        outcome: expect.objectContaining({ status: 'incomplete', schemaAccepted: false }),
        error: expect.objectContaining({
          code: 'business_invalid',
          externalResult: 'complete',
        }),
      }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('Provider 已完成但保存失败时转 unknown_outcome，不会重复结算或再请求', async () => {
    responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.08' }],
      reason: '保存失败样例',
      evidenceRefs: [],
    });
    settlements.completeAndSettle.mockRejectedValueOnce(new Error('模拟事务保存失败'));

    await expect(
      executor().completeProposal(
        common(
          { sourceMode: 'existing' },
          {},
          { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
        ) as never,
      ),
    ).rejects.toMatchObject({
      fact: { code: 'persistence_failed', externalResult: 'complete' },
    });

    expect(requestCount).toBe(1);
    expect(settlements.completeAndSettle).toHaveBeenCalledTimes(1);
    expect(executions.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ runId: step.aiRunId }),
      expect.any(String),
      expect.objectContaining({ code: 'persistence_failed', externalResult: 'complete' }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('发送后连接中断保持 unknown_outcome 且单请求', async () => {
    responseContent = '__disconnect__';

    await expect(
      executor().completeProposal(
        common(
          { sourceMode: 'existing' },
          {},
          { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
        ) as never,
      ),
    ).rejects.toMatchObject({
      fact: { externalResult: 'unknown' },
    });

    expect(requestCount).toBe(1);
    expect(settlements.completeAndSettle).not.toHaveBeenCalled();
    expect(executions.markUnknown).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
