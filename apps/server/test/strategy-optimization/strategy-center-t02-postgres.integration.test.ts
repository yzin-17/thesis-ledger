import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_T02_POSTGRES === '1' ? describe : describe.skip;
const suffix = `t02-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

isolatedDescribe('T02 isolated PostgreSQL read eligibility', () => {
  const prisma = new PrismaService();
  const providers = new AiProviderRegistry();
  const policy = new ResultReadPolicyService(prisma);
  const reads = new StrategyOptimizationReadService(prisma, providers, policy);
  const backtests = new BacktestService(prisma, undefined, undefined, policy);
  let baselineVersionId = '';
  let candidateVersionId = '';
  let experimentId = '';
  let candidateId = '';
  let testRunId = '';
  let validationRunId = '';

  beforeAll(async () => {
    const strategy = await prisma.strategy.create({
      data: { name: `T02 策略 ${suffix}`, status: 'draft', schemaVersion: 2 },
    });
    const version = await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 1,
        schemaVersion: 2,
        schema: { schemaVersion: '2', name: strategy.name },
      },
    });
    baselineVersionId = version.id;
    const candidateVersion = await prisma.strategyVersion.create({
      data: {
        strategyId: strategy.id,
        version: 0,
        schemaVersion: 2,
        schema: { schemaVersion: '2', name: strategy.name },
      },
    });
    candidateVersionId = candidateVersion.id;
    experimentId = randomUUID();
    candidateId = randomUUID();
    testRunId = randomUUID();
    validationRunId = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "name", "sourceMode", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "baselineRunRefs", "baselineMetrics", "lockedCandidateIds", "selectedCandidateId", "testExposedAt", "exposure",
        "idempotencyKey", "createdAt", "updatedAt"
      ) VALUES (
        ${experimentId}::uuid, 'T02 门禁实验', 'existing', ${baselineVersionId}::uuid, 'succeeded', 'testing', '{}'::jsonb,
        '[]'::jsonb, '{"development":{},"validation":{},"test":{}}'::jsonb, '{}'::jsonb, 't02-fingerprint', '[]'::jsonb,
        '{}'::jsonb, 1, ${JSON.stringify({ validation: validationRunId, test: testRunId })}::jsonb,
        ${JSON.stringify({ validation: { score: 1 }, test: { score: 99 } })}::jsonb,
        ${JSON.stringify([candidateId])}::jsonb, ${candidateId}::uuid, CURRENT_TIMESTAMP,
        '{"testAccessStarted":true,"testRevealed":false}'::jsonb, ${suffix}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash",
        "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${candidateId}::uuid, ${experimentId}::uuid, 1, 't02:model', ${candidateVersionId}::uuid, ${suffix + '-candidate'},
        '{}'::jsonb, '[]'::jsonb, 'test_invalid', ${JSON.stringify({ test: testRunId })}::jsonb,
        ${JSON.stringify({ test: { score: 88 } })}::jsonb
      )
    `);
    for (const id of [testRunId, validationRunId]) {
      await prisma.backtestJob.create({
        data: {
          id,
          strategyVersionId: id === testRunId ? candidateVersionId : baselineVersionId,
          idempotencyKey: `optimization:${experimentId}:${id === testRunId ? 'candidate' : 'baseline'}:test`,
          mode: 'V2',
          status: 'succeeded',
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-01T00:00:00.000Z'),
          dataAsOf: new Date('2026-09-18T00:00:00.000Z'),
          input: {},
          result: { metrics: { score: id === testRunId ? 99 : 1 } },
          diagnostics: { internal: 'diagnostic' },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('protects experiment, compare, groups, and direct backtest reads before reveal', async () => {
    const detail = await reads.get(experimentId);
    expect(detail.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(detail.experiment.baselineRunRefs).not.toHaveProperty('test');
    expect(detail.experiment.baselineMetrics).not.toHaveProperty('test');
    expect(detail.candidates[0]).toMatchObject({
      validationStatus: 'restricted',
      readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' },
    });
    expect(detail.candidates[0]?.runRefs).not.toHaveProperty('test');
    expect(detail.candidates[0]?.metrics).not.toHaveProperty('test');

    const compared = await reads.compare(experimentId);
    expect(compared.baseline.runRefs).not.toHaveProperty('test');
    expect(compared.candidates[0]?.metrics).not.toHaveProperty('test');
    expect(compared.candidates[0]?.validationScore).toBeNull();
    expect(compared.note).toContain('暂不提供可推断质量的排序或标签');

    const groups = await reads.listBacktestGroups({ search: 'T02 门禁实验' });
    const group = groups.items[0];
    const testMemberIndex = group?.members.findIndex((member) => member.split === 'test') ?? -1;
    expect(testMemberIndex).toBeGreaterThanOrEqual(0);
    expect(group?.jobs[testMemberIndex]?.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(await policy.run(testRunId)).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    const direct = await backtests.statusForRead(testRunId);
    expect(direct).toMatchObject({
      readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' },
    });
    expect(direct).not.toHaveProperty('result');
    expect(direct).not.toHaveProperty('diagnostics');
  });

  it('keeps the whole batch hidden while a peer is running or technically failed', async () => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "validationStatus"='test_running'
      WHERE "id"=${candidateId}::uuid
    `);
    const running = await reads.compare(experimentId);
    expect(running.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(running.candidates[0]?.metrics).not.toHaveProperty('test');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "validationStatus"='test_failed'
      WHERE "id"=${candidateId}::uuid
    `);
    const failed = await reads.compare(experimentId);
    expect(failed.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'TEST_NOT_REVEALED',
    });
    expect(failed.candidates[0]?.runRefs).not.toHaveProperty('test');
  });

  it('reads explicitly revealed historical results and fails closed when evidence is unknown', async () => {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "exposure"='{"testAccessStarted":true,"testRevealed":true}'::jsonb
      WHERE "id"=${experimentId}::uuid
    `);
    const revealed = await reads.get(experimentId);
    expect(revealed.experiment.readEligibility).toMatchObject({
      state: 'readable',
      code: 'READABLE',
    });
    expect(revealed.candidates[0]?.runRefs).toHaveProperty('test', testRunId);
    expect(revealed.candidates[0]?.metrics).toHaveProperty('test.score', 88);
    const direct = await backtests.statusForRead(testRunId);
    expect(direct?.result).toMatchObject({ metrics: { score: 99 } });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "baselineRunRefs"='{}'::jsonb
      WHERE "id"=${experimentId}::uuid
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationCandidate" SET "runRefs"='{}'::jsonb
      WHERE "id"=${candidateId}::uuid
    `);
    const corruptedCandidate = await backtests.statusForRead(testRunId);
    const corruptedBaseline = await backtests.statusForRead(validationRunId);
    expect(corruptedCandidate).toMatchObject({
      readEligibility: { state: 'restricted', code: 'HISTORICAL_REVEAL_UNKNOWN' },
    });
    expect(corruptedBaseline).toMatchObject({
      readEligibility: { state: 'restricted', code: 'HISTORICAL_REVEAL_UNKNOWN' },
    });
    expect(corruptedCandidate).not.toHaveProperty('result');
    expect(corruptedBaseline).not.toHaveProperty('result');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment" SET "exposure"=NULL WHERE "id"=${experimentId}::uuid
    `);
    const unknown = await reads.get(experimentId);
    expect(unknown.experiment.readEligibility).toMatchObject({
      state: 'restricted',
      code: 'HISTORICAL_REVEAL_UNKNOWN',
    });
  });
});
