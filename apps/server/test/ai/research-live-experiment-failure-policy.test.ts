import { expect, it, vi } from 'vitest';
import { terminalFixture, controlledProviderRejected } from './research-live-experiment-fixture.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import type { ExperimentRequestAudit } from '../../src/ai/research-experiment-audit.js';

const invalid = () =>
  new AiSdkGenerationError(
    {
      code: 'schema_invalid',
      phase: 'validation',
      externalResult: 'complete',
      summary: '受控完整JSON违反Schema',
      requestId: '00000000-0000-4000-8000-000000000001',
    },
    { status: 'reported', inputTokens: 100, outputTokens: 100 },
  );

it('逐条已确认Schema负样本终止该组，原7例全部尝试且不补评分', async () => {
  const v = await terminalFixture();
  v.generate.mockRejectedValue(invalid());
  const confirm = vi.fn(async (request: ExperimentRequestAudit) => ({
    requestId: request.requestId,
    generationId: 'gen-' + request.requestId,
    actualModel: v.protocol.model.id,
    totalCostUSD: '0',
    usageMatches: true,
    metadataConfirmed: true,
    jsonValid: true,
    schemaValid: false,
  }));
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    { ...v.binding, confirmSchemaFailure: confirm },
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(11);
  expect(confirm).toHaveBeenCalledTimes(11);
  expect(report.budget.requests).toBe(36);
  expect(report.confirmedSchemaFailures).toHaveLength(11);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.completedCases).toBe(7);
  expect(report.evaluation.pairedQualitySamples).toBe(0);
  expect(report.evaluation.qualityDelta).toBeNull();
  expect(report.evaluation.singleFailureRate).toBe(1);
  expect(report.evaluation.stagedFailureRate).toBe(1);
  expect(
    report.cases.every((entry) => entry.single.grade === null && entry.staged.grade === null),
  ).toBe(true);
  expect(report.budget.stopped).toBeNull();
  expect(report.evaluation.decision).toBe('keep_single');
  expect(report.budget.committed).toBe('0.3232176');
});

it('标识、型号、金额、用量或完成内容无法确认即全局停止', async () => {
  for (const field of [
    'requestId',
    'generationId',
    'actualModel',
    'totalCostUSD',
    'usageMatches',
    'metadataConfirmed',
    'jsonValid',
    'schemaValid',
  ]) {
    const v = await terminalFixture();
    v.generate.mockRejectedValue(invalid());
    const confirm = async (request: ExperimentRequestAudit) => ({
      requestId: request.requestId,
      generationId: 'gen-' + request.requestId,
      actualModel: v.protocol.model.id,
      totalCostUSD: '0',
      usageMatches: true,
      metadataConfirmed: true,
      jsonValid: true,
      schemaValid: false,
      [field]:
        field.endsWith('Id') || field === 'actualModel' || field === 'totalCostUSD'
          ? 'different'
          : false,
    });
    if (field === 'schemaValid') {
      const report = await runLiveResearchExperiment(
        v.protocol,
        v.benchmark,
        v.evaluation,
        {
          ...v.binding,
          confirmSchemaFailure: async (request) => ({
            ...(await confirm(request)),
            schemaValid: true,
          }),
        },
        undefined,
        v.source,
      );
      expect(report.budget.stopped).toBe('continuation_arm_failed');
    } else {
      const report = await runLiveResearchExperiment(
        v.protocol,
        v.benchmark,
        v.evaluation,
        { ...v.binding, confirmSchemaFailure: confirm },
        undefined,
        v.source,
      );
      expect(report.budget.stopped).toBe('continuation_arm_failed');
    }
    expect(v.generate).toHaveBeenCalledTimes(1);
  }
});

it('429/未知费用和其它错误不能通过确认回调继续', async () => {
  const v = await terminalFixture();
  v.generate.mockRejectedValue(controlledProviderRejected());
  const confirm = vi.fn();
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    { ...v.binding, confirmSchemaFailure: confirm },
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(report.budget.stopped).toBe('unknown_outcome');
});
