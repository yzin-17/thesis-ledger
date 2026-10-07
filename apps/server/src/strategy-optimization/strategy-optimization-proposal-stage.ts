import { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import type { CandidateRow } from './strategy-optimization-common.js';

type AttemptOutcome = { status: string; errorCode: string | null };
type CandidateOutcome = Pick<CandidateRow, 'validationStatus'>;

const formatFailureCodes = new Set(['optimization_schema_invalid', 'optimization_invalid_json']);

export const proposalStageFailureReason = (
  candidates: readonly CandidateOutcome[],
  attempts: readonly AttemptOutcome[],
) => {
  if (candidates.some((candidate) => candidate.validationStatus === 'valid')) return null;
  if (candidates.length > 0) return 'no_valid_candidate';
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
) => {
  const attempts = candidates.some((candidate) => candidate.validationStatus === 'valid')
    ? []
    : await prisma.$queryRaw<AttemptOutcome[]>(Prisma.sql`
        SELECT attempt."status", run."errorCode"
        FROM "OptimizationAttempt" AS attempt
        LEFT JOIN "AiRun" AS run ON run."id"=attempt."aiRunId"
        WHERE attempt."experimentId"=${experimentId}::uuid
      `);
  const reason = proposalStageFailureReason(candidates, attempts);
  if (reason) return reason;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "OptimizationExperiment"
    SET "status"='awaiting_finalization', "stage"='awaiting_finalization', "leaseUntil"=NULL,
        "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${experimentId}::uuid AND "cancelRequestedAt" IS NULL
  `);
  return null;
};
