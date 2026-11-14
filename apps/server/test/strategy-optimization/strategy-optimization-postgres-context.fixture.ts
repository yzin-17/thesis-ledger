import { Prisma } from '@prisma/client';
import { type BacktestStrategy } from '@thesis-ledger/schemas';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { RiskService } from '../../src/risk/risk.service.js';
import { StrategyRiskContextService } from '../../src/risk/strategy-risk-context.service.js';
import {
  optimizationSha256,
  type ExperimentRow,
} from '../../src/strategy-optimization/strategy-optimization-common.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import { createRiskMarketFixture } from './strategy-optimization-market-fixture.js';
import {
  budget,
  createNormalizedRunConfig,
  createStrategyFixture,
  proposal,
  split,
} from './strategy-optimization-postgres-fixtures.js';
import { createPostgresOptimizationBacktests } from './strategy-optimization-postgres-run.fixture.js';
import { createPostgresOptimizationSdk } from './strategy-optimization-postgres-sdk.fixture.js';

const symbol = '600519.SH';

const evaluatedAt = new Date('2026-09-11T08:00:00.000Z');

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const strategy = createStrategyFixture(symbol, suffix);

const runConfig = createNormalizedRunConfig();

function optimizationPostgresContext() {
  const prisma = new PrismaService();
  const market = createRiskMarketFixture(prisma, symbol, suffix);
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
  const configuredRuns = {
    resolve: async (strategyVersionId: string, config: unknown, idempotencyKey: string) => ({
      kind: 'prepared',
      input: { contractVersion: 3, strategyVersionId, runConfig: config, idempotencyKey },
    }),
  };
  const makeRisk = () =>
    new RiskService(
      prisma,
      notifications as never,
      undefined,
      undefined,
      undefined,
      undefined,
      market.reader,
    );
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
  const sdkExecutor = createPostgresOptimizationSdk(prisma, provider);
  const backtests = createPostgresOptimizationBacktests(prisma);
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
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "exposure",
        "aiCallsUsed", "inputTokensUsed", "outputTokensUsed", "leaseUntil", "idempotencyKey"
      ) VALUES (
        ${id}::uuid, ${baselineStrategyVersionId}::uuid, ${options.status ?? 'running'}, ${options.stage ?? 'proposing'},
        ${JSON.stringify({ mode: 'balanced', minClosedTrades: 0 })}::jsonb,
        ${JSON.stringify(['risk.0.percent'])}::jsonb,
        ${JSON.stringify(split)}::jsonb, ${JSON.stringify(runConfig)}::jsonb,
        ${`data-${id}`}, ${JSON.stringify([{ provider: provider.id, model: provider.models[0], costStatus: 'known' }])}::jsonb,
        ${JSON.stringify(budget)}::jsonb, 1, '{"testRevealed":false}'::jsonb,
        ${options.aiCallsUsed ?? 0}, ${options.inputTokensUsed ?? 0}, ${options.outputTokensUsed ?? 0},
        ${options.leaseUntil ?? null}, ${options.idempotencyKey ?? `postgres-e2e-experiment-${suffix}-${id}`}
      )
    `);
    return id;
  };
  const insertAdoptableCandidate = async (
    baselineVersionId: string,
    version: number,
    candidateSchema: BacktestStrategy,
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
          "testExposedAt"=CURRENT_TIMESTAMP, "exposure"='{"testRevealed":true}'::jsonb
      WHERE "id"=${experimentId}::uuid
    `);
    return { experimentId, candidateId, candidateVersionId: candidateVersion.id, hash };
  };
  const fixtureState = {
    get prisma() {
      return prisma;
    },
    get market() {
      return market;
    },
    get accountId() {
      return accountId;
    },
    get conflictAccountId() {
      return conflictAccountId;
    },
    get strategyId() {
      return strategyId;
    },
    get version1Id() {
      return version1Id;
    },
    set version1Id(value: typeof version1Id) {
      version1Id = value;
    },
    get version2Id() {
      return version2Id;
    },
    set version2Id(value: typeof version2Id) {
      version2Id = value;
    },
    get riskApplications() {
      return riskApplications;
    },
    set riskApplications(value: typeof riskApplications) {
      riskApplications = value;
    },
    get primaryApplicationId() {
      return primaryApplicationId;
    },
    set primaryApplicationId(value: typeof primaryApplicationId) {
      primaryApplicationId = value;
    },
    get notifications() {
      return notifications;
    },
    get configuredRuns() {
      return configuredRuns;
    },
    get makeRisk() {
      return makeRisk;
    },
    get provider() {
      return provider;
    },
    get providers() {
      return providers;
    },
    get sdkExecutor() {
      return sdkExecutor;
    },
    get backtests() {
      return backtests;
    },
    get readExperiment() {
      return readExperiment;
    },
    get insertExperiment() {
      return insertExperiment;
    },
    get insertAdoptableCandidate() {
      return insertAdoptableCandidate;
    },
  };
  beforeAll(async () => {
    await initializeOptimizationPostgresFixture(fixtureState);
  });
  afterAll(async () => {
    await releaseOptimizationPostgresFixture(fixtureState);
  });
  return fixtureState;
}

async function initializeOptimizationPostgresFixture(
  lifecycleScope: ReturnType<typeof optimizationPostgresContext>,
): Promise<void> {
  process.env.STRATEGY_AI_OPTIMIZATION_ENABLED = 'true';
  process.env.STRATEGY_RISK_APPLICATIONS_ENABLED = 'true';
  await lifecycleScope.prisma.$connect();
  await lifecycleScope.prisma.account.createMany({
    data: [
      {
        id: lifecycleScope.accountId,
        name: `Service E2E ${suffix}`,
        type: 'broker',
        mode: 'actual',
        currency: 'CNY',
        active: true,
      },
      {
        id: lifecycleScope.conflictAccountId,
        name: `Service E2E conflict ${suffix}`,
        type: 'broker',
        mode: 'actual',
        currency: 'CNY',
        active: true,
      },
    ],
  });
  await lifecycleScope.prisma.asset.upsert({
    where: { symbol },
    create: { symbol, name: '贵州茅台', market: 'CN', assetType: 'stock', currency: 'CNY' },
    update: {},
  });
  await lifecycleScope.prisma.position.createMany({
    data: [
      {
        accountId: lifecycleScope.accountId,
        symbol,
        quantity: new Prisma.Decimal('100'),
        costPrice: new Prisma.Decimal('100'),
        source: 'postgres-e2e',
      },
      {
        accountId: lifecycleScope.conflictAccountId,
        symbol,
        quantity: new Prisma.Decimal('100'),
        costPrice: new Prisma.Decimal('100'),
        source: 'postgres-e2e',
      },
    ],
  });
  const createdStrategy = await lifecycleScope.prisma.strategy.create({
    data: {
      id: lifecycleScope.strategyId,
      name: `Service E2E Strategy ${suffix}`,
      status: 'active',
      schemaVersion: 2,
    },
  });
  const [version1, version2] = await Promise.all([
    lifecycleScope.prisma.strategyVersion.create({
      data: {
        strategyId: createdStrategy.id,
        version: 1,
        schemaVersion: 2,
        schema: strategy('0.08') as Prisma.InputJsonValue,
      },
    }),
    lifecycleScope.prisma.strategyVersion.create({
      data: {
        strategyId: createdStrategy.id,
        version: 2,
        schemaVersion: 2,
        schema: strategy('0.06', '0.20') as Prisma.InputJsonValue,
      },
    }),
  ]);
  lifecycleScope.version1Id = version1.id;
  lifecycleScope.version2Id = version2.id;
  const risk = lifecycleScope.makeRisk();
  lifecycleScope.riskApplications = new StrategyRiskApplicationService(
    lifecycleScope.prisma,
    new StrategyRiskContextService(lifecycleScope.prisma, lifecycleScope.market.reader),
    new StrategyRiskApplicationStoreService(lifecycleScope.prisma),
    risk,
  );
}

async function releaseOptimizationPostgresFixture(
  lifecycleScope: ReturnType<typeof optimizationPostgresContext>,
): Promise<void> {
  await lifecycleScope.prisma.backtestJob.deleteMany({
    where: { strategyVersion: { strategyId: lifecycleScope.strategyId } },
  });
  await lifecycleScope.prisma
    .$executeRawUnsafe('DROP TRIGGER IF EXISTS strategy_optimization_e2e_fail_rule ON "RiskRule"')
    .catch(() => undefined);
  await lifecycleScope.prisma
    .$executeRawUnsafe('DROP FUNCTION IF EXISTS strategy_optimization_e2e_fail_rule()')
    .catch(() => undefined);
  await lifecycleScope.prisma
    .$executeRaw(
      Prisma.sql`
      DELETE FROM "OptimizationAdoption" WHERE "experimentId" IN (
        SELECT "id" FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
      )
    `,
    )
    .catch(() => undefined);
  await lifecycleScope.prisma
    .$executeRaw(
      Prisma.sql`
      DELETE FROM "OptimizationAttempt" WHERE "experimentId" IN (
        SELECT "id" FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
      )
    `,
    )
    .catch(() => undefined);
  await lifecycleScope.prisma
    .$executeRaw(
      Prisma.sql`
      DELETE FROM "OptimizationCandidate" WHERE "experimentId" IN (
        SELECT "id" FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
      )
    `,
    )
    .catch(() => undefined);
  await lifecycleScope.prisma
    .$executeRaw(
      Prisma.sql`
      DELETE FROM "OptimizationExperiment" WHERE "idempotencyKey" LIKE ${`postgres-e2e-experiment-${suffix}%`}
    `,
    )
    .catch(() => undefined);
  await lifecycleScope.prisma.riskRuleTriggerState
    .deleteMany({ where: { rule: { sourcePlanId: { not: null } } } })
    .catch(() => undefined);
  await lifecycleScope.prisma.riskEvent
    .deleteMany({
      where: { accountId: { in: [lifecycleScope.accountId, lifecycleScope.conflictAccountId] } },
    })
    .catch(() => undefined);
  const applicationRows = await lifecycleScope.prisma
    .$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
      SELECT "id" FROM "StrategyRiskApplication" WHERE "idempotencyKey" LIKE ${`postgres-e2e-risk-${suffix}%`}
    `,
    )
    .catch(() => []);
  const applicationIds = applicationRows.map((row) => row.id);
  if (applicationIds.length > 0) {
    const rules = await lifecycleScope.prisma.riskRule.findMany({
      where: { sourcePlanId: { in: applicationIds } },
      select: { id: true },
    });
    await lifecycleScope.prisma.riskRuleAudit
      .deleteMany({ where: { ruleId: { in: rules.map((rule) => rule.id) } } })
      .catch(() => undefined);
    await lifecycleScope.prisma.riskRule
      .deleteMany({ where: { sourcePlanId: { in: applicationIds } } })
      .catch(() => undefined);
    await lifecycleScope.prisma
      .$executeRaw(
        Prisma.sql`
        DELETE FROM "StrategyRiskApplicationAudit" WHERE "applicationId" IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))})
      `,
      )
      .catch(() => undefined);
    await lifecycleScope.prisma
      .$executeRaw(
        Prisma.sql`
        DELETE FROM "StrategyRiskApplication" WHERE "id" IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))})
      `,
      )
      .catch(() => undefined);
  }
  await lifecycleScope.prisma.aiRun
    .deleteMany({ where: { provider: lifecycleScope.provider.id } })
    .catch(() => undefined);
  await lifecycleScope.prisma.strategyVersion
    .deleteMany({ where: { strategyId: lifecycleScope.strategyId } })
    .catch(() => undefined);
  await lifecycleScope.prisma.strategy
    .deleteMany({ where: { id: lifecycleScope.strategyId } })
    .catch(() => undefined);
  await lifecycleScope.prisma.position
    .deleteMany({
      where: { accountId: { in: [lifecycleScope.accountId, lifecycleScope.conflictAccountId] } },
    })
    .catch(() => undefined);
  await lifecycleScope.prisma.account
    .deleteMany({
      where: { id: { in: [lifecycleScope.accountId, lifecycleScope.conflictAccountId] } },
    })
    .catch(() => undefined);
  await lifecycleScope.market.cleanup();
  await lifecycleScope.prisma.$disconnect();
}

export { evaluatedAt, optimizationPostgresContext, runConfig, strategy, suffix, symbol };
