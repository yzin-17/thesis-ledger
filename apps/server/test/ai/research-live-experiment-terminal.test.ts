import { expect, it } from 'vitest';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import {
  verifyTerminalContinuation,
  type LiveTerminalContinuation,
} from '../../src/ai/research-live-experiment-terminal.js';
import { verifyFreeProbeBudget } from '../../src/ai/research-live-experiment-supplemental.js';

import {
  terminalFixture as fixture,
  controlledProviderRejected as rejected,
} from './research-live-experiment-fixture.js';

it('原3个失败尝试保留，补充测试只算一次，新21次完整接续累计46次', async () => {
  const v = await fixture();
  const retained = structuredClone(v.source.retainedArms);
  const ready = verifyTerminalContinuation(v.protocol, v.benchmark, v.evaluation, v.source);
  expect(ready.initial).toEqual({ amount: '0.3232176', reservedUnknown: '0.1926', requests: 25 });
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(21);
  expect(report.budget.requests).toBe(46);
  expect(report.actualModelRequests).toBe(24);
  expect(report.reusedRequests).toBe(3);
  expect(report.allCasesAttempted).toBe(true);
  expect(report.evaluation.pairedQualitySamples).toBe(5);
  expect(report.supplementalBudget).toEqual(v.source.supplementalBudget);
  expect(report.budget.committed).toBe('0.3232176');
  expect(report.budget.reservedUnknown).toBe('0.1926');
  expect(report.evaluation.criteria.minimumCases).toBe(false);
  expect(v.source.retainedArms).toEqual(retained);
  expect(report.cases[0]!.single).toEqual(retained[0]!.result);
  expect(report.cases[0]!.staged).toEqual(retained[1]!.result);
  expect(report.cases[1]!.staged).toEqual(retained[2]!.result);
});

it('下一零派发组失败只新增1次，本地累计26次，原失败不重做', async () => {
  const v = await fixture();
  v.generate.mockRejectedValue(rejected());
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.source,
  );
  expect(v.generate).toHaveBeenCalledTimes(1);
  expect(report.budget.requests).toBe(26);
  expect(report.cases).toHaveLength(2);
  expect(report.cases[1]!.single.requests).toHaveLength(1);
  expect(report.cases[1]!.staged).toEqual(v.source.retainedArms[2]!.result);
  expect(report.budget.stopped).toBe('unknown_outcome');
});

it('完成组重算后再次接续不会重发；补充计量不重复加入额外失败分母', async () => {
  const v = await fixture();
  const report = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    v.source,
  );
  const retainedArms = report.cases.flatMap((entry, index) =>
    (index % 2 === 0 ? (['single', 'staged'] as const) : (['staged', 'single'] as const)).map(
      (arm) => ({ caseId: entry.caseId, arm, result: entry[arm] }),
    ),
  );
  const source: LiveTerminalContinuation = {
    ...v.source,
    retainedArms,
    sourceRequests: 46,
    sourceSupplementalRequests: 1,
  };
  v.generate.mockClear();
  const resumed = await runLiveResearchExperiment(
    v.protocol,
    v.benchmark,
    v.evaluation,
    v.binding,
    undefined,
    source,
  );
  expect(v.generate).not.toHaveBeenCalled();
  expect(resumed.budget.requests).toBe(46);
  expect(resumed.priorUnknownRequests).toEqual([]);
  expect(resumed.evaluation.singleAttemptedArms).toBe(7);
  expect(resumed.evaluation.stagedAttemptedArms).toBe(7);
});

it('拒绝保留失败/顺序/审计/费用/评分/补充预算的篡改', async () => {
  const v = await fixture();
  const mutations: Array<(source: LiveTerminalContinuation) => void> = [
    (s) => {
      s.sourceProtocolFingerprint = '0'.repeat(64);
    },
    (s) => {
      s.retainedArms[0]!.result.grade = 1;
    },
    (s) => {
      s.retainedArms[0]!.result.requests[0]!.facts.pop();
    },
    (s) => {
      s.retainedArms[1]!.result.requests[0]!.stage = 'challenge';
    },
    (s) => {
      s.retainedArms[1]!.result.requests[0]!.facts.at(-1)!.cost.amount = '0.1';
    },
    (s) => {
      s.sourceRequests = 23;
    },
    (s) => {
      s.sourceSupplementalRequests = 2;
    },
    (s) => {
      s.supplementalBudget.entries.push(s.supplementalBudget.entries[0]!);
    },
    (s) => {
      s.retainedArms[2]!.result.requests[0]!.requestId =
        s.retainedArms[0]!.result.requests[0]!.requestId;
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
  expect(v.generate).not.toHaveBeenCalled();
  expect(() =>
    verifyFreeProbeBudget({
      version: 'research-free-probe-budget-v1',
      entries: [
        {
          requestId: 'not-upstream-or-local-uuid',
          resultSHA256: 'b'.repeat(64),
          providerReportedCostUSD: '0',
        },
      ],
    }),
  ).toThrow();
});
