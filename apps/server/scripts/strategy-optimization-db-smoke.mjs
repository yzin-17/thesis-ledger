import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);
const accountId = randomUUID();
const strategyId = randomUUID();
const formalVersionId = randomUUID();
const candidateVersionId = randomUUID();
const aiRunId = randomUUID();
const applicationId = randomUUID();
const experimentId = randomUUID();
const candidateId = randomUUID();
const adoptionId = randomUUID();

const cleanup = async () => {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationAdoption" WHERE "experimentId"=${experimentId}::uuid`).catch(() => undefined);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationAttempt" WHERE "experimentId"=${experimentId}::uuid`).catch(() => undefined);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationCandidate" WHERE "experimentId"=${experimentId}::uuid`).catch(() => undefined);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid`).catch(() => undefined);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "StrategyRiskApplicationAudit" WHERE "applicationId"=${applicationId}::uuid`).catch(() => undefined);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "StrategyRiskApplication" WHERE "id"=${applicationId}::uuid OR "idempotencyKey" LIKE ${`db-smoke-${suffix}%`}`).catch(() => undefined);
  await prisma.aiRun.deleteMany({ where: { id: aiRunId } }).catch(() => undefined);
  await prisma.strategyVersion.deleteMany({ where: { id: { in: [candidateVersionId, formalVersionId] } } }).catch(() => undefined);
  await prisma.strategy.deleteMany({ where: { id: strategyId } }).catch(() => undefined);
  await prisma.account.deleteMany({ where: { id: accountId } }).catch(() => undefined);
};

try {
  const tables = await prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
    SELECT unnest(ARRAY[
      to_regclass('"StrategyRiskApplication"')::text,
      to_regclass('"OptimizationExperiment"')::text,
      to_regclass('"OptimizationCandidate"')::text,
      to_regclass('"OptimizationAttempt"')::text,
      to_regclass('"OptimizationAdoption"')::text
    ]) AS name
  `);
  if (tables.some((row) => row.name === null)) throw new Error('策略优化 raw-owned 表未完整部署');

  await prisma.account.create({
    data: {
      id: accountId,
      name: `DB Smoke ${suffix}`,
      type: 'broker',
      mode: 'actual',
      currency: 'CNY',
      active: true,
    },
  });
  await prisma.strategy.create({
    data: { id: strategyId, name: `DB Smoke Strategy ${suffix}`, status: 'active', schemaVersion: 2 },
  });
  await prisma.strategyVersion.create({
    data: { id: formalVersionId, strategyId, version: 1, schemaVersion: 2, schema: { smoke: true } },
  });
  await prisma.strategyVersion.create({
    data: { id: candidateVersionId, strategyId, version: -1, schemaVersion: 2, schema: { smoke: true, candidate: true } },
  });
  await prisma.aiRun.create({
    data: {
      id: aiRunId,
      provider: 'fixture',
      model: 'fixture-model',
      promptVersion: 'strategy-optimization-db-smoke',
      status: 'succeeded',
    },
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "StrategyRiskApplication" (
      "id", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
      "planHash", "plan", "cycleMode", "enabled", "notification", "coverage", "idempotencyKey"
    ) VALUES (
      ${applicationId}::uuid, ${formalVersionId}::uuid, ${accountId}::uuid, '600519.SH', 1,
      'strategy-monitoring-v1', 'db-smoke-plan', '{}'::jsonb, 'existingAndFuture', true,
      '{"enabled":true,"cooldownMinutes":60}'::jsonb, '{}'::jsonb, ${`db-smoke-${suffix}-application`}
    )
  `);

  let conflictObserved = false;
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "StrategyRiskApplication" (
        "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
        "planHash", "plan", "cycleMode", "enabled", "notification", "coverage", "idempotencyKey"
      ) VALUES (
        ${formalVersionId}::uuid, ${accountId}::uuid, '600519.SH', 1,
        'strategy-monitoring-v1', 'db-smoke-conflict', '{}'::jsonb, 'existingAndFuture', true,
        '{"enabled":true,"cooldownMinutes":60}'::jsonb, '{}'::jsonb, ${`db-smoke-${suffix}-conflict`}
      )
    `);
  } catch {
    conflictObserved = true;
  }
  if (!conflictObserved) throw new Error('账户 + 标的启用策略应用唯一约束未生效');

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OptimizationExperiment" (
      "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
      "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey"
    ) VALUES (
      ${experimentId}::uuid, ${formalVersionId}::uuid, 'queued', 'preparing',
      '{"mode":"balanced"}'::jsonb, '["risk:0:percent"]'::jsonb,
      '{"development":{},"validation":{},"test":{}}'::jsonb, '{}'::jsonb,
      'db-smoke-data', '[{"provider":"fixture","model":"fixture-model"}]'::jsonb,
      '{"maxAiCalls":2,"maxBacktestRuns":4,"maxInputTokens":1000,"maxOutputTokens":1000}'::jsonb,
      1, ${`db-smoke-${suffix}-experiment`}
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OptimizationCandidate" (
      "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
      "executionHash", "proposal", "diff", "validationStatus"
    ) VALUES (
      ${candidateId}::uuid, ${experimentId}::uuid, 1, 'fixture:fixture-model', ${candidateVersionId}::uuid,
      'db-smoke-candidate', '{}'::jsonb, '[]'::jsonb, 'valid'
    )
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OptimizationAttempt" ("experimentId", "modelKey", "aiRunId", "attempt", "status")
    VALUES (${experimentId}::uuid, 'fixture:fixture-model', ${aiRunId}::uuid, 1, 'proposed')
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OptimizationAdoption" (
      "id", "experimentId", "candidateId", "idempotencyKey", "candidateHash", "formalStrategyVersionId"
    ) VALUES (
      ${adoptionId}::uuid, ${experimentId}::uuid, ${candidateId}::uuid,
      ${`db-smoke-${suffix}-adoption`}, 'db-smoke-candidate', ${formalVersionId}::uuid
    )
  `);

  const row = await prisma.$queryRaw<Array<{ candidateCount: bigint; adoptionCount: bigint }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "OptimizationCandidate" WHERE "experimentId"=${experimentId}::uuid) AS "candidateCount",
      (SELECT COUNT(*) FROM "OptimizationAdoption" WHERE "experimentId"=${experimentId}::uuid) AS "adoptionCount"
  `);
  if (row[0]?.candidateCount !== 1n || row[0]?.adoptionCount !== 1n)
    throw new Error('策略优化数据库闭环写入验证失败');

  console.log('Strategy optimization database smoke passed');
} finally {
  await cleanup();
  await prisma.$disconnect();
}
