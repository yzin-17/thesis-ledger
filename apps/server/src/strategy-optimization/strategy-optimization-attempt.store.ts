import { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';

export async function recordOptimizationAttempt(
  prisma: PrismaService,
  input: {
    experimentId: string;
    modelKey: string;
    attempt: number;
    status: string;
    error?: string;
    aiRunId?: string;
    proposal?: unknown;
  },
) {
  if (!['failed', 'unknown_outcome'].includes(input.status)) return;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "OptimizationAttempt"
    SET "status"=${input.status}, "error"=${input.error ?? null}, "leaseUntil"=NULL,
        "completedAt"=CURRENT_TIMESTAMP
    WHERE "experimentId"=${input.experimentId}::uuid AND "modelKey"=${input.modelKey}
      AND "attempt"=${input.attempt} AND "status"='reserved'
  `);
}
