import { expect, it } from 'vitest';
import { fixture, openRouterFixture } from './research-live-experiment-fixture.js';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import {
  qualifyLiveExperiment,
  FIVE_CASE_SCREENING_CASE_IDS,
  CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS as context,
  type LiveExperimentProtocol,
} from '../../src/ai/research-live-experiment-protocol.js';

function iterativeFixture() {
  const v = fixture(),
    previous = openRouterFixture();
  const old = {
    ...v.protocol,
    version: 'research-live-experiment-v4',
    caseIds: [...FIVE_CASE_SCREENING_CASE_IDS],
    budget: { ...v.protocol.budget, authorizedCalls: 68 },
  };
  const history = {
    ...previous.history,
    model: v.protocol.model,
    sourceProtocolFingerprint: experimentFingerprint(old),
    pricingFingerprint: experimentFingerprint(v.protocol.pricing),
    requests: 50,
    unknownRequests: 9,
    amount: '0.39577375',
    reservedUnknown: '0.2568',
    unknownReservations: [
      ...previous.history.unknownReservations!,
      {
        protocolFingerprint: experimentFingerprint(previous.protocol),
        currency: 'USD' as const,
        maxInputTokens: 100000,
        maxOutputTokens: 6000,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        unknownRequests: 5,
      },
      {
        protocolFingerprint: experimentFingerprint(old),
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
    version: 'research-live-experiment-v5',
    caseIds: [...FIVE_CASE_SCREENING_CASE_IDS],
    failurePolicy: 'record_and_continue',
    reasoningEffort: 'low',
    budget: {
      ...v.protocol.budget,
      authorizedCalls: 68,
      modelContextTokens: context,
      outputTokenLimit: 'upstream',
      maxInputTokensPerArm: 3 * context,
      maxOutputTokensPerArm: 3 * context,
    },
  };
  return { ...v, protocol, history, binding: { ...v.binding, history } };
}

it('优化协议取消人工输出上限，两组同样低推理强度，18次余量可以启动并守住68次', async () => {
  const v = iterativeFixture();
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(18);
  for (const [request] of v.generate.mock.calls) {
    expect(request).not.toHaveProperty('maxOutputTokens');
    expect(request.requestOptions?.outputTokenLimit).toBe('upstream');
    expect(request.requestOptions?.body).toHaveProperty('reasoning_effort', 'low');
  }
  expect(report.budget.requests).toBe(68);
  expect(report.budget.stopped).toBe('request_budget_exhausted');
  expect(report.cases.map((x) => x.caseId)).toEqual(FIVE_CASE_SCREENING_CASE_IDS);
  expect(report.cases[0]!.staged.status).toBe('complete');
  expect(report.evaluation.pairedQualitySamples).toBe(4);
  expect(report.cases.at(-1)!.staged.status).toBe('blocked');
  expect(report.budget.reservedUnknown).toBe('0.2568');
});

it.each(['schema_invalid', 'output_truncated'] as const)(
  '单次%s只结束该组，保留失败并继续其余阶段/案例',
  async (code) => {
    const v = iterativeFixture();
    v.generate.mockRejectedValueOnce(
      new AiSdkGenerationError(
        {
          code,
          phase: 'validation',
          summary: '受控不合格输出',
          externalResult: 'complete',
          requestId: '00000000-0000-4000-8000-000000000001',
        },
        { status: 'reported', inputTokens: 100, outputTokens: 100 },
      ),
    );
    const report = await runLiveResearchExperiment(
      v.protocol,
      v.benchmark,
      v.evaluation,
      v.binding,
    );
    expect(v.generate).toHaveBeenCalledTimes(18);
    expect(report.cases[0]!.single.status).toBe('failed');
    expect(report.cases[0]!.single.reason).toBe(code);
    expect(report.cases[0]!.single.grade).toBeNull();
    expect(report.cases[0]!.staged.status).toBe('complete');
    expect(report.cases[1]!.single.status).toBe('complete');
    expect(report.budget.stopped).toBe('request_budget_exhausted');
  },
);

it('未知结果按模型物理范围预留后继续，旧9笔未知不释放或双计', async () => {
  const v = iterativeFixture();
  v.generate.mockRejectedValueOnce(new Error('受控未知传输'));
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(18);
  expect(report.budget.spent).toBe('0.13897375');
  expect(report.budget.reservedUnknown).toBe('1.2136256');
  expect(report.budget.committed).toBe('1.35259935');
  expect(report.cases[0]!.staged.status).toBe('complete');
});

it('连续未知在原5 USD最坏费用保护处停止，不能因为继续样本越过费用授权', async () => {
  const v = iterativeFixture();
  v.generate.mockRejectedValue(new Error('受控连续未知'));
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(4);
  expect(report.budget.requests).toBe(54);
  expect(report.budget.stopped).toBe('cost_budget_exhausted');
  expect(report.budget.reservedUnknown).toBe('4.0841024');
  expect(report.budget.committed).toBe('4.22307615');
});

it('新协议不放宽旧v4的固定合同，原Schema与封存评价仍要求一致', () => {
  const v = iterativeFixture();
  expect(qualifyLiveExperiment(v.protocol, v.benchmark, v.evaluation).protocol).toEqual(v.protocol);
  for (const change of [
    { failurePolicy: 'stop_all_new_failures' },
    { reasoningEffort: 'xhigh' },
    { budget: { ...v.protocol.budget, modelContextTokens: 999999 } },
    { evaluationFingerprint: '0'.repeat(64) },
  ])
    expect(() =>
      qualifyLiveExperiment({ ...v.protocol, ...change }, v.benchmark, v.evaluation),
    ).toThrow();
});
