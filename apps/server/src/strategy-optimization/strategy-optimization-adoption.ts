import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { strategySchemaV2, type OptimizationAdoptionErrorCode } from '@thesis-ledger/schemas';
import type { PrismaService } from '../platform/prisma.service.js';
import { optimizationSha256 } from './strategy-optimization-common.js';

export type OptimizationAdoptionRow = {
  id: string;
  experimentId: string;
  candidateId: string;
  idempotencyKey: string;
  candidateHash: string;
  formalStrategyVersionId: string;
  baselineStrategyVersionId: string | null;
  confirmedCurrentStrategyVersionId: string | null;
};

export const adoptionConflict = (
  errorCode: OptimizationAdoptionErrorCode,
  message: string,
  details?: Record<string, unknown>,
) =>
  new ConflictException({
    errorCode,
    message,
    ...(details === undefined ? {} : { details }),
  });

export const adoptionRejected = (
  errorCode: OptimizationAdoptionErrorCode,
  message: string,
  details?: Record<string, unknown>,
) =>
  new BadRequestException({
    errorCode,
    message,
    ...(details === undefined ? {} : { details }),
  });

const adoptionSelect = Prisma.sql`
  SELECT "id", "experimentId", "candidateId", "idempotencyKey", "candidateHash",
         "formalStrategyVersionId", "baselineStrategyVersionId", "confirmedCurrentStrategyVersionId"
  FROM "OptimizationAdoption"
`;

export async function previousOptimizationAdoption(prisma: PrismaService, idempotencyKey: string) {
  const rows = await prisma.$queryRaw<OptimizationAdoptionRow[]>(Prisma.sql`
    ${adoptionSelect}
    WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function candidateOptimizationAdoption(prisma: PrismaService, candidateId: string) {
  const rows = await prisma.$queryRaw<OptimizationAdoptionRow[]>(Prisma.sql`
    ${adoptionSelect}
    WHERE "candidateId"=${candidateId}::uuid LIMIT 1
  `);
  return rows[0] ?? null;
}

type AdoptionQueryClient = Pick<PrismaService, '$queryRaw'>;

export async function adoptionIdempotencyMatches(
  prisma: AdoptionQueryClient,
  adoption: OptimizationAdoptionRow,
  expectedVersion: number,
) {
  const experimentRows = await prisma.$queryRaw<Array<{ sourceMode: string }>>(Prisma.sql`
    SELECT "sourceMode"
    FROM "OptimizationExperiment"
    WHERE "id"=${adoption.experimentId}::uuid
    LIMIT 1
  `);
  const sourceMode = experimentRows[0]?.sourceMode;
  if (sourceMode === 'discovery')
    return adoption.confirmedCurrentStrategyVersionId === null && expectedVersion === 0;
  if (sourceMode !== 'existing' || !adoption.confirmedCurrentStrategyVersionId) return false;
  const currentRows = await prisma.$queryRaw<Array<{ version: number }>>(Prisma.sql`
    SELECT "version"
    FROM "StrategyVersion"
    WHERE "id"=${adoption.confirmedCurrentStrategyVersionId}::uuid
    LIMIT 1
  `);
  return currentRows[0]?.version === expectedVersion;
}

type CandidateWithFacts = {
  id: string;
  experimentId: string;
  candidateStrategyVersionId: string;
  executionHash: string;
  validationStatus: string;
  adoptedStrategyVersionId: string | null;
  candidateStrategyId: string;
  candidateVersion: number;
  candidateSchemaVersion: number;
  candidateSchema: unknown;
  sourceMode: 'existing' | 'discovery';
  experimentStatus: string;
  experimentStage: string;
  testExposedAt: Date | null;
  exposure: unknown;
  baselineStrategyVersionId: string;
};

const candidateWithFacts = async (
  transaction: Prisma.TransactionClient,
  experimentId: string,
  candidateId: string,
) => {
  const rows = await transaction.$queryRaw<CandidateWithFacts[]>(Prisma.sql`
    SELECT c."id", c."experimentId", c."candidateStrategyVersionId", c."executionHash",
           c."validationStatus", c."adoptedStrategyVersionId",
           candidate_version."strategyId" AS "candidateStrategyId",
           candidate_version."version" AS "candidateVersion",
           candidate_version."schemaVersion" AS "candidateSchemaVersion",
           candidate_version."schema" AS "candidateSchema",
           e."sourceMode", e."status" AS "experimentStatus", e."stage" AS "experimentStage",
           e."testExposedAt", e."exposure", e."baselineStrategyVersionId"
    FROM "OptimizationCandidate" AS c
    JOIN "StrategyVersion" AS candidate_version
      ON candidate_version."id"=c."candidateStrategyVersionId"
    JOIN "OptimizationExperiment" AS e ON e."id"=c."experimentId"
    WHERE c."experimentId"=${experimentId}::uuid
      AND c."id"=${candidateId}::uuid
      AND e."ownerKey"='local-user'
    LIMIT 1
  `);
  return rows[0] ?? null;
};

const testRevealed = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).testRevealed === true
    : false;

export async function formalizeOptimizationCandidate(
  prisma: PrismaService,
  experimentId: string,
  candidateId: string,
  candidateHash: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  return prisma.$transaction(async (transaction) => {
    // 同一幂等意图与同一目标策略始终按固定顺序取得事务锁，避免先查后写竞态。
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
    `);
    const existing = await transaction.$queryRaw<OptimizationAdoptionRow[]>(Prisma.sql`
      ${adoptionSelect}
      WHERE "idempotencyKey"=${idempotencyKey} LIMIT 1
    `);
    if (existing[0]) {
      if (
        existing[0].experimentId !== experimentId ||
        existing[0].candidateId !== candidateId ||
        existing[0].candidateHash !== candidateHash
      )
        throw adoptionConflict('ADOPTION_IDEMPOTENCY_CONFLICT', '幂等键已绑定其他采纳意图');
      if (!(await adoptionIdempotencyMatches(transaction, existing[0], expectedVersion)))
        throw adoptionConflict('ADOPTION_IDEMPOTENCY_CONFLICT', '幂等键绑定的确认版本已变化');
      return existing[0];
    }

    const initial = await candidateWithFacts(transaction, experimentId, candidateId);
    if (!initial) throw new NotFoundException('候选不存在');
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${initial.candidateStrategyId}, 1))
    `);
    const candidate = await candidateWithFacts(transaction, experimentId, candidateId);
    if (!candidate) throw new NotFoundException('候选不存在');
    if (candidate.executionHash !== candidateHash)
      throw adoptionRejected(
        'ADOPTION_CANDIDATE_HASH_MISMATCH',
        '候选执行哈希已变化，必须重新验证',
      );
    if (candidate.adoptedStrategyVersionId)
      throw adoptionConflict(
        'ADOPTION_ALREADY_COMMITTED',
        '该候选已经被正式采纳；请复用原采纳结果',
      );
    if (candidate.validationStatus !== 'test_valid')
      throw adoptionRejected('ADOPTION_NOT_ELIGIBLE', '只有封存测试通过的候选可以采纳');
    if (candidate.experimentStatus !== 'succeeded' || candidate.experimentStage !== 'completed')
      throw adoptionRejected('ADOPTION_NOT_ELIGIBLE', '实验尚未完成封存测试');
    if (!testRevealed(candidate.exposure))
      throw adoptionRejected('ADOPTION_NOT_REVEALED', '封存测试结果尚未明确揭示，不能采纳');

    const baseline = await transaction.strategyVersion.findUnique({
      where: { id: candidate.baselineStrategyVersionId },
    });
    if (!baseline || baseline.strategyId !== candidate.candidateStrategyId)
      throw adoptionRejected('ADOPTION_SOURCE_MISMATCH', '实验基线与候选不属于同一策略来源');
    const candidateStrategy = strategySchemaV2.safeParse(candidate.candidateSchema);
    if (!candidateStrategy.success || candidate.candidateSchemaVersion !== 2)
      throw adoptionRejected('ADOPTION_NOT_ELIGIBLE', '候选不是可入库的正式 V2 策略定义');
    if (optimizationSha256(candidateStrategy.data) !== candidate.executionHash)
      throw adoptionRejected(
        'ADOPTION_CANDIDATE_HASH_MISMATCH',
        '候选持久化哈希与完整策略定义不一致，必须重新验证',
      );

    const latestRows = await transaction.$queryRaw<
      Array<{ id: string; version: number }>
    >(Prisma.sql`
      SELECT "id", "version" FROM "StrategyVersion"
      WHERE "strategyId"=${candidate.candidateStrategyId}::uuid AND "version">0
      ORDER BY "version" DESC LIMIT 1
    `);
    const latest = latestRows[0] ?? null;
    const latestVersion = latest?.version ?? 0;
    if (latestVersion !== expectedVersion)
      throw adoptionConflict(
        'ADOPTION_STALE_BASELINE',
        '正式策略已经发布新版本，请刷新确认上下文后重试',
        { expectedStrategyVersion: expectedVersion, currentStrategyVersion: latestVersion },
      );
    if (candidate.sourceMode === 'discovery' && expectedVersion !== 0)
      throw adoptionConflict('ADOPTION_STALE_BASELINE', '从零实验没有可复用的当前正式版本');
    if (candidate.sourceMode === 'existing' && expectedVersion === 0)
      throw adoptionConflict('ADOPTION_STALE_BASELINE', '已有策略采纳缺少当前正式版本确认');

    const currentId = latest?.id ?? null;
    if (candidate.sourceMode === 'existing' && currentId === null)
      throw adoptionConflict(
        'ADOPTION_STALE_BASELINE',
        '当前正式版本不存在，请刷新确认上下文后重试',
      );
    if (candidate.sourceMode === 'existing' && baseline.version > expectedVersion)
      throw adoptionConflict('ADOPTION_STALE_BASELINE', '实验基线版本晚于确认的当前正式版本');

    if (candidate.sourceMode === 'discovery') {
      await transaction.strategy.update({
        where: { id: candidate.candidateStrategyId },
        data: {
          status: 'draft',
          name: candidateStrategy.data.name,
          description: candidateStrategy.data.description ?? null,
        },
      });
    }
    const formal = await transaction.strategyVersion.create({
      data: {
        strategyId: candidate.candidateStrategyId,
        version: expectedVersion + 1,
        schemaVersion: 2,
        schema: candidateStrategy.data as Prisma.InputJsonValue,
      },
    });
    const adoptionRows = await transaction.$queryRaw<OptimizationAdoptionRow[]>(Prisma.sql`
      INSERT INTO "OptimizationAdoption" (
        "experimentId", "candidateId", "idempotencyKey", "candidateHash", "formalStrategyVersionId",
        "baselineStrategyVersionId", "confirmedCurrentStrategyVersionId"
      ) VALUES (
        ${experimentId}::uuid, ${candidateId}::uuid, ${idempotencyKey}, ${candidateHash}, ${formal.id}::uuid,
        ${candidate.baselineStrategyVersionId}::uuid, ${currentId}::uuid
      )
      RETURNING "id", "experimentId", "candidateId", "idempotencyKey", "candidateHash",
                "formalStrategyVersionId", "baselineStrategyVersionId", "confirmedCurrentStrategyVersionId"
    `);
    const adoption = adoptionRows[0];
    if (!adoption) throw new Error('采纳记录创建后无法读取');
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate"
      SET "adoptedStrategyVersionId"=${formal.id}::uuid
      WHERE "id"=${candidateId}::uuid
        AND "adoptedStrategyVersionId" IS NULL
        AND "executionHash"=${candidateHash}
    `);
    if (updated !== 1) throw adoptionConflict('ADOPTION_ALREADY_COMMITTED', '该候选已经被正式采纳');
    return adoption;
  });
}
