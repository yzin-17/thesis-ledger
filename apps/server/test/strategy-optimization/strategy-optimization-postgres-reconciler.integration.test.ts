import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import { optimizationSha256, type ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import {
  applyOptimizationProposal,
  describeStrategyParameters,
} from '../../src/strategy-optimization/strategy-optimization-parameters.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';

const postgresDescribe =
  process.env.RUN_STRATEGY_OPTIMIZATION_POSTGRES_E2E === '1' ? describe : describe.skip;
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const model = 'optimizer-model';
const providerId = 'postgres-reconciler-e2e';
const proposal = {
  changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
  reason: '恢复已完成 Provider step',
  evidenceRefs: ['postgres-reconciler-e2e'],
};
const baselineStrategy = strategySchemaV2.parse({
  schemaVersion: '2',
  name: `Reconciler replay ${suffix}`,
  signalSources: [
    {
      id: 'price',
      asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      timeframe: '1d',
      series: ['open', 'high', 'low', 'close', 'volume'],
    },
  ],
  executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'constant', value: '0' },
  },
  exit: {
    type: 'compare',
    operator: 'lt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'constant', value: '999999' },
  },
  sizing: { type: 'fixedQuantity', quantity: '100' },
  risk: [{ type: 'fixedStop', percent: '0.08' }],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as StrategySchemaV2;
const runConfig = {
  startDate: '2026-01-01',
  endDate: '2026-09-10',
  dataAsOf: '2026-09-11T08:00:00.000Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '100000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
};
const split = {
  development: { start: '2026-01-01', end: '2026-04-30' },
  validation: { start: '2026-05-01', end: '2026-07-31' },
  test: { start: '2026-08-01', end: '2026-09-10' },
};
const budget = {
  maxAiCalls: 5,
  maxBacktestRuns: 10,
  maxInputTokens: 100_000,
  maxOutputTokens: 10_000,
  maxCost: '10',
  maxDurationSeconds: 600,
};

const waitUntil = async (predicate: () => Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('等待 reconciler 恢复超时');
};

postgresDescribe('策略优化 succeeded round reconciler PostgreSQL E2E', () => {
  const prisma = new PrismaService();
  const strategyId = randomUUID();
  const experimentId = randomUUID();
  const candidateId = randomUUID();
  let baselineVersionId = '';
  let candidateVersionId = '';
  let aiRunId = '';

  const provider = {
    id: providerId,
    models: [model],
    metadata: {
      costPer1kInput: 0,
      costPer1kOutput: 0,
      costCurrency: 'USD',
      pricingVersion: 'test-v1',
    },
    complete: vi.fn(async () => {
      throw new Error('已成功 round 不应再次调用 Provider');
    }),
  };
  const providers = {
    strict: vi.fn((requestedProvider: string, requestedModel: string) => {
      if (requestedProvider !== providerId || requestedModel !== model)
        throw new Error('测试 Provider 路由不匹配');
      return provider;
    }),
  };
  const backtests = {
    createRun: vi.fn(async () => {
      throw new Error('已有 baseline/candidate 不应再次回测');
    }),
    status: vi.fn(async () => null),
    retryRun: vi.fn(async () => null),
  };

  const readExperiment = async () => {
    const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid LIMIT 1
    `);
    if (!rows[0]) throw new Error('测试实验不存在');
    return rows[0];
  };

  beforeAll(async () => {
    process.env.STRATEGY_AI_OPTIMIZATION_ENABLED = 'true';
    await prisma.$connect();
    await prisma.strategy.create({
      data: { id: strategyId, name: `Reconciler replay ${suffix}`, status: 'active', schemaVersion: 2 },
    });
    const baselineVersion = await prisma.strategyVersion.create({
      data: {
        strategyId,
        version: 1,
        schemaVersion: 2,
        schema: baselineStrategy as Prisma.InputJsonValue,
      },
    });
    baselineVersionId = baselineVersion.id;
    const descriptors = describeStrategyParameters(baselineStrategy);
    const candidateStrategy = applyOptimizationProposal(
      baselineStrategy,
      descriptors,
      ['risk.0.percent'],
      proposal,
    );
    const candidateVersion = await prisma.strategyVersion.create({
      data: {
        strategyId,
        version: -1,
        schemaVersion: 2,
        schema: candidateStrategy as Prisma.InputJsonValue,
      },
    });
    candidateVersionId = candidateVersion.id;

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "aiCallsUsed", "inputTokensUsed", "outputTokensUsed", "baselineRunRefs", "baselineMetrics",
        "leaseUntil", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, ${baselineVersionId}::uuid, 'running', 'proposing',
        ${JSON.stringify({ mode: 'balanced', minClosedTrades: 0 })}::jsonb,
        ${JSON.stringify(['risk.0.percent'])}::jsonb,
        ${JSON.stringify(split)}::jsonb, ${JSON.stringify(runConfig)}::jsonb,
        ${`data-${experimentId}`},
        ${JSON.stringify([{ provider: providerId, model, costStatus: 'known' }])}::jsonb,
        ${JSON.stringify(budget)}::jsonb, 1, 1, 31, 17,
        ${JSON.stringify({ development: 'baseline-dev', validation: 'baseline-validation' })}::jsonb,
        ${JSON.stringify({ development: { score: 1 }, validation: { score: 1 } })}::jsonb,
        ${new Date(Date.now() - 60_000)}, ${`postgres-reconciler-e2e-${suffix}`}
      )
    `);

    const aiRun = await prisma.aiRun.create({
      data: {
        provider: providerId,
        model,
        promptVersion: 'strategy-optimization-v1',
        status: 'succeeded',
        inputTokens: 31,
        outputTokens: 17,
        cost: new Prisma.Decimal(0),
        result: proposal as Prisma.InputJsonValue,
        completedAt: new Date(),
        modelMetadata: {
          optimizationExperimentId: experimentId,
          requestedProvider: providerId,
          requestedModel: model,
          round: 1,
          fallbackUsed: false,
        },
      },
    });
    aiRunId = aiRun.id;

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" (
        "experimentId", "modelKey", "aiRunId", "attempt", "status", "proposal", "completedAt"
      ) VALUES (
        ${experimentId}::uuid, ${`${providerId}:${model}`}, ${aiRunId}::uuid, 1, 'succeeded',
        ${JSON.stringify(proposal)}::jsonb, CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
        "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${candidateId}::uuid, ${experimentId}::uuid, 1, ${`${providerId}:${model}`},
        ${candidateVersionId}::uuid, ${optimizationSha256(candidateStrategy)},
        ${JSON.stringify(proposal)}::jsonb, '[]'::jsonb, 'valid',
        ${JSON.stringify({ development: 'candidate-dev', validation: 'candidate-validation' })}::jsonb,
        ${JSON.stringify({ development: { status: 'valid', score: 1 }, validation: { status: 'valid', score: 1 } })}::jsonb
      )
    `);
  });

  afterAll(async () => {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationCandidate" WHERE "id"=${candidateId}::uuid`).catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationAttempt" WHERE "experimentId"=${experimentId}::uuid`).catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid`).catch(() => undefined);
    if (aiRunId) await prisma.aiRun.delete({ where: { id: aiRunId } }).catch(() => undefined);
    if (candidateVersionId) await prisma.strategyVersion.delete({ where: { id: candidateVersionId } }).catch(() => undefined);
    if (baselineVersionId) await prisma.strategyVersion.delete({ where: { id: baselineVersionId } }).catch(() => undefined);
    await prisma.strategy.delete({ where: { id: strategyId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('lease 过期后 reconciler 复用 succeeded step，不重复 Provider、AiRun 或 Candidate', async () => {
    const runs = new StrategyOptimizationRunService(prisma, backtests as never);
    const candidateService = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
    const optimizer = new StrategyOptimizationService(
      prisma,
      providers as never,
      candidateService,
      {} as never,
      runs,
      {} as never,
    );
    const aiRunsBefore = await prisma.aiRun.count({ where: { id: aiRunId } });
    const candidatesBefore = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationCandidate" WHERE "experimentId"=${experimentId}::uuid
    `);

    await expect(optimizer.reconcilePending()).resolves.toMatchObject({ scheduled: 1 });
    await waitUntil(async () => (await readExperiment()).status === 'awaiting_finalization');

    expect(provider.complete).not.toHaveBeenCalled();
    expect(backtests.createRun).not.toHaveBeenCalled();
    expect(await prisma.aiRun.count({ where: { id: aiRunId } })).toBe(aiRunsBefore);
    expect(await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationCandidate" WHERE "experimentId"=${experimentId}::uuid
    `)).toEqual(candidatesBefore);
    expect((await readExperiment()).aiCallsUsed).toBe(1);
  });
});
