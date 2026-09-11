import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../platform/prisma.service.js';
import type { CandidateRow } from './strategy-optimization-common.js';
import type { StrategyRiskApplicationService } from './strategy-risk-application.service.js';

export async function previousOptimizationAdoption(
  prisma: PrismaService,
  idempotencyKey: string,
) {
  const rows = await prisma.$queryRaw<Array<{ formalStrategyVersionId: string }>>(Prisma.sql`
    SELECT "formalStrategyVersionId" FROM "OptimizationAdoption"
    WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function candidateOptimizationAdoption(
  prisma: PrismaService,
  candidateId: string,
) {
  const rows = await prisma.$queryRaw<
    Array<{ formalStrategyVersionId: string; idempotencyKey: string }>
  >(Prisma.sql`
    SELECT "formalStrategyVersionId", "idempotencyKey" FROM "OptimizationAdoption"
    WHERE "candidateId"=${candidateId}::uuid LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function replayOptimizationAdoption(
  prisma: PrismaService,
  riskApplications: StrategyRiskApplicationService,
  formalStrategyVersionId: string,
) {
  const formal = await prisma.strategyVersion.findUnique({
    where: { id: formalStrategyVersionId },
  });
  return {
    strategyVersion: formal,
    monitoringPlan: formal ? await riskApplications.monitoringPlan(formal.id) : null,
  };
}

export async function formalizeOptimizationCandidate(
  prisma: PrismaService,
  experimentId: string,
  candidate: CandidateRow,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const candidateVersion = await prisma.strategyVersion.findUnique({
    where: { id: candidate.candidateStrategyVersionId },
  });
  if (!candidateVersion) throw new NotFoundException('候选策略版本不存在');
  const latest = await prisma.strategyVersion.aggregate({
    where: { strategyId: candidateVersion.strategyId, version: { gt: 0 } },
    _max: { version: true },
  });
  if ((latest._max.version ?? 0) !== expectedVersion)
    throw new BadRequestException('正式策略已经发布新版本，请重新确认采纳');
  return prisma.$transaction(async (transaction) => {
    const formal = await transaction.strategyVersion.create({
      data: {
        strategyId: candidateVersion.strategyId,
        version: expectedVersion + 1,
        schemaVersion: 2,
        schema: candidateVersion.schema as Prisma.InputJsonValue,
      },
    });
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAdoption" (
        "experimentId", "candidateId", "idempotencyKey", "candidateHash", "formalStrategyVersionId"
      ) VALUES (
        ${experimentId}::uuid, ${candidate.id}::uuid, ${idempotencyKey},
        ${candidate.executionHash}, ${formal.id}::uuid
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "adoptedStrategyVersionId"=${formal.id}::uuid
      WHERE "id"=${candidate.id}::uuid
    `);
    return formal;
  });
}
