import { readExperimentHistory } from './research-live-experiment-checkpoint.mjs';
import { readFreeProbeLedger } from './research-live-experiment-supplemental.mjs';

export function mergeHistoryProbeBudget(history, references = []) {
  const probes = readFreeProbeLedger(references);
  const covered = new Set(history.supplementalRequestIds);
  const historicalIds = new Set(history.requestIds);
  const pending = probes.budget.entries.filter((entry) => !covered.has(entry.requestId));
  if (pending.some((entry) => historicalIds.has(entry.requestId)))
    throw new Error('补充测试与历史研究请求重复');
  return {
    ...history,
    supplementalBudget: pending.length ? { ...probes.budget, entries: pending } : undefined,
    supplementalBudgetFrom: probes.sourceProof.filter((proof) =>
      pending.some((entry) => entry.resultSHA256 === proof.resultSHA256),
    ),
  };
}

export function readCrossProtocolHistory(directory, protocol, fingerprint, references) {
  return mergeHistoryProbeBudget(
    readExperimentHistory(directory, protocol, fingerprint),
    references,
  );
}
