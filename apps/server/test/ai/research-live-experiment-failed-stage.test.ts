import { expect, it } from 'vitest';
import { openRouterFixture } from './research-live-experiment-fixture.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import {
  verifyTerminalContinuation,
  type LiveTerminalContinuation,
} from '../../src/ai/research-live-experiment-terminal.js';
import {
  OPENROUTER_EXPERIMENT_NEMOTRON_MODEL,
  NEMOTRON_SCREENING_CASE_IDS,
} from '../../src/ai/research-live-experiment-protocol.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation-facts.js';
import type { LiveExperimentBinding } from '../../src/ai/research-live-experiment-arm.js';

async function fixture() {
  const v = openRouterFixture();
  v.protocol.model = {
    providerId: 'openrouter',
    id: OPENROUTER_EXPERIMENT_NEMOTRON_MODEL,
    canonicalId: 'nvidia/nemotron-3.5-super-vl-20261015',
    revision: 'sealed-stage-test',
  };
  v.protocol.caseIds = [...NEMOTRON_SCREENING_CASE_IDS];
  const generate = v.generate.getMockImplementation()!;
  const stageOutputs: NonNullable<LiveTerminalContinuation['retainedStageOutputs']> = [];
  const binding: LiveExperimentBinding = {
    ...v.binding,
    onRequest: (entry) => {
      if (entry.arm === 'staged' && entry.phase === 'settled' && entry.output)
        stageOutputs.push({
          requestId: entry.request.requestId,
          output: structuredClone(entry.output),
        });
    },
  };
  let count = 0;
  v.generate.mockImplementation(async (request) => {
    if (++count === 4)
      throw new AiSdkGenerationError(
        {
          code: 'schema_invalid',
          phase: 'validation',
          summary: '受控末段结构失败',
          externalResult: 'complete',
          requestId: request.requestId,
        },
        { status: 'reported', inputTokens: 100, outputTokens: 100 },
      );
    return generate(request);
  });
  const report = await runLiveResearchExperiment(v.protocol, v.benchmark, v.evaluation, binding);
  const source: LiveTerminalContinuation = {
    kind: 'terminal-groups-v1',
    sourceProtocolFingerprint: experimentFingerprint(v.protocol),
    retainedArms: ['single', 'staged'].map((arm) => ({
      caseId: 'single-price',
      arm: arm as 'single' | 'staged',
      result: report.cases[0]![arm as 'single' | 'staged'],
    })),
    historicalBudget: v.history,
    sourceRequests: report.budget.requests,
    sourceSupplementalRequests: 0,
    supplementalBudget: { version: 'research-free-probe-budget-v1', entries: [] },
    retainedStageOutputs: structuredClone(stageOutputs),
  };
  return { ...v, binding, source, originalGenerate: generate };
}

it('完整保留三段失败组及前两段核验输出，接续只执行其它零派发组', async () => {
  const v = await fixture();
  expect(v.source.retainedArms[1]!.result.requests).toHaveLength(3);
  expect(v.source.retainedStageOutputs).toHaveLength(2);
  const verified = verifyTerminalContinuation(v.protocol, v.benchmark, v.evaluation, v.source);
  expect(verified.initial.requests).toBe(24);
  const originalFailed = structuredClone(v.source.retainedArms[1]!.result);
  v.generate.mockClear();
  v.generate.mockImplementation(v.originalGenerate);
  const continuationBinding = { ...v.binding };
  delete continuationBinding.history;
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    continuationBinding,
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(16);
  expect(report.reusedRequests).toBe(4);
  expect(report.budget.requests).toBe(40);
  expect(report.cases[0]!.staged).toEqual(originalFailed);
  expect(report.cases[0]!.staged.grade).toBeNull();
  expect(report.allCasesAttempted).toBe(true);
});

it('缺失、重复、多余中间输出及顺序/身份/计量/内容漂移均拒绝', async () => {
  const v = await fixture();
  const mutations: Array<(source: LiveTerminalContinuation) => void> = [
    (s) => {
      s.retainedStageOutputs!.pop();
    },
    (s) => {
      s.retainedStageOutputs!.push(s.retainedStageOutputs![0]!);
    },
    (s) => {
      s.retainedStageOutputs!.push({
        ...s.retainedStageOutputs![0]!,
        requestId: '00000000-0000-4000-8000-000000000099',
      });
    },
    (s) => {
      s.retainedArms[1]!.result.requests[0]!.stage = 'challenge';
    },
    (s) => {
      s.retainedArms[1]!.result.requests[0]!.facts.at(-1)!.actualModel = 'other/model';
    },
    (s) => {
      s.retainedArms[1]!.result.requests[0]!.facts.at(-1)!.usage = null;
    },
    (s) => {
      s.retainedArms[1]!.result.requests[0]!.facts.at(-1)!.cost.amount = '0.01';
    },
    (s) => {
      s.retainedArms[1]!.result.reason = 'provider_rejected';
    },
    (s) => {
      s.retainedArms[1]!.result.criticalViolations = 1;
    },
    (s) => {
      Object.assign(s.retainedStageOutputs![0]!.output, { version: 1 });
      s.retainedArms[1]!.result.requests[0]!.facts.at(-1)!.outputFingerprint =
        experimentFingerprint(s.retainedStageOutputs![0]!.output);
    },
    (s) => {
      const output = s.retainedStageOutputs![0]!.output;
      const number = output.numericClaims[0];
      if (number?.kind === 'field') number.source.value = 999;
      s.retainedArms[1]!.result.requests[0]!.facts.at(-1)!.outputFingerprint =
        experimentFingerprint(output);
    },
  ];
  for (const mutate of mutations) {
    const source = structuredClone(v.source);
    mutate(source);
    expect(() =>
      verifyTerminalContinuation(v.protocol, v.benchmark, v.evaluation, source),
    ).toThrow();
  }
});
