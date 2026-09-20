import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { strategySchemaV2 } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import {
  createStrategyFixture,
  runConfig,
  split,
  budget,
} from './strategy-optimization-postgres-fixtures.js';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_T01_POSTGRES === '1' ? describe : describe.skip;
const suffix = `t01-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const symbol = '600519.SH';

isolatedDescribe('T01 isolated PostgreSQL contract', () => {
  const prisma = new PrismaService();
  const providers = new AiProviderRegistry();
  const strategy = createStrategyFixture(symbol, suffix)('0.05', '0.12');
  let baselineStrategyId = '';
  let baselineVersionId = '';
  let experimentId = '';
  let candidateVersionId = '';
  const groupedJobIds: string[] = [];

  beforeAll(async () => {
    providers.register({
      id: `t01-provider-${suffix}`,
      models: ['t01-model'],
      metadata: {
        costPer1kInput: 0,
        costPer1kOutput: 0,
        costCurrency: 'USD',
        pricingVersion: 't01-test-v1',
      },
      complete: async () => ({
        content: {},
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        costKnown: true,
      }),
    });
    const createdStrategy = await prisma.strategy.create({
      data: {
        name: strategy.name,
        description: strategy.description ?? null,
        status: 'draft',
        schemaVersion: 2,
      },
    });
    baselineStrategyId = createdStrategy.id;
    const createdVersion = await prisma.strategyVersion.create({
      data: {
        strategyId: baselineStrategyId,
        version: 1,
        schemaVersion: 2,
        schema: strategy as unknown as Prisma.InputJsonValue,
      },
    });
    baselineVersionId = createdVersion.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('preserves NULL legacy names and exercises create/read/rename/clone', async () => {
    const reads = new StrategyOptimizationReadService(
      prisma,
      providers,
      new ResultReadPolicyService(prisma),
    );
    const optimization = new StrategyOptimizationService(
      prisma,
      providers,
      { validateAuthorizedParameters: () => undefined } as never,
      reads,
      {} as never,
      {} as never,
    );
    (optimization as unknown as { process: (id: string) => Promise<void> }).process = async () =>
      undefined;

    const created = await optimization.create({
      name: 'T01 原始实验',
      sourceMode: 'existing',
      strategyVersionId: baselineVersionId,
      models: [{ provider: `t01-provider-${suffix}`, model: 't01-model' }],
      allowedParameterIds: ['risk.0.percent'],
      objective: { mode: 'balanced', minClosedTrades: 2 },
      split,
      runConfig,
      budget,
      maxRounds: 1,
      acknowledgeUnknownCost: false,
      idempotencyKey: `${suffix}-create`,
    });
    experimentId = created.id;
    expect(created.name).toBe('T01 原始实验');
    expect(created.source).toMatchObject({
      kind: 'existing',
      strategyId: baselineStrategyId,
      strategyVersionId: baselineVersionId,
      version: 1,
      schemaVersion: 2,
    });

    const frozenBefore = await prisma.$queryRaw<
      Array<{ dataFingerprint: string; split: unknown }>
    >(Prisma.sql`
      SELECT "dataFingerprint", "split" FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid
    `);
    const renamed = await optimization.rename(experimentId, { name: 'T01 已改名' });
    const frozenAfter = await prisma.$queryRaw<
      Array<{ dataFingerprint: string; split: unknown }>
    >(Prisma.sql`
      SELECT "dataFingerprint", "split" FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid
    `);
    expect(renamed.name).toBe('T01 已改名');
    expect(frozenAfter[0]).toEqual(frozenBefore[0]);

    const clone = await optimization.clone(experimentId, {
      name: 'T01 克隆实验',
      idempotencyKey: `${suffix}-clone`,
    });
    expect(clone.name).toBe('T01 克隆实验');
    expect(clone.source).toMatchObject({ kind: 'existing', strategyVersionId: baselineVersionId });
    const cloneFrozen = await prisma.$queryRaw<
      Array<{ dataFingerprint: string; split: unknown }>
    >(Prisma.sql`
      SELECT "dataFingerprint", "split" FROM "OptimizationExperiment" WHERE "id"=${clone.id}::uuid
    `);
    expect(cloneFrozen[0]).toEqual(frozenBefore[0]);

    const legacyId = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "name", "sourceMode", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "idempotencyKey", "createdAt", "updatedAt"
      ) VALUES (
        ${legacyId}::uuid, NULL, 'existing', ${baselineVersionId}::uuid, 'failed', 'failed', '{}'::jsonb,
        '[]'::jsonb, ${JSON.stringify(split)}::jsonb, ${JSON.stringify(runConfig)}::jsonb, 'legacy-fingerprint',
        '[]'::jsonb, ${JSON.stringify(budget)}::jsonb, 1, ${suffix + '-legacy'}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    const legacy = await reads.experiment(legacyId);
    expect(legacy.nameSource).toBe('legacy_fallback');
    expect(legacy.name).toContain(strategy.name);
  });

  it('traverses 151 same-time experiments and groups complete members', async () => {
    const reads = new StrategyOptimizationReadService(
      prisma,
      providers,
      new ResultReadPolicyService(prisma),
    );
    const createdAt = new Date('2026-09-18T00:00:00.000Z');
    const rows = Array.from({ length: 151 }, (_, index) => ({
      id: randomUUID(),
      name: index === 0 ? null : `T01 同时实验-${index}`,
    }));
    for (const row of rows) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "OptimizationExperiment" (
          "id", "name", "sourceMode", "baselineStrategyVersionId", "status", "stage", "objective",
          "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
          "idempotencyKey", "createdAt", "updatedAt"
        ) VALUES (
          ${row.id}::uuid, ${row.name}, 'existing', ${baselineVersionId}::uuid, 'failed', 'failed', '{}'::jsonb,
          '[]'::jsonb, ${JSON.stringify(split)}::jsonb, ${JSON.stringify(runConfig)}::jsonb, ${'fingerprint-' + row.id},
          '[]'::jsonb, ${JSON.stringify(budget)}::jsonb, 1, ${suffix + '-' + row.id}, ${createdAt}, ${createdAt}
        )
      `);
    }
    const first = await reads.list({ limit: 100, search: 'T01 同时实验' });
    const second = await reads.list({
      limit: 100,
      search: 'T01 同时实验',
      cursor: first.pageInfo.nextCursor ?? undefined,
    });
    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(50);
    expect(first.totalCount).toBe(150);
    expect(second.totalCount).toBe(150);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(150);

    const candidateStrategy = await prisma.strategyVersion.create({
      data: {
        strategyId: baselineStrategyId,
        version: 0,
        schemaVersion: 2,
        schema: strategySchemaV2.parse(strategy) as unknown as Prisma.InputJsonValue,
      },
    });
    candidateVersionId = candidateStrategy.id;
    const groupTime = new Date('2026-09-18T01:00:00.000Z');
    for (let index = 0; index < 3; index += 1) {
      const id = randomUUID();
      groupedJobIds.push(id);
      await prisma.backtestJob.create({
        data: {
          id,
          strategyVersionId: baselineVersionId,
          mode: 'V2',
          status: 'succeeded',
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-01T00:00:00.000Z'),
          dataAsOf: new Date('2026-09-18T00:00:00.000Z'),
          input: {},
          createdAt: groupTime,
          updatedAt: groupTime,
        },
      });
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "baselineRunRefs"=${JSON.stringify({ development: groupedJobIds[0], validation: groupedJobIds[1] })}::jsonb
      WHERE "id"=${experimentId}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash",
        "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${randomUUID()}::uuid, ${experimentId}::uuid, 1, 't01-provider:t01-model', ${candidateVersionId}::uuid,
        ${'candidate-hash-' + suffix}, '{}'::jsonb, '[]'::jsonb, 'valid',
        ${JSON.stringify({ test: groupedJobIds[2] })}::jsonb, '{}'::jsonb
      )
    `);
    const groups = await reads.listBacktestGroups({ search: 'T01 已改名' });
    const group = groups.items.find((item) => item.experimentId === experimentId);
    expect(group?.jobs).toHaveLength(3);
    expect(group?.members).toHaveLength(3);
    expect(
      group?.members.some(
        (member) =>
          member.relation === 'candidate' &&
          member.candidateSource?.candidateStrategyVersionId === candidateVersionId,
      ),
    ).toBe(true);
  });
});
