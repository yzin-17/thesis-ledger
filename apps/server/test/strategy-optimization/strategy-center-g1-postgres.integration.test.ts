import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BacktestController } from '../../src/backtest/backtest.controller.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import { StrategyOptimizationController } from '../../src/strategy-optimization/strategy-optimization.controller.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import {
  budget,
  createStrategyFixture,
  proposal,
  runConfig,
  split,
  waitUntil,
} from './strategy-optimization-postgres-fixtures.js';

const isolatedDescribe =
  process.env.RUN_STRATEGY_CENTER_G1_POSTGRES === '1' ? describe : describe.skip;
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const symbol = '600519.SH';

const prisma = new PrismaService();
const policy = new ResultReadPolicyService(prisma);
const strategy = createStrategyFixture(symbol, suffix);
const strategyId = randomUUID();
let baselineVersionId = '';
let failCandidateFinalOnce = true;
const runCreateKeys: string[] = [];
const previousOptimizationFlag = process.env.STRATEGY_AI_OPTIMIZATION_ENABLED;

const provider = {
  id: `g1-provider-${suffix}`,
  models: ['g1-controlled-model'],
  metadata: {
    costPer1kInput: 0,
    costPer1kOutput: 0,
    costCurrency: 'USD',
    pricingVersion: 'g1-controlled-v1',
  },
  complete: vi.fn(async () => ({
    content: proposal,
    inputTokens: 31,
    outputTokens: 17,
    cost: 0,
    costKnown: true,
    actualModel: 'g1-controlled-model',
  })),
};
const providers = {
  strict: vi.fn((providerId: string, model: string) => {
    if (providerId !== provider.id || model !== provider.models[0]) {
      throw new Error('G1 受控 Provider 路由不匹配');
    }
    return provider;
  }),
  list: vi.fn(() => [provider]),
};

const resultFor = (id: string, strategyVersionId: string) => ({
  source: 'BACKTEST',
  runId: id,
  strategyVersionId,
  snapshotId: 'g1-controlled-snapshot',
  engineVersion: 'g1-controlled-engine-v1',
  schemaVersion: '2',
  marketRuleVersion: 'g1-market-rules-v1',
  calendarVersion: 'g1-calendar-v1',
  aggregationVersion: 'g1-aggregation-v1',
  contentHash: 'g1-controlled-content-hash',
  resultChecksum: `g1-checksum-${id}`,
  completeness: 'complete',
  warnings: [],
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [],
  metrics: {
    totalReturn: { status: 'available', value: '0.10' },
    maxDrawdown: { status: 'available', value: '-0.02' },
    turnover: { status: 'available', value: '0.01' },
  },
});

const controlledBacktests = {
  createRun: vi.fn(
    async (input: {
      strategyVersionId: string;
      idempotencyKey: string;
      runConfig: typeof runConfig;
    }) => {
      runCreateKeys.push(input.idempotencyKey);
      if (input.idempotencyKey.includes(':candidate-final:') && failCandidateFinalOnce) {
        failCandidateFinalOnce = false;
        throw new Error('G1 受控封存测试技术失败');
      }
      const previous = await prisma.backtestJob.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (previous) return previous;
      const id = randomUUID();
      const result = resultFor(id, input.strategyVersionId);
      return prisma.backtestJob.create({
        data: {
          id,
          strategyVersionId: input.strategyVersionId,
          idempotencyKey: input.idempotencyKey,
          mode: 'V2',
          status: 'succeeded',
          progress: 100,
          periodStart: new Date(`${input.runConfig.startDate}T00:00:00.000Z`),
          periodEnd: new Date(`${input.runConfig.endDate}T00:00:00.000Z`),
          dataAsOf: new Date(input.runConfig.dataAsOf),
          input: { runConfig: input.runConfig } as Prisma.InputJsonValue,
          result: result as Prisma.InputJsonValue,
          warnings: [],
          snapshotId: result.snapshotId,
          resultChecksum: result.resultChecksum,
          engineVersion: result.engineVersion,
          snapshotManifest: {
            artifacts: [{ key: 'market/600519.SH/1d.json', contentHash: 'g1-data' }],
          },
          finishedAt: new Date(),
        },
      });
    },
  ),
  status: vi.fn((id: string) => prisma.backtestJob.findUnique({ where: { id } })),
  retryRun: vi.fn((id: string) => prisma.backtestJob.findUnique({ where: { id } })),
  runV2: vi.fn(async () => undefined),
  comparableDataFingerprint: vi.fn(async () => 'g1-comparable-data-fingerprint'),
};

const riskApplications = {
  monitoringPlan: vi.fn(async (strategyVersionId: string) => ({
    planHash: `g1-plan-${strategyVersionId}`,
    rules: [],
  })),
  planDiffsForTargetVersion: vi.fn(async () => []),
};

const reads = new StrategyOptimizationReadService(prisma, providers as never, policy);
const runs = new StrategyOptimizationRunService(prisma, controlledBacktests as never);
const candidates = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
const optimization = new StrategyOptimizationService(
  prisma,
  providers as never,
  candidates,
  reads,
  runs,
  riskApplications as never,
);
const optimizationController = new StrategyOptimizationController(
  optimization,
  reads,
  riskApplications as never,
  {} as never,
);
const backtestController = new BacktestController(
  new BacktestService(prisma, undefined, undefined, policy),
  {} as never,
);

isolatedDescribe('G1 Controller boundary PostgreSQL vertical workflow', () => {
  beforeAll(async () => {
    process.env.STRATEGY_AI_OPTIMIZATION_ENABLED = 'true';
    await prisma.$connect();
    const created = await prisma.strategy.create({
      data: {
        id: strategyId,
        name: `G1 纵向策略 ${suffix}`,
        status: 'active',
        schemaVersion: 2,
      },
    });
    const baseline = await prisma.strategyVersion.create({
      data: {
        strategyId: created.id,
        version: 1,
        schemaVersion: 2,
        schema: strategy('0.08') as Prisma.InputJsonValue,
      },
    });
    baselineVersionId = baseline.id;
  });

  afterAll(async () => {
    if (previousOptimizationFlag === undefined) delete process.env.STRATEGY_AI_OPTIMIZATION_ENABLED;
    else process.env.STRATEGY_AI_OPTIMIZATION_ENABLED = previousOptimizationFlag;
    await prisma.$disconnect();
  });

  it('从创建到原批次失败恢复、统一揭示、冲突刷新和幂等采纳形成持久化闭环', async () => {
    const created = await optimizationController.createExperiment({
      name: 'G1 Controller 纵向实验',
      sourceMode: 'existing',
      strategyVersionId: baselineVersionId,
      models: [{ provider: provider.id, model: provider.models[0] }],
      allowedParameterIds: ['risk.0.percent'],
      objective: { mode: 'balanced', minClosedTrades: 0 },
      split,
      runConfig,
      budget,
      maxRounds: 1,
      acknowledgeUnknownCost: false,
      idempotencyKey: `g1-create-${suffix}`,
    });
    const replayedCreate = await optimizationController.createExperiment({
      name: 'G1 Controller 纵向实验',
      sourceMode: 'existing',
      strategyVersionId: baselineVersionId,
      models: [{ provider: provider.id, model: provider.models[0] }],
      allowedParameterIds: ['risk.0.percent'],
      objective: { mode: 'balanced', minClosedTrades: 0 },
      split,
      runConfig,
      budget,
      maxRounds: 1,
      acknowledgeUnknownCost: false,
      idempotencyKey: `g1-create-${suffix}`,
    });
    expect(replayedCreate.id).toBe(created.id);

    await waitUntil(async () => {
      const detail = await optimizationController.experiment(created.id);
      return detail.experiment.status === 'awaiting_finalization';
    });
    const ready = await optimizationController.experiment(created.id);
    expect(ready.experiment.source).toMatchObject({
      kind: 'existing',
      strategyVersionId: baselineVersionId,
    });
    expect(ready.candidates).toHaveLength(1);
    expect(ready.experiment).toMatchObject({
      inputTokensUsed: 31,
      outputTokensUsed: 17,
      costSummary: {
        status: 'complete',
        knownAmount: '0',
        currency: 'USD',
      },
    });
    const candidate = ready.candidates[0]!;
    const finalizeInput = {
      candidateIds: [candidate.id],
      selectedCandidateId: candidate.id,
      expectedStage: 'awaiting_finalization' as const,
    };

    await expect(optimizationController.finalize(created.id, finalizeInput)).rejects.toThrow(
      'G1 受控封存测试技术失败',
    );
    const afterFailure = await optimizationController.experiment(created.id);
    expect(afterFailure.experiment).toMatchObject({
      status: 'awaiting_finalization',
      stage: 'awaiting_finalization',
      readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' },
    });
    const persistedAfterFailure = await prisma.$queryRaw<
      Array<{ baselineRunRefs: Record<string, string> }>
    >(Prisma.sql`
      SELECT "baselineRunRefs" FROM "OptimizationExperiment" WHERE "id"=${created.id}::uuid
    `);
    const testBaselineRunId = persistedAfterFailure[0]?.baselineRunRefs.test;
    expect(testBaselineRunId).toBeTruthy();
    const protectedRun = await backtestController.status(testBaselineRunId!);
    expect(protectedRun).toMatchObject({
      id: testBaselineRunId,
      readEligibility: { state: 'restricted', code: 'TEST_NOT_REVEALED' },
    });
    expect(protectedRun).not.toHaveProperty('result');

    const completed = await optimizationController.finalize(created.id, finalizeInput);
    expect(completed.experiment).toMatchObject({
      status: 'succeeded',
      stage: 'completed',
      readEligibility: { state: 'readable' },
    });
    expect(completed.candidates[0]).toMatchObject({
      id: candidate.id,
      validationStatus: 'test_valid',
      readEligibility: { state: 'readable' },
    });
    const baselineFinalCalls = runCreateKeys.filter((key) => key.includes(':baseline-final:test'));
    expect(baselineFinalCalls).toHaveLength(1);
    const revealedRun = await backtestController.status(testBaselineRunId!);
    expect(revealedRun).toMatchObject({
      id: testBaselineRunId,
      readEligibility: { state: 'readable' },
      result: { source: 'BACKTEST' },
    });

    const staleContext = await optimizationController.adoptContext(created.id, {
      candidateId: candidate.id,
    });
    expect(staleContext.expectedStrategyVersion).toBe(1);
    await prisma.strategyVersion.create({
      data: {
        strategyId,
        version: 2,
        schemaVersion: 2,
        schema: strategy('0.075') as Prisma.InputJsonValue,
      },
    });
    await expect(
      optimizationController.adopt(created.id, {
        candidateId: candidate.id,
        candidateHash: candidate.executionHash,
        expectedStrategyVersion: staleContext.expectedStrategyVersion,
        idempotencyKey: `g1-adopt-stale-${suffix}`,
        acknowledgeTestExposure: false,
      }),
    ).rejects.toThrow('正式策略已经发布新版本');

    const refreshedContext = await optimizationController.adoptContext(created.id, {
      candidateId: candidate.id,
    });
    expect(refreshedContext.expectedStrategyVersion).toBe(2);
    const adoptionInput = {
      candidateId: candidate.id,
      candidateHash: candidate.executionHash,
      expectedStrategyVersion: refreshedContext.expectedStrategyVersion,
      idempotencyKey: `g1-adopt-${suffix}`,
      acknowledgeTestExposure: false,
    };
    const adopted = await optimizationController.adopt(created.id, adoptionInput);
    const replayedAdoption = await optimizationController.adopt(created.id, adoptionInput);
    expect(adopted.strategyVersion).toMatchObject({ version: 3, strategyId });
    expect(replayedAdoption).toEqual(adopted);

    const persisted = await prisma.$queryRaw<
      Array<{
        experimentStatus: string;
        testExposedAt: Date | null;
        adoptionCount: bigint;
        adoptedVersion: number | null;
      }>
    >(Prisma.sql`
      SELECT e."status" AS "experimentStatus", e."testExposedAt",
             COUNT(a."id")::bigint AS "adoptionCount", MAX(v."version") AS "adoptedVersion"
      FROM "OptimizationExperiment" e
      LEFT JOIN "OptimizationAdoption" a ON a."experimentId"=e."id"
      LEFT JOIN "StrategyVersion" v ON v."id"=a."formalStrategyVersionId"
      WHERE e."id"=${created.id}::uuid
      GROUP BY e."id"
    `);
    expect(persisted[0]).toMatchObject({
      experimentStatus: 'succeeded',
      adoptionCount: 1n,
      adoptedVersion: 3,
    });
    expect(persisted[0]?.testExposedAt).toBeInstanceOf(Date);
  });
});
