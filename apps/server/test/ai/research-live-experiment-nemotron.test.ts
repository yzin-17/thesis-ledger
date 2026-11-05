import { expect, it, vi } from 'vitest';
import { openRouterFixture } from './research-live-experiment-fixture.js';
import {
  qualifyLiveExperiment,
  NEMOTRON_SCREENING_CASE_IDS,
  OPENROUTER_EXPERIMENT_NEMOTRON_MODEL,
} from '../../src/ai/research-live-experiment-protocol.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import type { LiveExperimentBinding } from '../../src/ai/research-live-experiment-arm.js';

function fixture() {
  const v = openRouterFixture();
  v.protocol.model = {
    providerId: 'openrouter',
    id: OPENROUTER_EXPERIMENT_NEMOTRON_MODEL,
    canonicalId: 'nvidia/nemotron-3.5-super-vl-20261015',
    revision: 'sealed-nemotron',
  };
  v.protocol.caseIds = [...NEMOTRON_SCREENING_CASE_IDS];
  v.history.requests = 28;
  const binding: LiveExperimentBinding = {
    ...v.binding,
    supplementalBudget: {
      version: 'research-free-probe-budget-v1',
      entries: [
        {
          requestId: '00000000-0000-4000-8000-000000000001',
          resultSHA256: 'b'.repeat(64),
          providerReportedCostUSD: '0',
        },
      ],
    },
  };
  return { ...v, binding };
}

it('Nemotron精确固定5例及顺序，旧型号仍须7例', () => {
  const v = fixture();
  expect(qualifyLiveExperiment(v.protocol, v.benchmark, v.evaluation).protocol).toEqual(v.protocol);
  for (const ids of [
    v.protocol.caseIds.slice(0, 4),
    [...v.protocol.caseIds].reverse(),
    [...v.protocol.caseIds, 'stale-price'],
  ]) {
    expect(() =>
      qualifyLiveExperiment({ ...v.protocol, caseIds: ids }, v.benchmark, v.evaluation),
    ).toThrow();
  }
  const old = openRouterFixture();
  expect(() =>
    qualifyLiveExperiment(
      { ...old.protocol, caseIds: v.protocol.caseIds },
      old.benchmark,
      old.evaluation,
    ),
  ).toThrow();
});

it('历史28次加独立补充1次初始化29，新5例完整20次止于49，不复用旧评分', async () => {
  const v = fixture();
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(20);
  expect(report.budget.requests).toBe(49);
  expect(report.budget.committed).toBe('0.3232176');
  expect(report.budget.reservedUnknown).toBe('0.1926');
  expect(report.historicalBudget?.requests).toBe(28);
  expect(report.supplementalBudget?.entries).toHaveLength(1);
  expect(report.reusedRequests).toBe(0);
  expect(report.cases.map((c) => c.caseId)).toEqual(NEMOTRON_SCREENING_CASE_IDS);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.criteria.minimumCases).toBe(false);
  expect(report.evaluation.decision).toBe('keep_single');
});

it('不足20次头寸、重复补充回执及独立补充缺历史均在派发前拒绝', async () => {
  for (const change of ['headroom', 'duplicate', 'missing-history']) {
    const v = fixture();
    if (change === 'headroom') v.history.requests = 30;
    if (change === 'duplicate')
      v.binding.supplementalBudget!.entries.push(v.binding.supplementalBudget!.entries[0]!);
    if (change === 'missing-history') delete v.binding.history;
    await expect(
      runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding),
    ).rejects.toThrow();
    expect(v.generate).not.toHaveBeenCalled();
  }
});

function schemaFailure() {
  return new AiSdkGenerationError(
    {
      code: 'schema_invalid',
      phase: 'validation',
      summary: '受控结构失败',
      externalResult: 'complete',
      requestId: '00000000-0000-4000-8000-000000000002',
    },
    { status: 'reported', inputTokens: 100, outputTokens: 100 },
  );
}

it('新型号首轮已知用量Schema失败若未核实也立即停止', async () => {
  const v = fixture();
  v.generate.mockRejectedValue(schemaFailure());
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.budget.stopped).toBe('experiment_arm_failed');
  expect(report.budget.requests).toBe(30);
  expect(report.cases[0]!.single.grade).toBeNull();
  expect(report.allCasesAttempted).toBe(false);
});

it('逐条核实Schema负样本后只继续零派发组，不填分；未知失败不调用确认器', async () => {
  const v = fixture();
  v.generate.mockRejectedValue(schemaFailure());
  const confirm = vi.fn(async (request) => ({
    requestId: request.requestId,
    generationId: 'gen-test-confirmed',
    actualModel: v.protocol.model.id,
    totalCostUSD: '0',
    usageMatches: true,
    metadataConfirmed: true,
    jsonValid: true,
    schemaValid: false,
  }));
  v.binding.confirmSchemaFailure = confirm;
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, v.binding);
  expect(v.generate).toHaveBeenCalledTimes(10);
  expect(confirm).toHaveBeenCalledTimes(10);
  expect(report.confirmedSchemaFailures).toHaveLength(10);
  expect(report.budget.requests).toBe(39);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.pairedQualitySamples).toBe(0);
  expect(report.evaluation.decision).toBe('keep_single');
  const unknown = fixture();
  unknown.generate.mockRejectedValue(new Error('受控未知错误'));
  unknown.binding.confirmSchemaFailure = confirm;
  confirm.mockClear();
  const stopped = await runLiveResearchExperiment(
    unknown.protocol,
    unknown.benchmark,
    unknown.evaluation,
    unknown.binding,
  );
  expect(unknown.generate).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(stopped.budget.stopped).toBe('unknown_outcome');
});
