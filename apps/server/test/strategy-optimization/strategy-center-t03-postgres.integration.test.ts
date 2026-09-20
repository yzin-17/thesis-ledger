import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { optimizationSha256 } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import { formalizeOptimizationCandidate } from '../../src/strategy-optimization/strategy-optimization-adoption.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_T03_POSTGRES === '1' ? describe : describe.skip;
const suffix = `t03-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const makeSchema = (name: string) => ({
  ...createDiscoverySeed({
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
  }),
  name,
  description: `${name} 说明`,
});

isolatedDescribe('T03 isolated PostgreSQL atomic adoption', () => {
  const prisma = new PrismaService();
  const policy = new ResultReadPolicyService(prisma);
  const reads = new StrategyOptimizationReadService(prisma, { list: () => [] } as never, policy);
  const riskApplications = {
    monitoringPlan: async (strategyVersionId: string) => ({
      planHash: `plan-${strategyVersionId}`,
      rules: [],
    }),
  };
  const optimizer = new StrategyOptimizationService(
    prisma,
    { list: () => [] } as never,
    {} as never,
    reads,
    {} as never,
    riskApplications as never,
  );
  const strategyIds: string[] = [];
  const experimentIds: string[] = [];
  const riskApplicationIds: string[] = [];
  const accountId = randomUUID();

  const createCase = async (
    input: {
      sourceMode?: 'existing' | 'discovery';
      reveal?: boolean;
      validationStatus?: string;
    } = {},
  ) => {
    const sourceMode = input.sourceMode ?? 'existing';
    const strategyId = randomUUID();
    strategyIds.push(strategyId);
    const seed = makeSchema(`${suffix}-${strategyId.slice(0, 6)}`);
    await prisma.strategy.create({
      data: {
        id: strategyId,
        name: seed.name,
        status: sourceMode === 'discovery' ? 'experiment-only' : 'active',
        schemaVersion: 2,
      },
    });
    const baseline = await prisma.strategyVersion.create({
      data: {
        strategyId,
        version: sourceMode === 'discovery' ? 0 : 1,
        schemaVersion: 2,
        schema: seed as Prisma.InputJsonValue,
      },
    });
    let currentVersionId: string | null = null;
    if (sourceMode === 'existing') {
      const current = await prisma.strategyVersion.create({
        data: {
          strategyId,
          version: 2,
          schemaVersion: 2,
          schema: { ...seed, name: `${seed.name}-当前 v2` } as Prisma.InputJsonValue,
        },
      });
      currentVersionId = current.id;
    }
    const experimentId = randomUUID();
    experimentIds.push(experimentId);
    const candidateVersion = await prisma.strategyVersion.create({
      data: {
        strategyId,
        version: -1,
        schemaVersion: 2,
        schema: { ...seed, name: `${seed.name}-候选` } as Prisma.InputJsonValue,
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "sourceMode", "discoveryScope", "strategySpaceVersion", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget",
        "maxRounds", "lockedCandidateIds", "selectedCandidateId", "testExposedAt", "exposure", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, ${sourceMode},
        ${sourceMode === 'discovery' ? JSON.stringify({ executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' }, primaryTimeframe: '1d' }) : null}::jsonb,
        ${sourceMode === 'discovery' ? 'strategy-space-v1' : null}, ${baseline.id}::uuid, 'succeeded', 'completed', '{}'::jsonb,
        '[]'::jsonb, '{"development":{},"validation":{},"test":{}}'::jsonb, '{}'::jsonb,
        ${`fingerprint-${experimentId}`}, '[]'::jsonb, '{"maxAiCalls":1,"maxBacktestRuns":2,"maxInputTokens":1,"maxOutputTokens":1,"maxDurationSeconds":30}'::jsonb,
        1, '[]'::jsonb, NULL, CURRENT_TIMESTAMP,
        ${JSON.stringify(input.reveal === false ? { testAccessStarted: true } : { testRevealed: true })}::jsonb,
        ${`${suffix}-experiment-${experimentId}`}
      )
    `);
    const candidateId = randomUUID();
    const candidateSchema = { ...seed, name: `${seed.name}-候选` };
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
        "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${candidateId}::uuid, ${experimentId}::uuid, 1, 't03:model', ${candidateVersion.id}::uuid,
        ${optimizationSha256(candidateSchema)}, '{}'::jsonb, '[]'::jsonb, ${input.validationStatus ?? 'test_valid'},
        '{"test":"00000000-0000-4000-8000-000000000001"}'::jsonb,
        '{"test":{"status":"valid","score":1}}'::jsonb
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "lockedCandidateIds"=${JSON.stringify([candidateId])}::jsonb,
          "selectedCandidateId"=${candidateId}::uuid
      WHERE "id"=${experimentId}::uuid
    `);
    return {
      strategyId,
      experimentId,
      baselineVersionId: baseline.id,
      currentVersionId,
      candidateId,
      candidateHash: optimizationSha256(candidateSchema),
    };
  };

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.account.create({
      data: {
        id: accountId,
        name: `${suffix}-risk-account`,
        type: 'broker',
        mode: 'actual',
        currency: 'CNY',
        active: true,
      },
    });
  });

  afterAll(async () => {
    if (experimentIds.length > 0) {
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "OptimizationAdoption"
        WHERE "experimentId" IN (${Prisma.join(experimentIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "OptimizationCandidate"
        WHERE "experimentId" IN (${Prisma.join(experimentIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "OptimizationExperiment"
        WHERE "id" IN (${Prisma.join(experimentIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
    }
    if (strategyIds.length > 0) {
      if (riskApplicationIds.length > 0) {
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "StrategyRiskApplicationAudit"
          WHERE "applicationId" IN (${Prisma.join(riskApplicationIds.map((id) => Prisma.sql`${id}::uuid`))})
        `);
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "StrategyRiskApplication"
          WHERE "id" IN (${Prisma.join(riskApplicationIds.map((id) => Prisma.sql`${id}::uuid`))})
        `);
      }
      await prisma.strategyVersion.deleteMany({ where: { strategyId: { in: strategyIds } } });
      await prisma.strategy.deleteMany({ where: { id: { in: strategyIds } } });
    }
    await prisma.account.delete({ where: { id: accountId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('返回基线/当前/候选三方差异，并让首次与同意图重放深相等', async () => {
    const item = await createCase();
    const context = await optimizer.adoptionContext(item.experimentId, item.candidateId);
    expect(context).toMatchObject({
      expectedStrategyVersion: 2,
      baseline: { id: item.baselineVersionId, version: 1 },
      current: { version: 2 },
      candidate: { candidateId: item.candidateId, executionHash: item.candidateHash },
    });
    expect(context.candidateVsBaseline.length).toBeGreaterThan(0);
    expect(context.candidateVsCurrent.length).toBeGreaterThan(0);
    const positiveVersions = await prisma.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT "version"
      FROM "StrategyVersion"
      WHERE "strategyId"=${item.strategyId}::uuid AND "version">0
      ORDER BY "version" ASC
    `);
    expect(positiveVersions.map((version) => version.version)).toEqual([1, 2]);

    const riskApplicationId = randomUUID();
    riskApplicationIds.push(riskApplicationId);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "StrategyRiskApplication" (
        "id", "ownerKey", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
        "planHash", "plan", "cycleMode", "cycleAnchor", "enabled", "notification", "coverage", "idempotencyKey"
      ) VALUES (
        ${riskApplicationId}::uuid, 'local-user', ${item.currentVersionId}::uuid, ${accountId}::uuid,
        '600519.SH', 7, 'risk-v1', 'risk-plan-hash', '{"rules":[]}'::jsonb, 'existingAndFuture',
        '{"anchor":"t03"}'::jsonb, true, '{"channel":"in-app"}'::jsonb, '{"covered":true}'::jsonb,
        ${`${suffix}-risk-application`}
      )
    `);
    const riskBefore = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "ownerKey", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
             "planHash", "plan", "cycleMode", "cycleAnchor", "enabled", "notification", "coverage", "idempotencyKey", "archivedAt"
      FROM "StrategyRiskApplication" WHERE "id"=${riskApplicationId}::uuid
    `);
    const input = {
      candidateId: item.candidateId,
      candidateHash: item.candidateHash,
      expectedStrategyVersion: 2,
      idempotencyKey: `${suffix}-same-intent`,
    };
    const [first, replay] = await Promise.all([
      optimizer.adopt(item.experimentId, input),
      optimizer.adopt(item.experimentId, input),
    ]);
    expect(replay).toEqual(first);
    expect(first.strategyVersion.version).toBe(3);
    const directReplay = await Promise.allSettled([
      formalizeOptimizationCandidate(
        prisma,
        item.experimentId,
        item.candidateId,
        item.candidateHash,
        2,
        input.idempotencyKey,
      ),
      formalizeOptimizationCandidate(
        prisma,
        item.experimentId,
        item.candidateId,
        item.candidateHash,
        1,
        input.idempotencyKey,
      ),
    ]);
    expect(directReplay.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      (directReplay.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason,
    ).toMatchObject({ response: { errorCode: 'ADOPTION_IDEMPOTENCY_CONFLICT' } });
    await expect(
      optimizer.adopt(item.experimentId, { ...input, expectedStrategyVersion: 1 }),
    ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_IDEMPOTENCY_CONFLICT' } });
    await expect(
      optimizer.adopt(item.experimentId, {
        ...input,
        idempotencyKey: `${suffix}-different-key`,
      }),
    ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_ALREADY_COMMITTED' } });
    const candidateState = await prisma.$queryRaw<
      Array<{ adoptedStrategyVersionId: string }>
    >(Prisma.sql`
      SELECT "adoptedStrategyVersionId" FROM "OptimizationCandidate"
      WHERE "id"=${item.candidateId}::uuid
    `);
    expect(candidateState[0]?.adoptedStrategyVersionId).toBe(first.strategyVersion.id);
    const adoption = await prisma.$queryRaw<
      Array<{ baselineStrategyVersionId: string; confirmedCurrentStrategyVersionId: string }>
    >(Prisma.sql`
      SELECT "baselineStrategyVersionId", "confirmedCurrentStrategyVersionId"
      FROM "OptimizationAdoption" WHERE "candidateId"=${item.candidateId}::uuid
    `);
    expect(adoption[0]).toEqual({
      baselineStrategyVersionId: item.baselineVersionId,
      confirmedCurrentStrategyVersionId: expect.any(String),
    });
    const riskAfter = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "ownerKey", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
             "planHash", "plan", "cycleMode", "cycleAnchor", "enabled", "notification", "coverage", "idempotencyKey", "archivedAt"
      FROM "StrategyRiskApplication" WHERE "id"=${riskApplicationId}::uuid
    `);
    expect(riskAfter).toEqual(riskBefore);
  });

  it('不同采纳意图在同一策略上原子收敛且不改变旧版本', async () => {
    const item = await createCase();
    const secondCandidateId = randomUUID();
    const secondSchema = makeSchema(`${suffix}-second-candidate`);
    const secondVersion = await prisma.strategyVersion.create({
      data: {
        strategyId: item.strategyId,
        version: -2,
        schemaVersion: 2,
        schema: secondSchema as Prisma.InputJsonValue,
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
        "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${secondCandidateId}::uuid, ${item.experimentId}::uuid, 2, 't03:model', ${secondVersion.id}::uuid,
        ${optimizationSha256(secondSchema)}, '{}'::jsonb, '[]'::jsonb, 'test_valid',
        '{"test":"00000000-0000-4000-8000-000000000002"}'::jsonb,
        '{"test":{"status":"valid","score":1}}'::jsonb
      )
    `);
    const baseInput = { expectedStrategyVersion: 2 };
    const race = await Promise.allSettled([
      optimizer.adopt(item.experimentId, {
        ...baseInput,
        candidateId: item.candidateId,
        candidateHash: item.candidateHash,
        idempotencyKey: `${suffix}-race-a`,
      }),
      optimizer.adopt(item.experimentId, {
        ...baseInput,
        candidateId: secondCandidateId,
        candidateHash: optimizationSha256(secondSchema),
        idempotencyKey: `${suffix}-race-b`,
        acknowledgeTestExposure: true,
      }),
    ]);
    expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = race.find((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason.getResponse()).toMatchObject({
      errorCode: 'ADOPTION_STALE_BASELINE',
    });
    const versions = await prisma.strategyVersion.findMany({
      where: { strategyId: item.strategyId, version: { gt: 0 } },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((version) => version.version)).toEqual([1, 2, 3]);
  });

  it('未揭示、不合格、哈希变化均拒绝，并支持从零实验创建首个正式版本', async () => {
    const hidden = await createCase({ reveal: false });
    await expect(
      optimizer.adopt(hidden.experimentId, {
        candidateId: hidden.candidateId,
        candidateHash: hidden.candidateHash,
        expectedStrategyVersion: 2,
        idempotencyKey: `${suffix}-hidden`,
      }),
    ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_NOT_REVEALED' } });
    const invalid = await createCase({ validationStatus: 'test_invalid' });
    await expect(
      optimizer.adopt(invalid.experimentId, {
        candidateId: invalid.candidateId,
        candidateHash: invalid.candidateHash,
        expectedStrategyVersion: 2,
        idempotencyKey: `${suffix}-invalid`,
      }),
    ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_NOT_ELIGIBLE' } });
    const changed = await createCase();
    await expect(
      optimizer.adopt(changed.experimentId, {
        candidateId: changed.candidateId,
        candidateHash: 'changed-hash',
        expectedStrategyVersion: 2,
        idempotencyKey: `${suffix}-hash`,
      }),
    ).rejects.toMatchObject({ response: { errorCode: 'ADOPTION_CANDIDATE_HASH_MISMATCH' } });
    const discovery = await createCase({ sourceMode: 'discovery' });
    const adopted = await optimizer.adopt(discovery.experimentId, {
      candidateId: discovery.candidateId,
      candidateHash: discovery.candidateHash,
      expectedStrategyVersion: 0,
      idempotencyKey: `${suffix}-discovery`,
    });
    expect(adopted.strategyVersion.version).toBe(1);
    expect(adopted.adoptionContext.current).toBeNull();
    expect(
      (await prisma.strategy.findUniqueOrThrow({ where: { id: discovery.strategyId } })).status,
    ).toBe('draft');
  });
});
