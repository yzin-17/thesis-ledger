import { PrismaService } from '../platform/prisma.service.js';
import {
  assessAiSdkRollbackReadiness,
  type OptimizationRollbackSample,
} from './ai-sdk-rollback-readiness.js';

const main = async () => {
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const [runs, attempts] = await Promise.all([
      prisma.aiRun.findMany({
        select: { id: true, status: true, errorCode: true, modelMetadata: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.$queryRaw<OptimizationRollbackSample[]>`
        SELECT "id", "status", "aiRunId"
        FROM "OptimizationAttempt"
        WHERE "status" IN ('reserved', 'running', 'unknown_outcome')
        ORDER BY "createdAt" ASC, "id" ASC
      `,
    ]);
    const result = assessAiSdkRollbackReadiness(runs, attempts);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.decision !== 'ready') process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '回滚预检失败';
  process.stderr.write(`${JSON.stringify({ error: message.slice(0, 500) })}\n`);
  process.exitCode = 1;
});
