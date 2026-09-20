import { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import { redactOptimizationError } from './strategy-optimization-common.js';

export type OptimizationStepRow = {
  id: string;
  experimentId: string;
  modelKey: string;
  aiRunId: string | null;
  attempt: number;
  status: string;
  proposal: unknown;
  error: string | null;
  startedAt: Date | null;
  leaseUntil: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export const markOptimizationUnknownOutcome = async (
  prisma: PrismaService,
  step: OptimizationStepRow,
  error: unknown,
  durationMs?: number,
) => {
  const summary = redactOptimizationError(error);
  const rows = await prisma.$queryRaw<Array<{ aiRunId: string | null }>>(Prisma.sql`
    UPDATE "OptimizationAttempt"
    SET "status"='unknown_outcome', "error"=${summary}, "leaseUntil"=NULL, "completedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${step.id}::uuid AND "status"='running'
    RETURNING "aiRunId"
  `);
  const aiRunId = rows[0]?.aiRunId ?? step.aiRunId;
  if (!aiRunId) return;
  await prisma.aiRun.updateMany({
    where: { id: aiRunId, status: 'running' },
    data: {
      status: 'failed',
      errorCode: 'optimization_unknown_outcome',
      errorSummary: summary,
      completedAt: new Date(),
      claimedAt: null,
      leaseUntil: null,
      ...(durationMs === undefined ? {} : { durationMs }),
    },
  });
};

export const markOptimizationKnownFailure = async (
  prisma: PrismaService,
  step: OptimizationStepRow,
  error: unknown,
  durationMs?: number,
) => {
  const summary = redactOptimizationError(error);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "OptimizationAttempt"
    SET "status"='failed', "error"=${summary}, "leaseUntil"=NULL, "completedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${step.id}::uuid AND "status"='running'
  `);
  if (!step.aiRunId) return;
  await prisma.aiRun.updateMany({
    where: { id: step.aiRunId, status: 'running' },
    data: {
      status: 'failed',
      errorCode: 'optimization_proposal_failed',
      errorSummary: summary,
      completedAt: new Date(),
      claimedAt: null,
      leaseUntil: null,
      ...(durationMs === undefined ? {} : { durationMs }),
    },
  });
};
