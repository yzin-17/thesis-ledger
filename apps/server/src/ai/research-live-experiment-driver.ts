import { experimentFingerprint } from './research-experiment-protocol.js';
import { createLiveExperimentBudget } from './research-live-experiment-budget.js';
import {
  qualifyLiveExperiment,
  OPENROUTER_EXPERIMENT_NEMOTRON_MODEL,
} from './research-live-experiment-protocol.js';
import {
  evaluateLiveExperiment,
  scoreLiveResearchOutput,
} from './research-live-experiment-evaluation.js';
import {
  runLiveResearchArm,
  type LiveExperimentBinding,
  type LiveArmResult,
} from './research-live-experiment-arm.js';
import {
  verifyLiveExperimentResume,
  verifyFreshLiveExperimentBudget,
  type LiveExperimentResume,
} from './research-live-experiment-resume.js';
import {
  verifyFirstRateLimitContinuation,
  type LiveRateLimitContinuation,
} from './research-live-experiment-continuation.js';
import {
  verifyTerminalContinuation,
  type LiveTerminalContinuation,
} from './research-live-experiment-terminal.js';
import type { LiveSupplementalBudget } from './research-live-experiment-supplemental.js';
import { confirmLiveSchemaFailure } from './research-live-experiment-failure-policy.js';
import { liveExperimentTargetMatches } from './research-live-experiment-target.js';

export async function runLiveResearchExperiment(
  raw: unknown,
  rawCases: unknown,
  rawEvaluation: unknown,
  binding: LiveExperimentBinding,
  resume?: LiveExperimentResume,
  continuation?: LiveRateLimitContinuation | LiveTerminalContinuation,
) {
  const { protocol, benchmark, evaluation } = qualifyLiveExperiment(raw, rawCases, rawEvaluation);
  if (protocol.version !== 'research-live-experiment-v2' && !binding.history && !continuation)
    throw new Error('固定子集筛查必须带入累计历史预算');
  if (!liveExperimentTargetMatches(protocol, binding))
    throw new Error('真实实验目标或鉴权与封存Provider不符');
  if ((resume && (binding.history || continuation)) || (continuation && binding.history))
    throw new Error('接续与另附预算不能混用');
  if (binding.supplementalBudget && (!binding.history || resume || continuation))
    throw new Error('独立补充预算只允许与跨协议历史一同启动');
  let recovered: ReturnType<typeof verifyLiveExperimentResume>;
  let supplementalBudget: LiveSupplementalBudget | null = null;
  if (continuation && 'kind' in continuation) {
    const terminal = verifyTerminalContinuation(protocol, benchmark, evaluation, continuation);
    recovered = terminal;
    supplementalBudget = terminal.supplementalBudget;
  } else if (continuation) recovered = verifyFirstRateLimitContinuation(protocol, continuation);
  else recovered = verifyLiveExperimentResume(protocol, benchmark, evaluation, resume);
  const history = continuation?.historicalBudget ?? binding.history;
  const fresh =
    !continuation && history
      ? verifyFreshLiveExperimentBudget(protocol, history, binding.supplementalBudget)
      : null;
  const initial = fresh?.initial ?? recovered.initial;
  if (fresh) supplementalBudget = fresh.supplementalBudget;
  const budget = createLiveExperimentBudget(protocol, initial);
  const selectedCases =
    protocol.version !== 'research-live-experiment-v2'
      ? protocol.caseIds.map((id) => benchmark.cases.find((entry) => entry.id === id)!)
      : benchmark.cases;
  const cases: Array<{ caseId: string; single: LiveArmResult; staged: LiveArmResult }> = [];
  const confirmedSchemaFailures = [];
  for (const [index, entry] of selectedCases.entries()) {
    if (budget.snapshot().stopped || binding.signal?.aborted) break;
    const order: Array<'single' | 'staged'> =
      index % 2 === 0 ? ['single', 'staged'] : ['staged', 'single'];
    const arms = {} as Record<'single' | 'staged', LiveArmResult>;
    for (const arm of order) {
      const reused = recovered.completed.get(entry.id + ':' + arm);
      if (reused) {
        arms[arm] = reused;
        continue;
      }
      const result = await runLiveResearchArm(entry, arm, protocol, binding, budget);
      const score = scoreLiveResearchOutput(
        result.output,
        evaluation.cases.find((value) => value.caseId === entry.id)!,
      );
      result.grade = score.grade;
      result.scoreChecks = score.checks;
      arms[arm] = result;
      if (
        protocol.version !== 'research-live-experiment-v5' &&
        (continuation ||
          protocol.model.id === OPENROUTER_EXPERIMENT_NEMOTRON_MODEL ||
          protocol.version === 'research-live-experiment-v4') &&
        result.status !== 'complete' &&
        !budget.snapshot().stopped
      ) {
        const confirmation = await confirmLiveSchemaFailure(
          protocol,
          result,
          binding.confirmSchemaFailure,
        );
        if (confirmation) confirmedSchemaFailures.push({ caseId: entry.id, arm, ...confirmation });
        else budget.stop(continuation ? 'continuation_arm_failed' : 'experiment_arm_failed');
      }
      binding.onArm?.({ caseId: entry.id, arm, result });
    }
    cases.push({ caseId: entry.id, ...arms });
  }
  return {
    version: 'research-live-experiment-report-v1',
    protocolFingerprint: experimentFingerprint(protocol),
    benchmarkFingerprint: protocol.benchmarkFingerprint,
    evaluationFingerprint: protocol.evaluationFingerprint,
    datasetKind: benchmark.datasetKind,
    model: protocol.model,
    plannedCases: selectedCases.length,
    budget: budget.snapshot(),
    cases,
    evaluation: evaluateLiveExperiment(cases, recovered.unresolved),
    priorUnknownRequests: recovered.unresolved,
    historicalBudget: history ?? null,
    supplementalBudget,
    confirmedSchemaFailures,
    requestCountMeaning: 'local_post_attempts',
    reusedRequests: [...recovered.completed.values()].reduce(
      (sum, value) => sum + value.requests.length,
      0,
    ),
    allCasesAttempted:
      cases.length === selectedCases.length &&
      cases.every((entry) => entry.single.requests.length > 0 && entry.staged.requests.length > 0),
    actualModelRequests: cases.reduce(
      (sum, entry) => sum + entry.single.requests.length + entry.staged.requests.length,
      0,
    ),
  };
}
