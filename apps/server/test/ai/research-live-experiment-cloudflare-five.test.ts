import { expect, it, vi } from 'vitest';
import { fixture, openRouterFixture } from './research-live-experiment-fixture.js';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { createLiveExperimentBudget } from '../../src/ai/research-live-experiment-budget.js';
import {
  qualifyLiveExperiment,
  FIVE_CASE_SCREENING_CASE_IDS,
  type LiveExperimentProtocol,
} from '../../src/ai/research-live-experiment-protocol.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import {
  verifyFirstRateLimitContinuation,
  type LiveRateLimitContinuation,
} from '../../src/ai/research-live-experiment-continuation.js';

function cloudflareFixture() {
  const v = fixture();
  const previous = openRouterFixture();
  const fingerprint = experimentFingerprint(previous.protocol);
  const history = {
    ...previous.history,
    sourceProtocolFingerprint: fingerprint,
    model: previous.protocol.model,
    pricingFingerprint: experimentFingerprint(previous.protocol.pricing),
    requests: 48,
    unknownRequests: 8,
    unknownReservations: [
      ...previous.history.unknownReservations!,
      {
        protocolFingerprint: fingerprint,
        currency: 'USD' as const,
        maxInputTokens: 100000,
        maxOutputTokens: 6000,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        unknownRequests: 5,
      },
    ],
  };
  const protocol: LiveExperimentProtocol = {
    ...v.protocol,
    version: 'research-live-experiment-v4',
    caseIds: [...FIVE_CASE_SCREENING_CASE_IDS],
    budget: { ...v.protocol.budget, authorizedCalls: 68 },
  };
  return { ...v, protocol, history, binding: { ...v.binding, history } };
}

it('Cloudflare五例协议固定型号、顺序、68次上限，既有协议保持独立', () => {
  const v = cloudflareFixture();
  expect(qualifyLiveExperiment(v.protocol, v.benchmark, v.evaluation).protocol).toEqual(v.protocol);
  for (const change of [
    { caseIds: [...v.protocol.caseIds].reverse() },
    { budget: { ...v.protocol.budget, authorizedCalls: 69 } },
    { model: { ...v.protocol.model, id: '@cf/other/model' } },
  ])
    expect(() =>
      qualifyLiveExperiment({ ...v.protocol, ...change }, v.benchmark, v.evaluation),
    ).toThrow();
});

it('旧48次及原费用/8笔未知明细进入新五例，20次完整执行止于68', async () => {
  const v = cloudflareFixture();
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(20);
  expect(report.budget.requests).toBe(68);
  expect(report.budget.committed).toBe('0.3232176');
  expect(report.budget.reservedUnknown).toBe('0.1926');
  expect(report.historicalBudget?.unknownRequests).toBe(8);
  expect(report.reusedRequests).toBe(0);
  expect(report.cases.map((c) => c.caseId)).toEqual(FIVE_CASE_SCREENING_CASE_IDS);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.decision).toBe('keep_single');
  expect(report.evaluation.criteria.minimumCases).toBe(false);
});

it('不足20次头寸或原未知预留被清零，在模型派发前拒绝', async () => {
  for (const change of ['count', 'reservation']) {
    const v = cloudflareFixture();
    if (change === 'count') v.history.requests = 49;
    else v.history.reservedUnknown = '0';
    await expect(
      runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding),
    ).rejects.toThrow();
    expect(v.generate).not.toHaveBeenCalled();
  }
});

it('Cloudflare已知用量Schema失败也停止，不套用OpenRouter免费负样本确认', async () => {
  const v = cloudflareFixture();
  v.generate.mockRejectedValue(
    new AiSdkGenerationError(
      {
        code: 'schema_invalid',
        phase: 'validation',
        summary: '受控结构失败',
        externalResult: 'complete',
        requestId: '00000000-0000-4000-8000-000000000001',
      },
      { status: 'reported', inputTokens: 100, outputTokens: 100 },
    ),
  );
  const confirmSchemaFailure = vi.fn();
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, {
    ...v.binding,
    confirmSchemaFailure,
  });
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(confirmSchemaFailure).not.toHaveBeenCalled();
  expect(report.budget.requests).toBe(49);
  expect(report.budget.stopped).toBe('experiment_arm_failed');
  expect(report.cases[0]!.single.grade).toBeNull();
  expect(report.allCasesAttempted).toBe(false);
});

it('未知传输结果追加0.0642 USD保守预留，停止且不重试', async () => {
  const v = cloudflareFixture();
  v.generate.mockRejectedValue(new Error('受控未知传输结果'));
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.budget.stopped).toBe('unknown_outcome');
  expect(report.budget.spent).toBe('0.1306176');
  expect(report.budget.reservedUnknown).toBe('0.2568');
  expect(report.budget.committed).toBe('0.3874176');
  expect(report.cases[0]!.single.requests[0]!.facts.at(-1)!.cost.status).toBe('unknown');
});

it('派发前容纳未知预留，接收后费用未知也保留而不补0', () => {
  const v = cloudflareFixture();
  const tight = createLiveExperimentBudget(v.protocol, {
    amount: '4.99',
    reservedUnknown: '0.1926',
    requests: 48,
  });
  expect(tight.reserve([], 0, 0, 1)).toBeNull();
  expect(tight.snapshot().requests).toBe(48);
  const budget = createLiveExperimentBudget(v.protocol, {
    amount: '0.3232176',
    reservedUnknown: '0.1926',
    requests: 48,
  });
  expect(budget.reserve([], 0, 0, 1)).not.toBeNull();
  budget.settle(
    {
      usage: { status: 'unknown', inputTokens: null, outputTokens: null },
      providerCost: null,
      providerCostCurrency: null,
    },
    v.protocol.model.id,
  );
  expect(budget.snapshot().reservedUnknown).toBe('0.2568');
  expect(budget.snapshot().committed).toBe('0.3874176');
  expect(budget.snapshot().stopped).toBe('cost_unknown');
});

async function cloudflareFirstFailure() {
  const v = cloudflareFixture();
  v.generate.mockRejectedValueOnce(
    new AiSdkGenerationError({
      code: 'provider_rejected',
      phase: 'response_headers',
      summary: '受控Cloudflare429',
      externalResult: 'rejected_before_generation',
      requestId: '00000000-0000-4000-8000-000000000001',
      upstreamStatus: 429,
    }),
  );
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(1);
  v.generate.mockClear();
  const continuation: LiveRateLimitContinuation = {
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    ...report.cases[0]!,
    historicalBudget: v.history,
    realRequestsTotal: report.budget.requests,
  };
  const binding = { baseURL: v.binding.baseURL, apiKey: v.binding.apiKey, generate: v.generate };
  return { ...v, binding, continuation };
}

it('Cloudflare续接保留旧失败，organize验证后最多19次，在68次内覆盖同五例', async () => {
  const v = await cloudflareFirstFailure();
  const original = structuredClone(v.continuation.single);
  expect(verifyFirstRateLimitContinuation(v.protocol, v.continuation).initial).toEqual({
    amount: '0.3874176',
    reservedUnknown: '0.2568',
    requests: 49,
  });
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.continuation,
  );
  expect(v.generate).toHaveBeenCalledTimes(19);
  expect(report.cases[0]!.staged.requests[0]!.stage).toBe('organize');
  expect(report.cases[0]!.single).toEqual(original);
  expect(report.reusedRequests).toBe(1);
  expect(report.actualModelRequests).toBe(20);
  expect(report.budget.requests).toBe(68);
  expect(report.budget.reservedUnknown).toBe('0.2568');
  expect(report.budget.committed).toBe('0.3874176');
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.pairedQualitySamples).toBe(4);
  expect(report.evaluation.singleFailureRate).toBe(0.2);
  expect(report.evaluation.criteria.minimumCases).toBe(false);
});

it('Cloudflare首个续接请求未知时止于50次，新增预留且原失败不重发', async () => {
  const v = await cloudflareFirstFailure();
  v.generate.mockRejectedValue(new Error('受控未知结果'));
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.continuation,
  );
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.budget.requests).toBe(50);
  expect(report.budget.stopped).toBe('unknown_outcome');
  expect(report.budget.spent).toBe('0.1306176');
  expect(report.budget.reservedUnknown).toBe('0.321');
  expect(report.budget.committed).toBe('0.4516176');
  expect(report.cases[0]!.single).toEqual(v.continuation.single);
  expect(report.allCasesAttempted).toBe(false);
});

it('Cloudflare续接已知用量Schema失败仍停止，不套用免费负样本继续', async () => {
  const v = await cloudflareFirstFailure();
  v.generate.mockRejectedValue(
    new AiSdkGenerationError(
      {
        code: 'schema_invalid',
        phase: 'validation',
        summary: '受控结构失败',
        externalResult: 'complete',
        requestId: '00000000-0000-4000-8000-000000000002',
      },
      { status: 'reported', inputTokens: 100, outputTokens: 100 },
    ),
  );
  const confirmSchemaFailure = vi.fn();
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    { ...v.binding, confirmSchemaFailure },
    undefined,
    v.continuation,
  );
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(confirmSchemaFailure).not.toHaveBeenCalled();
  expect(report.budget.requests).toBe(50);
  expect(report.budget.stopped).toBe('continuation_arm_failed');
  expect(report.cases).toHaveLength(1);
  expect(report.cases[0]!.staged.grade).toBeNull();
});

it('Cloudflare续接拒绝49起点、原未知预留、评分及零派发事实漂移', async () => {
  const v = await cloudflareFirstFailure();
  const changes: Array<(value: LiveRateLimitContinuation) => void> = [
    (value) => {
      value.realRequestsTotal = 50;
    },
    (value) => {
      value.historicalBudget.requests = 47;
    },
    (value) => {
      value.historicalBudget.reservedUnknown = '0';
    },
    (value) => {
      value.single.grade = 1;
    },
    (value) => {
      value.staged.requests = value.single.requests;
    },
  ];
  for (const change of changes) {
    const value = structuredClone(v.continuation);
    change(value);
    await expect(
      runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding, undefined, value),
    ).rejects.toThrow();
  }
  expect(v.generate).not.toHaveBeenCalled();
});
