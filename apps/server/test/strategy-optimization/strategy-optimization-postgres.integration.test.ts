import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { RiskService } from '../../src/risk/risk.service.js';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import { StrategyOptimizationCandidateService } from '../../src/strategy-optimization/strategy-optimization-candidate.service.js';
import {
  type ExperimentRow,
  optimizationSha256,
} from '../../src/strategy-optimization/strategy-optimization-common.js';
import { describeStrategyParameters } from '../../src/strategy-optimization/strategy-optimization-parameters.js';
import { StrategyOptimizationReadService } from '../../src/strategy-optimization/strategy-optimization-read.service.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';
import { StrategyOptimizationService } from '../../src/strategy-optimization/strategy-optimization.service.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';

const postgresDescribe =
  process.env.RUN_STRATEGY_OPTIMIZATION_POSTGRES_E2E === '1' ? describe : describe.skip;
const symbol = '600519.SH';
const evaluatedAt = new Date('2026-09-11T08:00:00.000Z');
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const strategy = (stopPercent: string, takeProfit?: string): StrategySchemaV2 =>
  strategySchemaV2.parse({
    schemaVersion: '2',
    name: `PostgreSQL 服务级 E2E ${suffix}`,
    signalSources: [
      {
        id: 'price',
        asset: { symbol, market: 'CN', assetType: 'stock' },
        timeframe: '1d',
        series: ['open', 'high', 'low', 'close', 'volume'],
      },
    ],
    executionInstrument: { symbol, market: 'CN', assetType: 'stock' },
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
    risk: [
      { type: 'fixedStop', percent: stopPercent },
      ...(takeProfit ? [{ type: 'fixedTakeProfit' as const, percent: takeProfit }] : []),
    ],
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
  baseCurrency: 'CNY' as const,
  initialCash: { CNY: '100000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable' as const,
    fxPolicy: 'latestAvailable' as const,
  },
};
const split = {
  development: { start: '2026-01-01', end: '2026-04-30' },
  validation: { start: '2026-05-01', end: '2026-07-31' },
  test: { start: '2026-08-01', end: '2026-09-10' },
};
const budget = {
  maxAiCalls: 10,
  maxBacktestRuns: 30,
  maxInputTokens: 200_000,
  maxOutputTokens: 20_000,
  maxCost: '100',
  maxDurationSeconds: 1_800,
};
const proposal = {
  changes: [{ parameterId: 'risk.0.percent', value: '0.07' }],
  reason: '服务级集成测试参数候选',
  evidenceRefs: ['postgres-service-e2e'],
};

const waitUntil = async (predicate: () => Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('等待服务级集成状态变化超时');
};

postgresDescribe('策略风险与 AI 优化 PostgreSQL 服务级 E2E', () => {
  const prisma = new PrismaService();
  const accountId = randomUUID();
  const conflictAccountId = randomUUID();
  const strategyId = randomUUID();
  let version1Id = '';
  let version2Id = '';
  let riskApplications: StrategyRiskApplicationService;
  let primaryApplicationId = '';

  const notifications = {
    enqueue: vi.fn(async () => []),
    subjectDeliveryStatus: vi.fn(async () => ({ shouldRetry: false })),
  };

  const provider = {
    id: 'postgres-e2e',
    models: ['optimizer-model'],
    metadata: {
      costPer1kInput: 0,
      costPer1kOutput: 0,
      costCurrency: 'USD',
      pricingVersion: 'test-v1',
    },
    complete: vi.fn(async () => ({
      content: proposal,
      inputTokens: 31,
      outputTokens: 17,
      cost: 0,
      costKnown: true,
      actualModel: 'optimizer-model',
    })),
  };
  const providers = {
    strict: vi.fn((providerId: string, model: string) => {
      if (providerId !== provider.id || model !== provider.models[0])
        throw new Error('测试 Provider 路由不匹配');
      return provider;
    }),
    list: vi.fn(() => [provider]),
  };

  const backtestJobs = new Map<string, Record<string, unknown>>();
  const backtests = {
    createRun: vi.fn(async (input: { strategyVersionId: string; idempotencyKey: string }) => {
      const previous = backtestJobs.get(input.idempotencyKey);
      if (previous) return previous;
      const id = randomUUID();
      const result = {
        source: 'BACKTEST',
        runId: id,
        strategyVersionId: input.strategyVersionId,
        snapshotId: `snapshot-${id}`,
        engineVersion: 'postgres-e2e-engine',
        schemaVersion: '2',
        marketRuleVersion: 'postgres-e2e-market-rules',
        calendarVersion: 'postgres-e2e-calendar',
        aggregationVersion: 'postgres-e2e-aggregation',
        contentHash: `content-${id}`,
        resultChecksum: `checksum-${id}`,
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
      };
      const job = {
        id,
        strategyVersionId: input.strategyVersionId,
        status: 'succeeded',
        errorCode: null,
        errorSummary: null,
        result,
        snapshotManifest: {
          artifacts: [
            { key: 'market/600519.SH/1d.json', contentHash: 'shared-frozen-market-data' },
          ],
        },
      };
      backtestJobs.set(input.idempotencyKey, job);
      return job;
    }),
    status: vi.fn(async (id: string) =>
      [...backtestJobs.values()].find((job) => job.id === id) ?? null,
    ),
    retryRun: vi.fn(async (id: string) =>
      [...backtestJobs.values()].find((job) => job.id === id) ?? null,
    ),
    runV2: vi.fn(async () => undefined),
  };

  const readExperiment = async (id: string) => {
    const rows = await prisma.$queryRaw<ExperimentRow[]>(Prisma.sql`
      SELECT * FROM "OptimizationExperiment" WHERE "id"=${id}::uuid LIMIT 1
    `);
    if (!rows[0]) throw new Error(`实验不存在: ${id}`);
    return rows[0];
  };

  const insertExperiment = async (
    baselineStrategyVersionId: string,
    options: {
      status?: string;
      stage?: string;
      leaseUntil?: Date | null;
      aiCallsUsed?: number;
      inputTokensUsed?: number;
      outputTokensUsed?: number;
      idempotencyKey?: string;
    } = {},
  ) => {
    const id = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds",
        "aiCallsUsed", "inputTokensUsed", "outputTokensUsed", "leaseUntil", "idempotencyKey"
      ) VALUES (
        ${id}::uuid, ${baselineStrategyVersionId}::uuid, ${options.status ?? 'running'}, ${options.stage ?? 'proposing'},
        ${JSON.stringify({ mode: 'balanced', minClosedTrades: 0 })}::jsonb,
        ${JSON.stringify(['risk.0.percent'])}::jsonb,
        ${JSON.stringify(split)}::jsonb, ${JSON.stringify(runConfig)}::jsonb,
        ${`data-${id}`}, ${JSON.stringify([{ provider: provider.id, model: provider.models[0], costStatus: 'known' }])}::jsonb,
        ${JSON.stringify(budget)}::jsonb, 1,
        ${options.aiCallsUsed ?? 0}, ${options.inputTokensUsed ?? 0}, ${options.outputTokensUsed ?? 0},
        ${options.leaseUntil ?? null}, ${options.idempotencyKey ?? `postgres-e2e-experiment-${suffix}-${id}`}
      )
    `);
    return id;
  };

  const insertAdoptableCandidate = async (
    baselineVersionId: string,
    version: number,
    candidateSchema: StrategySchemaV2,
  ) => {
    const candidateVersion = await prisma.strategyVersion.create({
      data: {
        strategyId,
        version,
        schemaVersion: 2,
        schema: candidateSchema as Prisma.InputJsonValue,
      },
    });
    const experimentId = await insertExperiment(baselineVersionId, {
      status: 'succeeded',
      stage: 'completed',
    });
    const candidateId = randomUUID();
    const hash = optimizationSha256(candidateSchema);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" (
        "id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId",
        "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics"
      ) VALUES (
        ${candidateId}::uuid, ${experimentId}::uuid, 1, ${`${provider.id}:${provider.models[0]}`},
        ${candidateVersion.id}::uuid, ${hash}, ${JSON.stringify(proposal)}::jsonb, '[]'::jsonb,
        'test_valid', ${JSON.stringify({ test: randomUUID() })}::jsonb,
        ${JSON.stringify({ test: { status: 'valid', score: 0.1 } })}::jsonb
      )
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OptimizationExperiment"
      SET "selectedCandidateId"=${candidateId}::uuid, "lockedCandidateIds"=${JSON.stringify([candidateId])}::jsonb,
          "testExposedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${experimentId}::uuid
    `);
    return { experimentId, candidateId, candidateVersionId: candidateVersion.id, hash };
  };

  beforeAll(async () => {
    process.env.STRATEGY_AI_OPTIMIZATION_ENABLED = 'true';
    process.env.STRATEGY_RISK_APPLICATIONS_ENABLED = 'true';
    await prisma.$connect();
    await prisma.account.createMany({
      data: [
        { id: accountId, name: `Service E2E ${suffix}`, type: 'broker', mode: 'actual', currency: 'CNY', active: true },
        { id: conflictAccountId, name: `Service E2E conflict ${suffix}`, type: 'broker', mode: 'actual', currency: 'CNY', active: true },
      ],
    });
    await prisma.asset.upsert({
      where: { symbol },
      create: { symbol, name: '贵州茅台', market: 'CN', assetType: 'stock', currency: 'CNY' },
      update: {},
    });
    await prisma.position.createMany({
      data: [
        { accountId, symbol, quantity: new Prisma.Decimal('100'), costPrice: new Prisma.Decimal('100'), source: 'postgres-e2e' },
        { accountId: conflictAccountId, symbol, quantity: new Prisma.Decimal('100'), costPrice: new Prisma.Decimal('100'), source: 'postgres-e2e' },
      ],
    });
    await prisma.marketBar.create({
      data: {
        symbol,
        timeframe: '1d',
        timestamp: new Date('2026-09-10T00:00:00.000Z'),
        open: new Prisma.Decimal('95'),
        high: new Prisma.Decimal('96'),
        low: new Prisma.Decimal('89'),
        close: new Prisma.Decimal('90'),
        volume: new Prisma.Decimal('1000'),
        amount: new Prisma.Decimal('90000'),
        provider: `postgres-e2e-${suffix}`,
        fetchedAt: new Date('2026-09-10T08:01:00.000Z'),
        freshness: 'live',
        fallbackUsed: false,
      },
    });
    const createdStrategy = await prisma.strategy.create({
      data: { id: strategyId, name: `Service E2E Strategy ${suffix}`, status: 'active', schemaVersion: 2 },
    });
    const [version1, version2] = await Promise.all([
      prisma.strategyVersion.create({
        data: { strategyId: createdStrategy.id, version: 1, schemaVersion: 2, schema: strategy('0.08') as Prisma.InputJsonValue },
      }),
      prisma.strategyVersion.create({
        data: { strategyId: createdStrategy.id, version: 2, schemaVersion: 2, schema: strategy('0.06', '0.20') as Prisma.InputJsonValue },
      }),
    ]);
    version1Id = version1.id;
    version2Id = version2.id;
    const risk = new RiskService(prisma, notifications as never);
    riskApplications = new StrategyRiskApplicationService(
      prisma,
      new StrategyRiskContextService(prisma),
      new StrategyRiskApplicationStoreService(prisma),
      risk,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS strategy_optimization_e2e_fail_rule ON "RiskRule"').catch(() => undefined);
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS strategy_optimization_e2e_fail_rule()').catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationAdoption" WHERE "experimentId" IN (
        SELECT "id" FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
      )
    `).catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationAttempt" WHERE "experimentId" IN (
        SELECT "id" FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
      )
    `).catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationCandidate" WHERE "experimentId" IN (
        SELECT "id" FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
      )
    `).catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
    `).catch(() => undefined);
    await prisma.riskRuleTriggerState.deleteMany({ where: { rule: { sourcePlanId: { not: null } } } }).catch(() => undefined);
    await prisma.riskEvent.deleteMany({ where: { accountId: { in: [accountId, conflictAccountId] } } }).catch(() => undefined);
    const applicationRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "StrategyRiskApplication" WHERE "idempotencyKey" LIKE ${`postgres-e2e-risk-${suffix}%`}
    `).catch(() => []);
    const applicationIds = applicationRows.map((row) => row.id);
    if (applicationIds.length > 0) {
      const rules = await prisma.riskRule.findMany({ where: { sourcePlanId: { in: applicationIds } }, select: { id: true } });
      await prisma.riskRuleAudit.deleteMany({ where: { ruleId: { in: rules.map((rule) => rule.id) } } }).catch(() => undefined);
      await prisma.riskRule.deleteMany({ where: { sourcePlanId: { in: applicationIds } } }).catch(() => undefined);
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "StrategyRiskApplicationAudit" WHERE "applicationId" IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))})
      `).catch(() => undefined);
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "StrategyRiskApplication" WHERE "id" IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))})
      `).catch(() => undefined);
    }
    await prisma.aiRun.deleteMany({ where: { provider: provider.id } }).catch(() => undefined);
    await prisma.strategyVersion.deleteMany({ where: { strategyId } }).catch(() => undefined);
    await prisma.strategy.deleteMany({ where: { id: strategyId } }).catch(() => undefined);
    await prisma.position.deleteMany({ where: { accountId: { in: [accountId, conflictAccountId] } } }).catch(() => undefined);
    await prisma.account.deleteMany({ where: { id: { in: [accountId, conflictAccountId] } } }).catch(() => undefined);
    await prisma.marketBar.deleteMany({ where: { provider: `postgres-e2e-${suffix}` } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('通过真实 Service 完成风险应用创建、启用、通知更新、扫描、并发唯一、原子升级与回滚', async () => {
    const preview = await riskApplications.preview({
      strategyVersionId: version1Id,
      accountId,
      symbol,
      cycleMode: 'existingAndFuture',
    });
    expect(preview.plan.rules).toHaveLength(1);
    const created = await riskApplications.create({
      strategyVersionId: version1Id,
      accountId,
      symbol,
      cycleMode: 'existingAndFuture',
      previewHash: preview.previewHash,
      idempotencyKey: `postgres-e2e-risk-${suffix}-primary`,
      enabled: false,
      notification: { enabled: true, cooldownMinutes: 60, severity: 'warning', channels: ['feishu'] },
    });
    primaryApplicationId = created.id;
    const enabled = await riskApplications.update(created.id, { expectedRevision: 1, enabled: true });
    expect(enabled).toMatchObject({ enabled: true, revision: 2 });

    const risk = new RiskService(prisma, notifications as never);
    const scan = await risk.scan({ contexts: [] }, { evaluatedAt });
    const sourceRules = await prisma.riskRule.findMany({ where: { sourcePlanId: created.id, archivedAt: null } });
    expect(scan.results.some((result) => sourceRules.some((rule) => rule.id === result.ruleId))).toBe(true);
    const triggerStatesBefore = await prisma.riskRuleTriggerState.findMany({
      where: { ruleId: { in: sourceRules.map((rule) => rule.id) } },
    });
    expect(triggerStatesBefore.length).toBeGreaterThan(0);

    const notificationUpdated = await riskApplications.update(created.id, {
      expectedRevision: 2,
      notification: { enabled: true, cooldownMinutes: 15, severity: 'critical', channels: ['feishu'] },
    });
    expect(notificationUpdated.revision).toBe(3);
    const triggerStatesAfter = await prisma.riskRuleTriggerState.findMany({
      where: { ruleId: { in: sourceRules.map((rule) => rule.id) } },
    });
    expect(triggerStatesAfter.map((state) => state.id).sort()).toEqual(
      triggerStatesBefore.map((state) => state.id).sort(),
    );
    await expect(
      riskApplications.update(created.id, {
        expectedRevision: 2,
        notification: { enabled: true, cooldownMinutes: 5, severity: 'warning', channels: ['feishu'] },
      }),
    ).rejects.toThrow('刷新后重试');

    const conflictPreview = await riskApplications.preview({
      strategyVersionId: version1Id,
      accountId: conflictAccountId,
      symbol,
      cycleMode: 'existingAndFuture',
    });
    const [conflictA, conflictB] = await Promise.all([
      riskApplications.create({
        strategyVersionId: version1Id,
        accountId: conflictAccountId,
        symbol,
        cycleMode: 'existingAndFuture',
        previewHash: conflictPreview.previewHash,
        idempotencyKey: `postgres-e2e-risk-${suffix}-conflict-a`,
        enabled: false,
      }),
      riskApplications.create({
        strategyVersionId: version1Id,
        accountId: conflictAccountId,
        symbol,
        cycleMode: 'existingAndFuture',
        previewHash: conflictPreview.previewHash,
        idempotencyKey: `postgres-e2e-risk-${suffix}-conflict-b`,
        enabled: false,
      }),
    ]);
    const concurrentEnable = await Promise.allSettled([
      riskApplications.update(conflictA.id, { expectedRevision: 1, enabled: true }),
      riskApplications.update(conflictB.id, { expectedRevision: 1, enabled: true }),
    ]);
    expect(concurrentEnable.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(concurrentEnable.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const enabledConflictRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "StrategyRiskApplication"
      WHERE "accountId"=${conflictAccountId}::uuid AND "symbol"=${symbol} AND "enabled"=true AND "archivedAt" IS NULL
    `);
    expect(enabledConflictRows[0]?.count).toBe(1n);

    const upgradePreview = await riskApplications.upgradePreview(created.id, version2Id);
    expect(upgradePreview.diff.some((item) => item.change === 'changed')).toBe(true);
    expect(upgradePreview.diff.some((item) => item.change === 'added')).toBe(true);
    const beforeFailure = await riskApplications.get(created.id);
    const activeRulesBeforeFailure = await prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
      orderBy: { id: 'asc' },
    });

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION strategy_optimization_e2e_fail_rule() RETURNS trigger AS $$
      BEGIN
        IF NEW."sourcePlanId" = '${created.id}'::uuid THEN
          RAISE EXCEPTION 'forced frozen-rule failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER strategy_optimization_e2e_fail_rule
      BEFORE INSERT ON "RiskRule"
      FOR EACH ROW EXECUTE FUNCTION strategy_optimization_e2e_fail_rule()
    `);
    await expect(
      riskApplications.upgrade(created.id, {
        expectedRevision: 3,
        targetStrategyVersionId: version2Id,
        previewHash: upgradePreview.previewHash,
        idempotencyKey: `postgres-e2e-risk-${suffix}-forced-rollback`,
      }),
    ).rejects.toThrow('forced frozen-rule failure');
    await prisma.$executeRawUnsafe('DROP TRIGGER strategy_optimization_e2e_fail_rule ON "RiskRule"');
    await prisma.$executeRawUnsafe('DROP FUNCTION strategy_optimization_e2e_fail_rule()');
    const afterFailure = await riskApplications.get(created.id);
    const activeRulesAfterFailure = await prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
      orderBy: { id: 'asc' },
    });
    expect(afterFailure.revision).toBe(beforeFailure.revision);
    expect(afterFailure.strategyVersionId).toBe(beforeFailure.strategyVersionId);
    expect(activeRulesAfterFailure.map((rule) => rule.id)).toEqual(
      activeRulesBeforeFailure.map((rule) => rule.id),
    );

    const upgraded = await riskApplications.upgrade(created.id, {
      expectedRevision: 3,
      targetStrategyVersionId: version2Id,
      previewHash: upgradePreview.previewHash,
      idempotencyKey: `postgres-e2e-risk-${suffix}-upgrade`,
    });
    expect(upgraded).toMatchObject({ strategyVersionId: version2Id, revision: 4, enabled: true });
    const upgradedRules = await prisma.riskRule.findMany({
      where: { sourcePlanId: created.id, archivedAt: null },
    });
    expect(upgradedRules).toHaveLength(2);
    expect(upgradedRules.every((rule) => rule.parameters && (rule.parameters as Record<string, unknown>).applicationRevision === 4)).toBe(true);
  });

  it('Provider 调用步骤在 PostgreSQL 中 crash-safe：调用前持久化、单 worker、成功去重、过期转 unknown 且预算不重复扣除', async () => {
    const baselineVersion = await prisma.strategyVersion.findUniqueOrThrow({ where: { id: version2Id } });
    const baseline = { ...baselineVersion, strategy: strategySchemaV2.parse(baselineVersion.schema) as StrategySchemaV2 };
    const descriptors = describeStrategyParameters(baseline.strategy);
    const runs = new StrategyOptimizationRunService(prisma, backtests as never);
    const route = { provider: provider.id, model: provider.models[0]! };

    const preCallExperimentId = await insertExperiment(version2Id);
    const preCallExperiment = await readExperiment(preCallExperimentId);
    provider.complete.mockImplementationOnce(async () => {
      const attempts = await prisma.$queryRaw<Array<{ status: string; aiRunId: string | null }>>(Prisma.sql`
        SELECT "status", "aiRunId" FROM "OptimizationAttempt"
        WHERE "experimentId"=${preCallExperimentId}::uuid AND "modelKey"=${`${provider.id}:${provider.models[0]}`} AND "attempt"=1
      `);
      expect(attempts[0]).toMatchObject({ status: 'running', aiRunId: expect.any(String) });
      const aiRun = await prisma.aiRun.findUniqueOrThrow({ where: { id: attempts[0]!.aiRunId! } });
      expect(aiRun).toMatchObject({ status: 'running', leaseUntil: expect.any(Date) });
      return { content: proposal, inputTokens: 31, outputTokens: 17, cost: 0, costKnown: true, actualModel: route.model };
    });
    const candidateService = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
    const first = await candidateService.generateProposal(preCallExperiment, baseline, descriptors, route, 1);
    expect(first.proposal).toEqual(proposal);
    const afterFirst = await readExperiment(preCallExperimentId);
    expect(afterFirst.aiCallsUsed).toBe(1);
    const aiRunCount = await prisma.aiRun.count({ where: { provider: provider.id, modelMetadata: { path: ['optimizationExperimentId'], equals: preCallExperimentId } } });
    const providerCallsAfterFirst = provider.complete.mock.calls.length;
    const replay = await candidateService.generateProposal(await readExperiment(preCallExperimentId), baseline, descriptors, route, 1);
    expect(replay.aiRunId).toBe(first.aiRunId);
    expect(provider.complete.mock.calls.length).toBe(providerCallsAfterFirst);
    expect(await prisma.aiRun.count({ where: { provider: provider.id, modelMetadata: { path: ['optimizationExperimentId'], equals: preCallExperimentId } } })).toBe(aiRunCount);
    expect((await readExperiment(preCallExperimentId)).aiCallsUsed).toBe(1);

    const concurrentExperimentId = await insertExperiment(version2Id);
    const concurrentExperiment = await readExperiment(concurrentExperimentId);
    let releaseProvider!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseProvider = resolve; });
    provider.complete.mockImplementationOnce(async () => {
      markStarted();
      await release;
      return { content: proposal, inputTokens: 31, outputTokens: 17, cost: 0, costKnown: true, actualModel: route.model };
    });
    const workerA = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
    const workerB = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
    const running = workerA.generateProposal(concurrentExperiment, baseline, descriptors, route, 1);
    await started;
    await expect(
      workerB.generateProposal(await readExperiment(concurrentExperimentId), baseline, descriptors, route, 1),
    ).rejects.toThrow(/正在由其他 Worker|未取得执行权/u);
    releaseProvider();
    await running;
    expect((await readExperiment(concurrentExperimentId)).aiCallsUsed).toBe(1);
    expect(await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationAttempt" WHERE "experimentId"=${concurrentExperimentId}::uuid
    `)).toEqual([{ count: 1n }]);

    const crashedExperimentId = await insertExperiment(version2Id, {
      aiCallsUsed: 1,
      inputTokensUsed: 31,
      outputTokensUsed: 17,
    });
    const crashedAiRun = await prisma.aiRun.create({
      data: {
        provider: provider.id,
        model: route.model,
        promptVersion: 'strategy-optimization-v1',
        status: 'running',
        executionAttempt: 1,
        claimedAt: new Date(Date.now() - 120_000),
        leaseUntil: new Date(Date.now() - 60_000),
        startedAt: new Date(Date.now() - 120_000),
        modelMetadata: { optimizationExperimentId: crashedExperimentId, round: 1 },
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" (
        "experimentId", "modelKey", "aiRunId", "attempt", "status", "startedAt", "leaseUntil"
      ) VALUES (
        ${crashedExperimentId}::uuid, ${`${provider.id}:${route.model}`}, ${crashedAiRun.id}::uuid, 1,
        'running', ${new Date(Date.now() - 120_000)}, ${new Date(Date.now() - 60_000)}
      )
    `);
    const callsBeforeRecovery = provider.complete.mock.calls.length;
    await expect(
      candidateService.generateProposal(await readExperiment(crashedExperimentId), baseline, descriptors, route, 1),
    ).rejects.toThrow(/结果未知|禁止自动重试/u);
    const recoveredAttempt = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status" FROM "OptimizationAttempt" WHERE "experimentId"=${crashedExperimentId}::uuid AND "attempt"=1
    `);
    expect(recoveredAttempt[0]?.status).toBe('unknown_outcome');
    expect((await prisma.aiRun.findUniqueOrThrow({ where: { id: crashedAiRun.id } })).status).toBe('failed');
    await expect(
      candidateService.generateProposal(await readExperiment(crashedExperimentId), baseline, descriptors, route, 2),
    ).rejects.toThrow('unknown_outcome');
    expect(provider.complete.mock.calls.length).toBe(callsBeforeRecovery);
    expect((await readExperiment(crashedExperimentId)).aiCallsUsed).toBe(1);
  });

  it('过期 Experiment 由 reconciler 恢复到候选与封存测试，再正式采纳并返回风险应用差异', async () => {
    provider.complete.mockImplementation(async () => ({
      content: proposal,
      inputTokens: 31,
      outputTokens: 17,
      cost: 0,
      costKnown: true,
      actualModel: 'optimizer-model',
    }));
    const runs = new StrategyOptimizationRunService(prisma, backtests as never);
    const candidateService = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
    const reads = new StrategyOptimizationReadService(prisma, providers as never);
    const optimizer = new StrategyOptimizationService(
      prisma,
      providers as never,
      candidateService,
      reads,
      runs,
      riskApplications,
    );
    const experimentId = await insertExperiment(version2Id, {
      status: 'running',
      stage: 'proposing',
      leaseUntil: new Date(Date.now() - 60_000),
    });
    const recovery = await optimizer.reconcilePending();
    expect(recovery.scheduled).toBeGreaterThanOrEqual(1);
    await waitUntil(async () => (await readExperiment(experimentId)).status === 'awaiting_finalization');
    const candidates = await reads.candidates(experimentId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.validationStatus).toBe('valid');

    await optimizer.finalize(experimentId, {
      candidateIds: [candidates[0]!.id],
      selectedCandidateId: candidates[0]!.id,
      expectedStage: 'awaiting_finalization',
    });
    const finalized = await readExperiment(experimentId);
    expect(finalized).toMatchObject({ status: 'succeeded', stage: 'completed' });
    const finalizedCandidate = (await reads.candidates(experimentId))[0]!;
    expect(finalizedCandidate.validationStatus).toBe('test_valid');

    const adoptionInput = {
      candidateId: finalizedCandidate.id,
      candidateHash: finalizedCandidate.executionHash,
      expectedStrategyVersion: 2,
      idempotencyKey: `postgres-e2e-adoption-${suffix}-recovery`,
      acknowledgeTestExposure: false,
    };
    const adopted = await optimizer.adopt(experimentId, adoptionInput);
    expect(adopted.strategyVersion?.version).toBe(3);
    const repeated = await optimizer.adopt(experimentId, adoptionInput);
    expect(repeated.strategyVersion?.id).toBe(adopted.strategyVersion?.id);
    const diffs = await riskApplications.planDiffsForTargetVersion(adopted.strategyVersion!.id);
    const primaryDiff = diffs.find((item) => item.applicationId === primaryApplicationId);
    expect(primaryDiff).toBeDefined();
    expect(primaryDiff?.diff.some((item) => item.change === 'changed')).toBe(true);
    expect((await riskApplications.get(primaryApplicationId)).strategyVersionId).toBe(version2Id);
  });

  it('正式采纳同 key 并发幂等、不同 key 禁止重复候选、expectedVersion fail-closed，并验证失败事务不留半套 Adoption', async () => {
    const runs = new StrategyOptimizationRunService(prisma, backtests as never);
    const candidateService = new StrategyOptimizationCandidateService(prisma, providers as never, runs);
    const reads = new StrategyOptimizationReadService(prisma, providers as never);
    const optimizer = new StrategyOptimizationService(
      prisma,
      providers as never,
      candidateService,
      reads,
      runs,
      riskApplications,
    );

    const concurrentCandidate = await insertAdoptableCandidate(version2Id, -20, strategy('0.09', '0.20'));
    const concurrentInput = {
      candidateId: concurrentCandidate.candidateId,
      candidateHash: concurrentCandidate.hash,
      expectedStrategyVersion: 3,
      idempotencyKey: `postgres-e2e-adoption-${suffix}-concurrent`,
      acknowledgeTestExposure: false,
    };
    const concurrent = await Promise.all([
      optimizer.adopt(concurrentCandidate.experimentId, concurrentInput),
      optimizer.adopt(concurrentCandidate.experimentId, concurrentInput),
    ]);
    expect(concurrent[0].strategyVersion?.id).toBe(concurrent[1].strategyVersion?.id);
    expect(concurrent[0].strategyVersion?.version).toBe(4);
    const retryAfterCommittedResponseLoss = await optimizer.adopt(
      concurrentCandidate.experimentId,
      concurrentInput,
    );
    expect(retryAfterCommittedResponseLoss.strategyVersion?.id).toBe(concurrent[0].strategyVersion?.id);
    await expect(
      optimizer.adopt(concurrentCandidate.experimentId, {
        ...concurrentInput,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-different-intent`,
      }),
    ).rejects.toThrow('已经被正式采纳');

    const staleCandidate = await insertAdoptableCandidate(version2Id, -21, strategy('0.10', '0.20'));
    await expect(
      optimizer.adopt(staleCandidate.experimentId, {
        candidateId: staleCandidate.candidateId,
        candidateHash: staleCandidate.hash,
        expectedStrategyVersion: 3,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-stale-version`,
        acknowledgeTestExposure: false,
      }),
    ).rejects.toThrow('正式策略已经发布新版本');
    const staleAdoptions = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationAdoption" WHERE "candidateId"=${staleCandidate.candidateId}::uuid
    `);
    expect(staleAdoptions[0]?.count).toBe(0n);

    const raceA = await insertAdoptableCandidate(version2Id, -22, strategy('0.11', '0.20'));
    const raceB = await insertAdoptableCandidate(version2Id, -23, strategy('0.12', '0.20'));
    const race = await Promise.allSettled([
      optimizer.adopt(raceA.experimentId, {
        candidateId: raceA.candidateId,
        candidateHash: raceA.hash,
        expectedStrategyVersion: 4,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-race-a`,
        acknowledgeTestExposure: false,
      }),
      optimizer.adopt(raceB.experimentId, {
        candidateId: raceB.candidateId,
        candidateHash: raceB.hash,
        expectedStrategyVersion: 4,
        idempotencyKey: `postgres-e2e-adoption-${suffix}-race-b`,
        acknowledgeTestExposure: false,
      }),
    ]);
    expect(race.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const raceAdoptions = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "OptimizationAdoption"
      WHERE "candidateId" IN (${raceA.candidateId}::uuid, ${raceB.candidateId}::uuid)
    `);
    expect(raceAdoptions[0]?.count).toBe(1n);

    const cancelledExperimentId = await insertExperiment(version2Id, { status: 'queued', stage: 'preparing' });
    const cancelled = await optimizer.cancel(cancelledExperimentId);
    expect(cancelled.status).toBe('cancelled');
    const beforeReconcile = await prisma.strategyVersion.findUniqueOrThrow({ where: { id: version2Id } });
    await optimizer.reconcilePending();
    expect((await readExperiment(cancelledExperimentId)).status).toBe('cancelled');
    expect((await prisma.strategyVersion.findUniqueOrThrow({ where: { id: version2Id } })).id).toBe(beforeReconcile.id);
    expect((await riskApplications.get(primaryApplicationId)).enabled).toBe(true);
    await expect(prisma.strategyVersion.delete({ where: { id: version2Id } })).rejects.toThrow();
  });
});
