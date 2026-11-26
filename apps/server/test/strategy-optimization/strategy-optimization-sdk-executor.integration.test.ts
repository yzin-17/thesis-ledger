import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { optimizationGenerationContract } from '../../src/strategy-optimization/strategy-optimization-generation-contract.js';
import { RESEARCH_STRATEGY_SPACE_VERSION } from '../../src/strategy-optimization/strategy-optimization-research.js';
import { priceResearchFixture } from '../backtest/price-research.fixtures.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { buildGenerationSchemaPrompt } from '../../src/ai/ai-generation-schema-prompt.js';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { StrategyOptimizationSdkExecutor } from '../../src/strategy-optimization/strategy-optimization-sdk-executor.js';
import { strategyOptimizationPrompt } from '../../src/strategy-optimization/strategy-optimization-prompt.js';
import { completeSnapshotFixture } from '../backtest/v3-complete-snapshot-fixtures.js';

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
  const suiteScope = sdkExecutionContext();
  registerSdkPreparationAndOutputCases(suiteScope);
  registerSdkFrozenMetricsAndPricingCases(suiteScope);
  registerSdkDiscoveryAndUnknownOutcomeCases(suiteScope);
});

function sdkExecutionContext() {
  let responseContent = '';
  let requestCount = 0;
  let baseURL = '';
  let receivedBody = '';
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    receivedBody = Buffer.concat(chunks).toString('utf8');
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
    receivedBody = '';
    vi.clearAllMocks();
    settlements.completeAndSettle.mockResolvedValue({ continuationBlockedReason: null });
  });
  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });
  const resolved = (contract: { id: string; version: string }) => ({
    provider,
    execution: {
      adapter: 'openai-compatible',
      model: 'fixture-model',
      mode: 'json_validated',
      contract,
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
    messages: [
      {
        role: 'system',
        content: buildGenerationSchemaPrompt(
          optimizationGenerationContract(experiment as never).schema,
        ),
      },
      { role: 'user', content: 'Return JSON.' },
    ],
    inputTokenReservation: 100,
    outputTokenReservation: 100,
    estimatedCost: 0.003,
    resolved: resolved(contract),
    requestTimeoutMs: 2_000,
  });
  return {
    get responseContent() {
      return responseContent;
    },
    set responseContent(value: typeof responseContent) {
      responseContent = value;
    },
    get requestCount() {
      return requestCount;
    },
    set requestCount(value: typeof requestCount) {
      requestCount = value;
    },
    get baseURL() {
      return baseURL;
    },
    set baseURL(value: typeof baseURL) {
      baseURL = value;
    },
    get receivedBody() {
      return receivedBody;
    },
    set receivedBody(value: typeof receivedBody) {
      receivedBody = value;
    },
    get server() {
      return server;
    },
    get executions() {
      return executions;
    },
    get settlements() {
      return settlements;
    },
    get prisma() {
      return prisma;
    },
    get provider() {
      return provider;
    },
    get route() {
      return route;
    },
    get step() {
      return step;
    },
    get resolved() {
      return resolved;
    },
    get executor() {
      return executor;
    },
    get common() {
      return common;
    },
  };
}
function registerSdkPreparationAndOutputCases(suiteScope: ReturnType<typeof sdkExecutionContext>) {
  it('参数优化只发一次请求，完整保存用量并在超额后阻断继续', async () => {
    suiteScope.responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '本地 Provider 参数候选',
      evidenceRefs: [],
    });
    suiteScope.settlements.completeAndSettle.mockResolvedValue({
      continuationBlockedReason: 'budget_exceeded',
    });

    const result = await suiteScope
      .executor()
      .completeProposal(
        suiteScope.common(
          { sourceMode: 'existing' },
          {},
          { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
        ) as never,
      );

    expect(suiteScope.requestCount).toBe(1);
    expect(result).toMatchObject({
      proposal: { changes: [{ parameterId: 'risk.0.percent', value: '0.07' }] },
      continuationBlockedReason: 'budget_exceeded',
    });
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          usage: { status: 'reported', inputTokens: 11, outputTokens: 7 },
        }),
        outcome: expect.objectContaining({ status: 'complete', schemaAccepted: true }),
      }),
    );
  });
  it('缺失字段指令时不初始化预算、不结算、不发请求', async () => {
    const input = suiteScope.common(
      { sourceMode: 'existing' },
      {},
      { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
    );
    input.messages = [{ role: 'user', content: '只返回JSON' }];
    await expect(suiteScope.executor().completeProposal(input as never)).rejects.toMatchObject({
      fact: { code: 'configuration_invalid', externalResult: 'not_sent' },
    });
    expect(suiteScope.executions.initialize).not.toHaveBeenCalled();
    expect(suiteScope.settlements.completeAndSettle).not.toHaveBeenCalled();
    expect(suiteScope.requestCount).toBe(0);
  });
  it.each([0, 100])('累计输出预算 %s 正确映射到真实 Provider 请求', async (maxOutputTokens) => {
    suiteScope.responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '本地样本',
      evidenceRefs: [],
    });
    await suiteScope
      .executor()
      .completeProposal(
        suiteScope.common(
          { sourceMode: 'existing', budget: { maxOutputTokens, maxDurationSeconds: 1800 } },
          {},
          { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
        ) as never,
      );
    const body = JSON.parse(suiteScope.receivedBody);
    if (maxOutputTokens === 0) {
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('max_completion_tokens');
    } else expect(body.max_tokens ?? body.max_completion_tokens).toBe(100);
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          usage: { status: 'reported', inputTokens: 11, outputTokens: 7 },
        }),
      }),
    );
  });
  it('模型返回完整但格式无效的响应时只结算一次格式失败并保留已报告用量', async () => {
    suiteScope.responseContent = '{"changes": "not-an-array"}';

    await expect(
      suiteScope
        .executor()
        .completeProposal(
          suiteScope.common(
            { sourceMode: 'existing' },
            {},
            { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
          ) as never,
        ),
    ).rejects.toMatchObject({
      fact: { code: 'schema_invalid', phase: 'validation', externalResult: 'complete' },
    });

    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.executions.markUnknown).not.toHaveBeenCalled();
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledTimes(1);
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          usage: { status: 'reported', inputTokens: 11, outputTokens: 7 },
        }),
        outcome: expect.objectContaining({ status: 'incomplete', schemaAccepted: false }),
        error: expect.objectContaining({ code: 'schema_invalid', externalResult: 'complete' }),
      }),
    );
    expect(suiteScope.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(suiteScope.prisma.aiRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          errorCode: 'optimization_schema_invalid',
        }),
      }),
    );
  });
}
function registerSdkFrozenMetricsAndPricingCases(
  suiteScope: ReturnType<typeof sdkExecutionContext>,
) {
  it('本地HTTP实际请求只发送投影后的开发验证指标和固定快照说明', async () => {
    const { input } = await completeSnapshotFixture();
    const experiment = {
      sourceMode: 'existing',
      allowedParameterIds: [],
      objective: { mode: 'return' },
      runConfig: input.runConfig,
      baselineMetrics: {
        development: { status: 'valid', totalReturn: '-0.2', futureHigh: 'SEALED_HIGH' },
        test: { status: 'valid', totalReturn: 'SEALED_TEST_RETURN' },
      },
    };
    const messages = await strategyOptimizationPrompt({
      prisma: {
        $queryRaw: async () => [
          {
            diff: [],
            metrics: {
              validation: { status: 'invalid', reason: 'SEALED_DATE_2035' },
              test: { totalReturn: 'SEALED_HISTORY' },
            },
          },
        ],
      } as never,
      experiment: { id: suiteScope.step.experimentId, ...experiment } as never,
      strategy: input.strategy,
      descriptors: [],
      modelKey: suiteScope.step.modelKey,
      round: 2,
      useSdkContract: true,
    });
    suiteScope.responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '本地投影测试',
      evidenceRefs: [],
    });
    await suiteScope.executor().completeProposal({
      ...suiteScope.common(experiment, input.strategy, {
        id: 'parameter_optimization',
        version: 'optimization-parameter-v1',
      }),
      messages,
    } as never);
    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.receivedBody).not.toContain('SEALED_');
    expect(suiteScope.receivedBody).toContain('-0.2');
    expect(suiteScope.receivedBody).toContain('不得声称严格无前视样本外');
    expect(JSON.parse(suiteScope.receivedBody).messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
    );
  });
  it('使用 Provider 用户费率估算费用并仍只发一次请求', async () => {
    suiteScope.responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '用户费率 Provider 参数候选',
      evidenceRefs: [],
    });
    const input = suiteScope.common(
      { sourceMode: 'existing', budget: { maxCost: '0', maxDurationSeconds: 1_800 } },
      {},
      { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
    );
    input.resolved = suiteScope.resolved({
      id: 'parameter_optimization',
      version: 'optimization-parameter-v1',
    });

    await suiteScope.executor().completeProposal(input as never);

    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.executions.prepareRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: expect.objectContaining({
          cost: expect.objectContaining({
            status: 'estimated',
            amount: '0.003',
            currency: 'USD',
            source: 'frozen_provider_rates',
            pricingVersion: 'fixture-v1',
          }),
        }),
      }),
    );
  });
  it('策略步骤结算使用实验创建时冻结的模型价格版本', async () => {
    suiteScope.responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
      reason: '冻结费率 Provider 参数候选',
      evidenceRefs: [],
    });
    const input = suiteScope.common(
      {
        sourceMode: 'existing',
        modelConfig: [
          {
            provider: 'local-fixture',
            model: 'fixture-model',
            costStatus: 'known',
            costPer1kInput: 0.1,
            costPer1kOutput: 0.2,
            costCurrency: 'USD',
            pricingVersion: 'frozen-v2',
          },
        ],
      },
      {},
      { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
    );

    await suiteScope.executor().completeProposal(input as never);

    expect(suiteScope.executions.prepareRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: expect.objectContaining({
          cost: expect.objectContaining({
            pricingVersion: 'frozen-v2',
            source: 'frozen_provider_rates',
          }),
        }),
      }),
    );
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          cost: expect.objectContaining({ pricingVersion: 'frozen-v2' }),
        }),
      }),
    );
  });
}
function registerSdkDiscoveryAndUnknownOutcomeCases(
  suiteScope: ReturnType<typeof sdkExecutionContext>,
) {
  it('能力报告经一次本地 HTTP 生成与结算保存，不冒充失败重试或可回测候选', async () => {
    const gap = {
      status: 'unsupported', originalRule: '按历史股票池选十只股票等权买入', reason: '当前仅有单标的执行模型',
      gaps: [{ path: 'executionInstrument', kind: 'execution', detail: '没有多资产资金分配与组合撮合' }],
      supportedParts: ['可表达单标的收益率窗口'], evidenceRefs: [],
    };
    suiteScope.responseContent = JSON.stringify(gap);
    await expect(suiteScope.executor().completeProposal(suiteScope.common({ sourceMode: 'discovery' }, {}, aiGenerationContracts.strategyDiscovery.ref) as never))
      .rejects.toMatchObject({ name: 'StrategyCapabilityGapError', gap });
    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledTimes(1);
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledWith(expect.objectContaining({
      outcome: expect.objectContaining({ status: 'complete', schemaAccepted: true }), proposal: gap, result: gap,
      revision: expect.objectContaining({ usage: { status: 'reported', inputTokens: 11, outputTokens: 7 } }),
    }));
    expect(suiteScope.executions.markUnknown).not.toHaveBeenCalled();
    expect(suiteScope.prisma.aiRun.updateMany).not.toHaveBeenCalled();
    expect(suiteScope.prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('发现生成拒绝旧提议出参，保留单次请求用量', async () => {
    const scope = {
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    };
    const seed = createDiscoverySeed(scope as never);
    suiteScope.responseContent = JSON.stringify({
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
      reason: '用于确认非法来源在业务校验被拒绝',
      evidenceRefs: [],
    });

    await expect(
      suiteScope.executor().completeProposal(
        suiteScope.common({ sourceMode: 'discovery', discoveryScope: scope }, seed, {
          ...aiGenerationContracts.strategyDiscovery.ref,
        }) as never,
      ),
    ).rejects.toThrow();

    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: expect.objectContaining({
          usage: { status: 'reported', inputTokens: 11, outputTokens: 7 },
        }),
        outcome: expect.objectContaining({ status: 'incomplete', schemaAccepted: false }),
        error: expect.objectContaining({
          code: 'schema_invalid',
          externalResult: 'complete',
        }),
      }),
    );
    expect(JSON.stringify(suiteScope.prisma.$executeRaw.mock.calls)).toContain('modelMetadata');
  });
  it.each(['valid', 'semantic', 'structure'])('V6探索只调用一次本地HTTP，原输出和编译产物分别保留，类别=%s', async (kind) => {
    const invalid = kind !== 'valid';
    const f = await priceResearchFixture();
    const scope = { executionInstrument: f.input.strategy.executionInstrument, primaryTimeframe: '1d' as const };
    const seed = createDiscoverySeed(scope, true);
    const prepared = await prepareBacktestRunConfigV3({ request: f.request, strategy: seed, control: f.control,
      reader: f.reader, checkedAt: '2026-06-07T08:00:00Z' });
    if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
    const close = { type: 'series', sourceId: invalid ? 'missing' : 'model-source', field: 'close' };
    const raw = { strategy: { name: 'V6隔离候选', entryTrigger: 'rising-edge',
      signalSources: [{ id: 'model-source', timeframe: '1d', priceCoordinate: 'research' }],
      entry: { type: 'compare', operator: 'gt', left: close, right: { ...close, sourceId: 'model-source' } },
      exit: seed.exit, sizing: seed.sizing, risk: [] }, reason: '固定源码意图', evidenceRefs: [] };
    if (kind === 'structure') raw.strategy.entry.right = { type: 'eventValue' } as never;
    suiteScope.responseContent = JSON.stringify(raw, null, 2);
    const input = suiteScope.common({ sourceMode: 'discovery', strategySpaceVersion: RESEARCH_STRATEGY_SPACE_VERSION,
      discoveryScope: scope, runConfig: prepared.runConfig }, seed, aiGenerationContracts.strategyDiscovery.ref);
    const run = suiteScope.executor().completeProposal(input as never);
    if (invalid) await expect(run).rejects.toMatchObject({ fact: { code: kind === 'structure' ? 'schema_invalid' : 'business_invalid', externalResult: 'complete' } });
    else expect((await run).proposal).toHaveProperty('strategy.signalSources.0.series', ['close']);
    expect(suiteScope.requestCount).toBe(1);
    const artifacts = (suiteScope.prisma.$executeRaw.mock.calls as unknown[][]).flatMap(([query]) => (query as { values: unknown[] }).values)
      .filter((value): value is string => typeof value === 'string' && value.includes('strategyGeneration')).map((value) => JSON.parse(value));
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].strategyGeneration.rawOutputText).toBe(suiteScope.responseContent);
    if (kind === 'structure') expect(artifacts[0].strategyGeneration.diagnostics[0]).toMatchObject({ stage: 'structure', code: 'STRUCTURE_INVALID' });
    else {
      expect(artifacts[0].strategyGeneration.rawOutput).toEqual(raw);
      expect(artifacts[0].strategyGeneration.compilation.status).toBe(invalid ? 'rejected' : 'compiled');
      if (invalid) expect(artifacts[0].strategyGeneration.compilation.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNDECLARED_SOURCE' })]));
    }
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledOnce();
  });
  it('Provider 已完成但保存失败时转 unknown_outcome，不会重复结算或再请求', async () => {
    suiteScope.responseContent = JSON.stringify({
      changes: [{ parameterId: 'risk.0.percent', value: '0.08' }],
      reason: '保存失败样例',
      evidenceRefs: [],
    });
    suiteScope.settlements.completeAndSettle.mockRejectedValueOnce(new Error('模拟事务保存失败'));

    await expect(
      suiteScope
        .executor()
        .completeProposal(
          suiteScope.common(
            { sourceMode: 'existing' },
            {},
            { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
          ) as never,
        ),
    ).rejects.toMatchObject({
      fact: { code: 'persistence_failed', externalResult: 'complete' },
    });

    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.settlements.completeAndSettle).toHaveBeenCalledTimes(1);
    expect(suiteScope.executions.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ runId: suiteScope.step.aiRunId }),
      expect.any(String),
      expect.objectContaining({ code: 'persistence_failed', externalResult: 'complete' }),
    );
    expect(suiteScope.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('发送后连接中断保持 unknown_outcome 且单请求', async () => {
    suiteScope.responseContent = '__disconnect__';

    await expect(
      suiteScope
        .executor()
        .completeProposal(
          suiteScope.common(
            { sourceMode: 'existing' },
            {},
            { id: 'parameter_optimization', version: 'optimization-parameter-v1' },
          ) as never,
        ),
    ).rejects.toMatchObject({
      fact: { externalResult: 'unknown' },
    });

    expect(suiteScope.requestCount).toBe(1);
    expect(suiteScope.settlements.completeAndSettle).not.toHaveBeenCalled();
    expect(suiteScope.executions.markUnknown).toHaveBeenCalledOnce();
    expect(suiteScope.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
}
