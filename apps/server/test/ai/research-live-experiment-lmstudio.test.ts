import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { fixture } from './research-live-experiment-fixture.js';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import {
  AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import type { ResearchGenerationV2 } from '@thesis-ledger/schemas';
import { runLiveResearchArm } from '../../src/ai/research-live-experiment-arm.js';
import { createLiveExperimentBudget } from '../../src/ai/research-live-experiment-budget.js';
import {
  LMSTUDIO_EXPERIMENT_BASE_URL,
  LMSTUDIO_EXPERIMENT_MODEL,
  LMSTUDIO_EXPERIMENT_CANONICAL_MODEL,
  FIVE_CASE_SCREENING_CASE_IDS,
  qualifyLiveExperiment,
  type LiveExperimentProtocol,
} from '../../src/ai/research-live-experiment-protocol.js';

function localFixture() {
  const v = fixture();
  const original = v.generate.getMockImplementation()!;
  v.generate.mockImplementation(async (input) => ({
    ...(await original(input)),
    actualModel: LMSTUDIO_EXPERIMENT_CANONICAL_MODEL,
  }));
  const history = {
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    sourceReportSha256: 'a'.repeat(64),
    model: v.protocol.model,
    pricingFingerprint: experimentFingerprint(v.protocol.pricing),
    benchmarkFingerprint: v.protocol.benchmarkFingerprint,
    evaluationFingerprint: v.protocol.evaluationFingerprint,
    amount: '0.1',
    reservedUnknown: '0.0642',
    requests: 70,
    unknownRequests: 1,
    unknownReservations: [
      {
        protocolFingerprint: experimentFingerprint(v.protocol),
        currency: 'USD' as const,
        maxInputTokens: 100000,
        maxOutputTokens: 6000,
        costPer1kInput: 0.00045,
        costPer1kOutput: 0.0032,
        unknownRequests: 1,
      },
    ],
  };
  const protocol: LiveExperimentProtocol = {
    ...v.protocol,
    version: 'research-live-experiment-v6',
    executionId: randomUUID(),
    caseIds: [...FIVE_CASE_SCREENING_CASE_IDS],
    failurePolicy: 'record_and_continue',
    requestOptions: { headers: { 'x-observation': 'saved' }, body: { temperature: 0.2 } },
    generation: { adapter: 'openai-compatible-chat', mode: 'native_schema' },
    model: {
      providerId: 'lmstudio',
      id: LMSTUDIO_EXPERIMENT_MODEL,
      canonicalId: LMSTUDIO_EXPERIMENT_CANONICAL_MODEL,
      revision: 'saved-config',
    },
    pricing: { ...v.protocol.pricing, costPer1kInput: 0, costPer1kOutput: 0 },
    localTarget: {
      baseURL: LMSTUDIO_EXPERIMENT_BASE_URL,
      authMode: 'none',
      quantization: 'Q4_K_M',
    },
    budget: {
      ...v.protocol.budget,
      authorizedCalls: null,
      modelContextTokens: 102400,
      maxInputTokensPerArm: 307200,
      maxOutputTokensPerArm: 307200,
    },
  };
  return {
    ...v,
    protocol,
    history,
    binding: { ...v.binding, history, baseURL: LMSTUDIO_EXPERIMENT_BASE_URL, apiKey: '' },
  };
}

it('本地模型超过旧68次仍完成同五例20次，无认证及输出上限，旧费用／未知预留保持', async () => {
  const v = localFixture();
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(20);
  expect(report.budget).toMatchObject({
    requests: 90,
    stopped: null,
    committed: '0.1',
    reservedUnknown: '0.0642',
  });
  expect(report.evaluation.pairedQualitySamples).toBe(5);
  expect(report.allCasesAttempted).toBe(true);
  for (const [input] of v.generate.mock.calls) {
    expect(input.authMode).toBe('none');
    expect(input).not.toHaveProperty('maxOutputTokens');
    expect(input.requestOptions).toEqual(v.protocol.requestOptions);
    expect(input.timeout).not.toHaveProperty('totalMs');
  }
});

it('本地未知结果保留未知，不清零旧预留，继续其它案例', async () => {
  const v = localFixture();
  v.generate.mockRejectedValueOnce(
    new AiSdkGenerationError({
      code: 'schema_invalid',
      phase: 'validation',
      summary: '受控不合格输出',
      externalResult: 'unknown',
      requestId: randomUUID(),
    }),
  );
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(20);
  expect(report.cases[0]!.single.status).toBe('failed');
  expect(report.cases[0]!.staged.status).toBe('complete');
  expect(report.budget).toMatchObject({
    stopped: null,
    reservedUnknown: '0.0642',
    committed: '0.1',
  });
});

it('保存的流式首输出／空闲覆盖传入SDK，非流式30秒不成为阶段总截止', async () => {
  const v = localFixture();
  await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, {
    ...v.binding,
    firstOutputTimeoutMs: 32123,
    outputIdleTimeoutMs: 12345,
  });
  expect(v.generate.mock.calls[0]![0].timeout).toEqual({ firstChunkMs: 32123, chunkMs: 12345 });
});

it('本地无限授权不能带到外部地址或凭据', async () => {
  const v = localFixture();
  for (const patch of [{ baseURL: 'https://openrouter.ai/api/v1' }, { apiKey: 'synthetic' }]) {
    await expect(
      runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, { ...v.binding, ...patch }),
    ).rejects.toThrow('目标或鉴权');
  }
  expect(v.generate).not.toHaveBeenCalled();
});

it('非零价格、型号／量化／物理范围／五例漂移在派发前拒绝', () => {
  const v = localFixture();
  for (const patch of [
    { pricing: { ...v.protocol.pricing, costPer1kOutput: 1 } },
    { model: { ...v.protocol.model, id: 'different' } },
    { budget: { ...v.protocol.budget, authorizedCalls: 68 } },
    { budget: { ...v.protocol.budget, maxOutputTokensPerArm: 2000 } },
    { caseIds: [...FIVE_CASE_SCREENING_CASE_IDS].reverse() },
  ])
    expect(() =>
      qualifyLiveExperiment({ ...v.protocol, ...patch }, v.benchmark, v.evaluation),
    ).toThrow();
});

it('保存的native_schema经真实SDK序列化为json_schema，无认证和人工输出上限', async () => {
  const v = localFixture();
  const adapter = new AiSdkGenerationAdapter();
  const bodies: Record<string, unknown>[] = [];
  const result = await runLiveResearchArm(
    v.benchmark.cases[0]!,
    'single',
    v.protocol,
    {
      ...v.binding,
      generate: async (request: AiSdkGenerationRequest<ResearchGenerationV2>) => {
        const expected = await v.generate(request);
        return adapter.generate({
          ...request,
          httpClient: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            expect(new Headers(init?.headers).has('authorization')).toBe(false);
            const frames = [
              {
                choices: [
                  {
                    index: 0,
                    delta: { content: JSON.stringify(expected.output) },
                    finish_reason: null,
                  },
                ],
              },
              { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
              {
                choices: [],
                usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
              },
            ];
            const text =
              frames
                .map(
                  (frame) =>
                    'data: ' +
                    JSON.stringify({
                      id: 'local-native',
                      model: LMSTUDIO_EXPERIMENT_CANONICAL_MODEL,
                      created: 1,
                      ...frame,
                    }) +
                    '\n\n',
                )
                .join('') + 'data: [DONE]\n\n';
            return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
          },
        });
      },
    },
    createLiveExperimentBudget(v.protocol),
  );
  expect(result.status).toBe('complete');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.response_format).toMatchObject({ type: 'json_schema' });
  expect(bodies[0]).not.toHaveProperty('max_tokens');
});

it('统一中文与数值字段照录提示封存给两组全部阶段，不改变Schema或评价', async () => {
  const v = localFixture();
  v.protocol.outputContractHints = 'zh-numeric-copy-v1';
  const benchmarkBefore = experimentFingerprint(v.benchmark),
    evaluationBefore = experimentFingerprint(v.evaluation);
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(report.allCasesAttempted).toBe(true);
  for (const [request] of v.generate.mock.calls) {
    expect(request.messages[0].content).toContain('说明字段统一使用简体中文');
    expect(request.messages[0].content).toContain('必须逐项照录对应可用numericFields');
    expect(request.requestOptions).toEqual(v.protocol.requestOptions);
    expect(request).not.toHaveProperty('maxOutputTokens');
  }
  expect(experimentFingerprint(v.benchmark)).toBe(benchmarkBefore);
  expect(experimentFingerprint(v.evaluation)).toBe(evaluationBefore);
});
