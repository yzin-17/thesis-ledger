import { expect, it } from 'vitest';
import { fixture, openRouterFixture } from './research-live-experiment-fixture.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import {
  verifyFirstRateLimitContinuation,
  type LiveRateLimitContinuation,
} from '../../src/ai/research-live-experiment-continuation.js';

async function firstFailure() {
  const v = openRouterFixture(true);
  v.generate.mockRejectedValueOnce(
    new AiSdkGenerationError({
      code: 'provider_rejected',
      phase: 'response_headers',
      summary: '受控429',
      externalResult: 'rejected_before_generation',
      requestId: '00000000-0000-4000-8000-000000000001',
      upstreamStatus: 429,
    }),
  );
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(1);
  const source: LiveRateLimitContinuation = {
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    ...report.cases[0]!,
    historicalBudget: v.history,
    realRequestsTotal: 22,
  };
  v.generate.mockClear();
  const binding = { baseURL: v.binding.baseURL, apiKey: v.binding.apiKey, generate: v.generate };
  return { ...v, binding, source };
}

it('接续保留失败单链，最多新27次，总49次且旧费用/未知预留不变', async () => {
  const v = await firstFailure();
  const original = structuredClone(v.source.single);
  const ready = verifyFirstRateLimitContinuation(v.protocol, v.source);
  expect(ready.initial).toEqual({ amount: '0.3232176', reservedUnknown: '0.1926', requests: 22 });
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(27);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.reusedRequests).toBe(1);
  expect(report.actualModelRequests).toBe(28);
  expect(report.budget.requests).toBe(49);
  expect(report.cases[0]!.single).toEqual(original);
  expect(report.cases[0]!.staged.status).toBe('complete');
  expect(report.evaluation.completedCases).toBe(7);
  expect(report.evaluation.criteria.minimumCases).toBe(false);
  expect(report.priorUnknownRequests).toEqual([]);
  expect(report.budget.reservedUnknown).toBe('0.1926');
  expect(report.budget.committed).toBe('0.3232176');
  expect(report.historicalBudget).toEqual(v.history);
});

it('新未派发阶段再失败时只发一次，旧失败保持且不自动重做', async () => {
  const v = await firstFailure();
  v.generate.mockRejectedValue(new Error('受控传输中断'));
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.actualModelRequests).toBe(2);
  expect(report.reusedRequests).toBe(1);
  expect(report.budget.requests).toBe(23);
  expect(report.budget.stopped).toBe('unknown_outcome');
  expect(report.cases[0]!.staged.requests[0]!.stage).toBe('organize');
  expect(report.cases[0]!.single).toEqual(v.source.single);
});

it('新阶段结构失败即使用量已知也停止，不继续下一案例', async () => {
  const v = await firstFailure();
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
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.cases).toHaveLength(1);
  expect(report.budget.requests).toBe(23);
  expect(report.budget.stopped).toBe('continuation_arm_failed');
  expect(report.cases[0]!.staged.reason).toBe('schema_invalid');
});

it('拒绝协议/评分/未知事实/计数篡改及重复附加预算，生成前停止', async () => {
  const v = await firstFailure();
  const mutations: Array<(source: LiveRateLimitContinuation) => void> = [
    (source) => {
      source.sourceProtocolFingerprint = 'f'.repeat(64);
    },
    (source) => {
      source.single.grade = 1;
    },
    (source) => {
      source.single.requests[0]!.facts.at(-1)!.kind = 'received';
    },
    (source) => {
      source.realRequestsTotal = 21;
    },
    (source) => {
      source.historicalBudget.reservedUnknown = '0';
    },
    (source) => {
      source.caseId = 'stale-price';
    },
    (source) => {
      source.staged.requests = source.single.requests;
    },
  ];
  for (const mutate of mutations) {
    const source = structuredClone(v.source);
    mutate(source);
    await expect(
      runLiveResearchExperiment(
        v.protocol,
        v.benchmark,
        v.evaluation,
        v.binding,
        undefined,
        source,
      ),
    ).rejects.toThrow();
  }
  await expect(
    runLiveResearchExperiment(
      v.protocol,
      v.benchmark,
      v.evaluation,
      { ...v.binding, history: v.history },
      undefined,
      v.source,
    ),
  ).rejects.toThrow('不能混用');
  expect(v.generate).not.toHaveBeenCalled();
  expect(() => verifyFirstRateLimitContinuation(fixture().protocol, v.source)).toThrow();
});
