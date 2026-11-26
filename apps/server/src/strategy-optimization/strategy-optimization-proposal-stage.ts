import { Prisma } from '@prisma/client';
import { isStrategyCapabilityGap } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import type { CandidateRow } from './strategy-optimization-common.js';

type AttemptOutcome = { status: string; errorCode: string | null; proposal?: unknown };
type CandidateOutcome = Pick<CandidateRow, 'validationStatus'>;

const formatFailureCodes = new Set(['optimization_schema_invalid', 'optimization_invalid_json']);

export const proposalStageFailureReason = (
  candidates: readonly CandidateOutcome[],
  attempts: readonly AttemptOutcome[],
) => {
  if (candidates.some((candidate) => candidate.validationStatus === 'valid')) return null;
  if (candidates.length > 0) return 'no_valid_candidate';
  if (attempts.length > 0 && attempts.every((attempt) => isStrategyCapabilityGap(attempt.proposal)))
    return 'model_capability_gap';
  if (
    attempts.length > 0 &&
    attempts.every(
      (attempt) => attempt.status === 'failed' && formatFailureCodes.has(attempt.errorCode ?? ''),
    )
  )
    return 'model_format_failure';
  return 'model_generation_failed';
};

export const concludeOptimizationProposalStage = async (
  prisma: PrismaService,
  experimentId: string,
  candidates: readonly CandidateOutcome[],
  executionAttempt: number,
) => {
  const attempts = candidates.some((candidate) => candidate.validationStatus === 'valid')
    ? []
    : await prisma.$queryRaw<AttemptOutcome[]>(Prisma.sql`
        SELECT attempt."status", attempt."proposal", run."errorCode"
        FROM "OptimizationAttempt" AS attempt
        LEFT JOIN "AiRun" AS run ON run."id"=attempt."aiRunId"
        WHERE attempt."experimentId"=${experimentId}::uuid
          AND attempt."attempt">COALESCE((SELECT ("retryState"->>'roundOffset')::int
            FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid), 0)
      `);
  const reason = proposalStageFailureReason(candidates, attempts);
  const status = reason ? 'failed' : 'awaiting_finalization';
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "OptimizationExperiment"
    SET "status"=${status}, "stage"=${status}, "stopReason"=${reason}, "leaseUntil"=NULL,
        "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${experimentId}::uuid AND "cancelRequestedAt" IS NULL
      AND "status"='running' AND "executionAttempt"=${executionAttempt}
  `);
  return updated === 1 ? reason : 'proposal_stage_changed';
};
