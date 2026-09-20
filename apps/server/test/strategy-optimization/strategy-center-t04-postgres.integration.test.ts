import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_T04_POSTGRES === '1' ? describe : describe.skip;
const suffix = `t04-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

isolatedDescribe('T04 isolated PostgreSQL cost budget reserve and settle', () => {
  const prisma = new PrismaService();
  const runs = new StrategyOptimizationRunService(prisma, {} as never);
  const strategyId = randomUUID();
  const experimentId = randomUUID();
  const unknownExperimentId = randomUUID();
  let baselineVersionId = '';

  const readUsage = (id: string) =>
    prisma.$queryRaw<
      Array<{
        aiCallsUsed: number;
        backtestRunsUsed: number;
        inputTokensUsed: number;
        outputTokensUsed: number;
        costUsed: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT "aiCallsUsed", "backtestRunsUsed", "inputTokensUsed", "outputTokensUsed", "costUsed"
      FROM "OptimizationExperiment" WHERE "id"=${id}::uuid
    `);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.strategy.create({
      data: {
        id: strategyId,
        name: `T04 费用策略 ${suffix}`,
        status: 'draft',
        schemaVersion: 2,
      },
    });
    const version = await prisma.strategyVersion.create({
      data: {
        strategyId,
        version: 1,
        schemaVersion: 2,
        schema: { schemaVersion: '2', name: `T04 费用策略 ${suffix}` },
      },
    });
    baselineVersionId = version.id;

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, ${baselineVersionId}::uuid, 'running', 'proposing', '{}'::jsonb, '[]'::jsonb,
        '{}'::jsonb, '{}'::jsonb, ${suffix + '-known'},
        '[{"provider":"provider-a","model":"model-a","costStatus":"known","costCurrency":"USD","pricingVersion":"t04-v1"}]'::jsonb,
        '{"maxAiCalls":2,"maxBacktestRuns":2,"maxInputTokens":100,"maxOutputTokens":100,"maxCost":"1","maxDurationSeconds":1800}'::jsonb,
        1, ${suffix + '-known'}
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${unknownExperimentId}::uuid, ${baselineVersionId}::uuid, 'running', 'proposing', '{}'::jsonb, '[]'::jsonb,
        '{}'::jsonb, '{}'::jsonb, ${suffix + '-unknown'},
        '[{"provider":"provider-a","model":"model-a","costStatus":"unknown"}]'::jsonb,
        '{"maxAiCalls":1,"maxBacktestRuns":2,"maxInputTokens":100,"maxOutputTokens":100,"maxDurationSeconds":1800}'::jsonb,
        1, ${suffix + '-unknown'}
      )
    `);
  });

  afterAll(async () => {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "OptimizationExperiment" WHERE "id" IN (${experimentId}::uuid, ${unknownExperimentId}::uuid)`,
    );
    if (baselineVersionId)
      await prisma.strategyVersion
        .delete({ where: { id: baselineVersionId } })
        .catch(() => undefined);
    await prisma.strategy.delete({ where: { id: strategyId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('reserves hard caps and settles a known zero-price currency without conversion', async () => {
    await runs.reserveBudget(experimentId, {
      aiCalls: 1,
      backtestRuns: 1,
      inputTokens: 10,
      outputTokens: 20,
      estimatedCost: 0.25,
    });
    expect((await readUsage(experimentId))[0]).toMatchObject({
      aiCallsUsed: 1,
      backtestRunsUsed: 1,
      inputTokensUsed: 10,
      outputTokensUsed: 20,
    });
    expect((await readUsage(experimentId))[0]?.costUsed.toString()).toBe('0.25');

    await runs.reconcileCost(experimentId, 0.25, 0, undefined, true, 'USD');
    expect((await readUsage(experimentId))[0]?.costUsed.toString()).toBe('0');

    await expect(
      runs.reconcileCost(experimentId, 0, 1.1, undefined, true, 'HKD'),
    ).rejects.toMatchObject({ response: { errorCode: 'OPTIMIZATION_COST_CURRENCY_MISMATCH' } });
    expect((await readUsage(experimentId))[0]?.costUsed.toString()).toBe('0');
  });

  it('keeps non-cost caps active when cost is unknown and no total cap exists', async () => {
    await runs.reserveBudget(unknownExperimentId, {
      aiCalls: 1,
      backtestRuns: 1,
      inputTokens: 10,
      outputTokens: 20,
      estimatedCost: 0,
    });
    await runs.reconcileCost(unknownExperimentId, 0, 3.5, undefined, false, null);
    expect((await readUsage(unknownExperimentId))[0]?.costUsed.toString()).toBe('0');
    await expect(runs.reserveBudget(unknownExperimentId, { aiCalls: 1 })).rejects.toThrow(
      '优化实验预算或最长运行时长已耗尽',
    );
  });
});
