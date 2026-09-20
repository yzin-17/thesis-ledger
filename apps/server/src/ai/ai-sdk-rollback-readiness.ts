import { aiExecutionSummarySchema } from '@thesis-ledger/schemas';

export type AiRollbackRunSample = {
  id: string;
  status: string;
  errorCode: string | null;
  modelMetadata: unknown;
};

export type OptimizationRollbackSample = {
  id: string;
  status: string;
  aiRunId: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const assessAiSdkRollbackReadiness = (
  runs: readonly AiRollbackRunSample[],
  attempts: readonly OptimizationRollbackSample[],
) => {
  const activeRunIds: string[] = [];
  const invalidFactRunIds: string[] = [];
  const unsettledRequestRunIds: string[] = [];
  const protectedUnknownRunIds: string[] = [];
  let sdkFactCount = 0;
  let legacyFactCount = 0;

  for (const run of runs) {
    if (run.status === 'queued' || run.status === 'running') activeRunIds.push(run.id);
    if (
      run.errorCode === 'research_unknown_outcome' ||
      run.errorCode === 'optimization_unknown_outcome'
    )
      protectedUnknownRunIds.push(run.id);
    const sdkExecution = asRecord(run.modelMetadata)?.sdkExecution;
    if (sdkExecution === undefined) {
      legacyFactCount += 1;
      continue;
    }
    const parsed = aiExecutionSummarySchema.safeParse(sdkExecution);
    if (!parsed.success) {
      invalidFactRunIds.push(run.id);
      continue;
    }
    sdkFactCount += 1;
    if (parsed.data.requests.some((request) => request.state !== 'completed'))
      unsettledRequestRunIds.push(run.id);
  }

  const activeAttemptIds = attempts
    .filter((attempt) => attempt.status === 'reserved' || attempt.status === 'running')
    .map((attempt) => attempt.id);
  const protectedUnknownAttemptIds = attempts
    .filter((attempt) => attempt.status === 'unknown_outcome')
    .map((attempt) => attempt.id);
  const blockers: string[] = [];
  if (activeRunIds.length > 0) blockers.push('active_ai_runs');
  if (activeAttemptIds.length > 0) blockers.push('active_optimization_attempts');
  if (invalidFactRunIds.length > 0) blockers.push('invalid_sdk_execution_facts');
  if (unsettledRequestRunIds.length > 0) blockers.push('unsettled_sdk_requests');

  return {
    version: 'ai-sdk-rollback-readiness-v1' as const,
    decision: blockers.length === 0 ? ('ready' as const) : ('keep_tasks_disabled' as const),
    blockers,
    counts: {
      runs: runs.length,
      sdkFacts: sdkFactCount,
      legacyFacts: legacyFactCount,
      activeRuns: activeRunIds.length,
      invalidSdkFacts: invalidFactRunIds.length,
      unsettledRequests: unsettledRequestRunIds.length,
      activeAttempts: activeAttemptIds.length,
      protectedUnknownRuns: protectedUnknownRunIds.length,
      protectedUnknownAttempts: protectedUnknownAttemptIds.length,
    },
    ids: {
      activeRunIds,
      invalidFactRunIds,
      unsettledRequestRunIds,
      activeAttemptIds,
      protectedUnknownRunIds,
      protectedUnknownAttemptIds,
    },
  };
};
