import {
  availabilityForDecision,
  type BacktestResearchClock,
} from './backtest-observation-clock.js';

/** Ledger 时间检查；研究时钟仅调整模拟调度，不改来源 availableAt。 */
export function simulationEventAvailabilityIssue(
  occurredAt: string,
  availableAt: string,
  evaluationAt: string,
  allowKnowledgeBeforeOccurrence = false,
  researchClock?: BacktestResearchClock,
): { code: 'INVALID_TIME' | 'FUTURE_DATA'; reason: string } | undefined {
  const occurred = Date.parse(occurredAt);
  const source = Date.parse(availableAt);
  const effective = availabilityForDecision({
    availableAt,
    ...(researchClock ? { researchClock } : {}),
  });
  const available = effective ? Date.parse(effective) : NaN;
  const evaluation = Date.parse(evaluationAt);
  if (
    ![occurred, source, available, evaluation].every(Number.isFinite) ||
    (researchClock && Date.parse(researchClock.decisionAt) !== occurred)
  )
    return { code: 'INVALID_TIME', reason: 'Simulation Event 时间无效' };
  if (!allowKnowledgeBeforeOccurrence && source < occurred)
    return { code: 'INVALID_TIME', reason: 'availableAt 不能早于 occurredAt' };
  if (occurred > evaluation) return { code: 'FUTURE_DATA', reason: 'Simulation Event 尚未发生' };
  if (available > evaluation)
    return { code: 'FUTURE_DATA', reason: 'Simulation Event 在评估时尚不可用' };
  return undefined;
}
