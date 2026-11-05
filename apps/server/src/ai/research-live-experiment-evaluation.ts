import type { ResearchGenerationV2 } from '@thesis-ledger/schemas';
import type { LiveEvaluation } from './research-live-experiment-protocol.js';

export function scoreLiveResearchOutput(
  output: ResearchGenerationV2 | null,
  reference: LiveEvaluation['cases'][number],
) {
  if (output === null) return { grade: null, checks: [] };
  const narrative = JSON.stringify({
    conclusion: output.conclusion,
    rationale: output.rationale,
    claims: output.claims,
    risks: output.risks,
    unknowns: output.unknowns,
    invalidationConditions: output.invalidationConditions,
    nextSteps: output.nextSteps,
  })
    .normalize('NFKC')
    .toLowerCase();
  const checks = reference.criteria.map((criterion) => ({
    description: criterion.description,
    passed: criterion.concepts.every((alternatives) =>
      alternatives.some((term) => narrative.includes(term.normalize('NFKC').toLowerCase())),
    ),
  }));
  return { grade: checks.filter((entry) => entry.passed).length / 4, checks };
}

export interface LiveArmSummary {
  status: 'complete' | 'failed' | 'blocked';
  reason: string | null;
  durationMs: number;
  grade: number | null;
  actualCost: number | null;
  estimatedCost: number;
  criticalViolations: number;
  requests?: readonly unknown[];
}
export function evaluateLiveExperiment(
  cases: Array<{ single: LiveArmSummary; staged: LiveArmSummary }>,
  priorUnknown: Array<{ arm: 'single' | 'staged' }> = [],
) {
  const attempted = (arm: LiveArmSummary) => arm.requests === undefined || arm.requests.length > 0;
  const comparable = cases.filter((entry) => attempted(entry.single) && attempted(entry.staged));
  const pairs = comparable.filter(
    (entry) => entry.single.grade !== null && entry.staged.grade !== null,
  );
  const qualityDelta =
    pairs.length === 0
      ? null
      : pairs.reduce((sum, entry) => sum + entry.staged.grade! - entry.single.grade!, 0) /
        pairs.length;
  const armAttempts = (arm: 'single' | 'staged') => cases.filter((entry) => attempted(entry[arm]));
  const failureRate = (arm: 'single' | 'staged') => {
    const attempts = armAttempts(arm);
    const unknown = priorUnknown.filter((entry) => entry.arm === arm).length;
    const total = attempts.length + unknown;
    if (total === 0) return null;
    return (attempts.filter((entry) => entry[arm].status !== 'complete').length + unknown) / total;
  };
  const singleFailureRate = failureRate('single');
  const stagedFailureRate = failureRate('staged');
  const duration = (arm: 'single' | 'staged') =>
    comparable.reduce((sum, entry) => sum + entry[arm].durationMs, 0);
  const singleDuration = duration('single');
  const observedLatencyRatio = singleDuration > 0 ? duration('staged') / singleDuration : null;
  const latencyRatio = priorUnknown.length === 0 ? observedLatencyRatio : null;
  const actualComplete =
    comparable.length > 0 &&
    cases.every(
      (entry) =>
        (!attempted(entry.single) || entry.single.actualCost !== null) &&
        (!attempted(entry.staged) || entry.staged.actualCost !== null),
    );
  let costRatio: number | null = null;
  if (actualComplete) {
    const single = comparable.reduce((sum, entry) => sum + entry.single.actualCost!, 0);
    const staged = comparable.reduce((sum, entry) => sum + entry.staged.actualCost!, 0);
    if (single > 0) costRatio = staged / single;
    else if (staged === 0) costRatio = 1;
    else costRatio = Number.POSITIVE_INFINITY;
  }
  const criticalViolations = cases.reduce(
    (sum, entry) => sum + entry.single.criticalViolations + entry.staged.criticalViolations,
    0,
  );
  const criteria = {
    minimumCases: comparable.length >= 20,
    quality: pairs.length >= 20 && qualityDelta !== null && qualityDelta >= 0.05,
    failures:
      singleFailureRate !== null &&
      stagedFailureRate !== null &&
      stagedFailureRate <= singleFailureRate,
    latency: latencyRatio !== null && latencyRatio <= 1.5,
    actualCost: costRatio !== null && costRatio <= 1.5,
    zeroCriticalViolations: criticalViolations === 0,
  };
  const eligible = Object.values(criteria).every(Boolean);
  return {
    decision: eligible ? ('eligible_for_activation' as const) : ('keep_single' as const),
    visitedCases: cases.length,
    completedCases: comparable.length,
    singleAttemptedArms: armAttempts('single').length,
    stagedAttemptedArms: armAttempts('staged').length,
    singleUnattemptedArms: cases.length - armAttempts('single').length,
    stagedUnattemptedArms: cases.length - armAttempts('staged').length,
    pairedQualitySamples: pairs.length,
    qualityDelta,
    singleFailureRate,
    stagedFailureRate,
    latencyRatio,
    observedLatencyRatio,
    priorUnknownAttempts: priorUnknown.length,
    costRatio: Number.isFinite(costRatio) ? costRatio : null,
    costRatioInfinite: costRatio === Number.POSITIVE_INFINITY,
    actualCostComplete: actualComplete,
    criticalViolations,
    criteria,
  };
}
