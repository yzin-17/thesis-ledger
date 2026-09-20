import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import type {
  StrategyRiskApplicationCommandResult,
  StrategyRiskApplicationRow,
} from '../../src/strategy-optimization/strategy-risk-application.types.js';
import { createStrategyFixture } from './strategy-optimization-postgres-fixtures.js';

const postgresDescribe =
  process.env.RUN_STRATEGY_CENTER_T05_POSTGRES_E2E === '1' ? describe : describe.skip;
const symbol = '600519.SH';
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeStrategy = createStrategyFixture(symbol, `T05 ${suffix}`);

const previewFor = (strategyVersionId: string, accountId: string, cycleMode: string) => ({
  previewHash: `preview-${strategyVersionId}-${accountId}-${cycleMode}`,
  plan: {
    semanticVersion: 'strategy-monitoring-v1' as const,
    strategyVersionId,
    strategyHash: `strategy-${strategyVersionId}`,
    planHash: `plan-${strategyVersionId}`,
    executionSymbol: symbol,
    evaluationTimeframe: '1d',
    rules: [
      {
        sourceKey: 'risk.0',
        sourceRiskIndex: 0,
        semanticVersion: 'strategy-monitoring-v1' as const,
        kind: 'cost-stop' as const,
        label: '成本止损',
        metric: 'priceToAverageCostReturn' as const,
        operator: 'lte' as const,
        threshold: '-0.08',
        evaluationTimeframe: '1d',
        costBasisPolicy: 'account-projection-average-cost-including-known-fees' as const,
      },
    ],
    coverage: { riskTotal: 1, riskMapped: 1, items: [] },
  },
  evaluations: [],
  cycleMode: cycleMode as 'existingAndFuture' | 'nextPositionCycle',
  context: {
    positionId: null,
    tradeId: null,
    openedAt: null,
    occurredAt: null,
    availableAt: null,
  },
});

postgresDescribe('T05 策略风险应用 PostgreSQL 隔离集成', () => {
  const prisma = new PrismaService();
  const store = new StrategyRiskApplicationStoreService(prisma);
  const service = new StrategyRiskApplicationService(prisma, {} as never, store, {} as never);
  const accountIds = Array.from({ length: 5 }, () => randomUUID());
  const strategyId = randomUUID();
  let version1Id = '';
  let version2Id = '';
  const createdApplicationIds: string[] = [];
  const historicalApplicationIds: string[] = [];

  const create = async (input: {
    strategyVersionId: string;
    accountId: string;
    cycleMode?: 'existingAndFuture' | 'nextPositionCycle';
    enabled?: boolean;
    idempotencyKey: string;
    notification?: Record<string, unknown>;
  }) => {
    const cycleMode = input.cycleMode ?? 'existingAndFuture';
    const preview = previewFor(input.strategyVersionId, input.accountId, cycleMode);
    const result = await service.create({
      strategyVersionId: input.strategyVersionId,
      accountId: input.accountId,
      symbol,
      cycleMode,
      previewHash: preview.previewHash,
      idempotencyKey: input.idempotencyKey,
      enabled: input.enabled ?? false,
      notification: input.notification ?? {
        enabled: true,
        cooldownMinutes: 60,
        severity: 'warning',
        channels: ['feishu'],
      },
    });
    if (!createdApplicationIds.includes(result.id)) createdApplicationIds.push(result.id);
    return result as StrategyRiskApplicationCommandResult;
  };

  beforeAll(async () => {
    process.env.STRATEGY_RISK_APPLICATIONS_ENABLED = 'true';
    await prisma.$connect();
    await prisma.account.createMany({
      data: accountIds.map((id, index) => ({
        id,
        name: `T05 account ${suffix}-${index}`,
        type: 'broker',
        mode: 'actual',
        currency: 'CNY',
        active: true,
      })),
    });
    await prisma.asset.upsert({
      where: { symbol },
      create: { symbol, name: '贵州茅台', market: 'CN', assetType: 'stock', currency: 'CNY' },
      update: {},
    });
    const strategy = await prisma.strategy.create({
      data: { id: strategyId, name: `T05 strategy ${suffix}`, status: 'active', schemaVersion: 2 },
    });
    const [version1, version2] = await Promise.all([
      prisma.strategyVersion.create({
        data: {
          strategyId: strategy.id,
          version: 1,
          schemaVersion: 2,
          schema: makeStrategy('0.08') as Prisma.InputJsonValue,
        },
      }),
      prisma.strategyVersion.create({
        data: {
          strategyId: strategy.id,
          version: 2,
          schemaVersion: 2,
          schema: makeStrategy('0.06', '0.20') as Prisma.InputJsonValue,
        },
      }),
    ]);
    version1Id = version1.id;
    version2Id = version2.id;

    vi.spyOn(service, 'preview').mockImplementation(async (input: unknown) => {
      const parsed = input as { strategyVersionId: string; accountId: string; cycleMode: string };
      return previewFor(parsed.strategyVersionId, parsed.accountId, parsed.cycleMode) as never;
    });
    // T05 只验证应用事务和身份；冻结 RiskRule/审计由既有策略风险应用 PostgreSQL 套件覆盖。
    vi.spyOn(store, 'createFrozenRules').mockResolvedValue(undefined);
    vi.spyOn(store, 'audit').mockResolvedValue(1);
  });

  afterAll(async () => {
    const applicationIds = [...createdApplicationIds, ...historicalApplicationIds];
    if (applicationIds.length > 0) {
      await prisma
        .$executeRaw(
          Prisma.sql`
        DELETE FROM "StrategyRiskApplicationAudit"
        WHERE "applicationId" IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))})
      `,
        )
        .catch(() => undefined);
      await prisma
        .$executeRaw(
          Prisma.sql`
        DELETE FROM "StrategyRiskApplication"
        WHERE "id" IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))})
      `,
        )
        .catch(() => undefined);
    }
    await prisma.strategyVersion.deleteMany({ where: { strategyId } }).catch(() => undefined);
    await prisma.strategy.deleteMany({ where: { id: strategyId } }).catch(() => undefined);
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('并发同身份保存只返回一个可管理目标，通知变化不改变身份', async () => {
    const [first, second] = await Promise.all([
      create({
        strategyVersionId: version1Id,
        accountId: accountIds[0]!,
        idempotencyKey: `t05-duplicate-a-${suffix}`,
        notification: {
          enabled: true,
          cooldownMinutes: 60,
          severity: 'warning',
          channels: ['feishu'],
        },
      }),
      create({
        strategyVersionId: version1Id,
        accountId: accountIds[0]!,
        idempotencyKey: `t05-duplicate-b-${suffix}`,
        notification: { enabled: false, cooldownMinutes: 5, severity: 'critical', channels: [] },
      }),
    ]);
    expect(first.id).toBe(second.id);
    const reused = [first, second].find((item) => item.applicationResolution?.kind === 'reused');
    expect(reused?.applicationResolution).toMatchObject({
      kind: 'reused',
      reason: 'same_identity',
      management: { applicationId: first.id, actions: ['view', 'edit'] },
    });
    const rows = await prisma.$queryRaw<StrategyRiskApplicationRow[]>(Prisma.sql`
      SELECT * FROM "StrategyRiskApplication"
      WHERE "strategyVersionId"=${version1Id}::uuid AND "accountId"=${accountIds[0]}::uuid
        AND "symbol"=${symbol} AND "cycleMode"='existingAndFuture' AND "archivedAt" IS NULL
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notification).toEqual(first.notification);
  });

  it('不同版本和范围在同账户标的启用竞态中只允许一个成功，另一条仍可显式保存停用', async () => {
    const [versionApplication, scopeApplication] = await Promise.all([
      create({
        strategyVersionId: version1Id,
        accountId: accountIds[1]!,
        idempotencyKey: `t05-enabled-version-${suffix}`,
      }),
      create({
        strategyVersionId: version2Id,
        accountId: accountIds[1]!,
        cycleMode: 'nextPositionCycle',
        idempotencyKey: `t05-enabled-scope-${suffix}`,
      }),
    ]);
    const outcomes = await Promise.allSettled([
      service.update(versionApplication.id, { expectedRevision: 1, enabled: true }),
      service.update(scopeApplication.id, { expectedRevision: 1, enabled: true }),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const enabledRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "StrategyRiskApplication"
      WHERE "accountId"=${accountIds[1]}::uuid AND "symbol"=${symbol}
        AND "enabled"=true AND "archivedAt" IS NULL
    `);
    expect(enabledRows).toHaveLength(1);
    const failed = outcomes.find(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );
    expect(failed?.reason).toBeInstanceOf(ConflictException);
    let failedApplication = scopeApplication;
    if (failed === undefined || failed === outcomes[0]) failedApplication = versionApplication;
    await expect(
      service.update(failedApplication.id, { expectedRevision: 1, enabled: false }),
    ).resolves.toMatchObject({ enabled: false, revision: 2 });
  });

  it('过期预览/修订被拒绝，且历史重复全部可列出并返回歧义管理入口', async () => {
    const previewInput = {
      strategyVersionId: version1Id,
      accountId: accountIds[2]!,
      symbol,
      cycleMode: 'existingAndFuture' as const,
      previewHash: 'stale-preview',
      idempotencyKey: `t05-stale-preview-${suffix}`,
    };
    await expect(service.create(previewInput)).rejects.toThrow('预览已经过期');

    const historicalIds: string[] = [randomUUID(), randomUUID(), randomUUID()];
    historicalApplicationIds.push(...historicalIds);
    for (const [index, id] of historicalIds.entries()) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "StrategyRiskApplication" (
          "id", "strategyVersionId", "accountId", "symbol", "revision", "semanticVersion",
          "planHash", "plan", "cycleMode", "cycleAnchor", "enabled", "notification", "coverage",
          "idempotencyKey", "archivedAt", "updatedAt"
        ) VALUES (
          ${id}::uuid, ${version1Id}::uuid, ${accountIds[2]}::uuid, ${symbol}, 1,
          'strategy-monitoring-v1', 'history-plan', '{}'::jsonb, 'existingAndFuture', '{}'::jsonb, false,
          '{"enabled":true,"cooldownMinutes":60,"severity":"warning","channels":[]}'::jsonb,
          '{}'::jsonb, ${`t05-history-${suffix}-${index}`}, ${index === 2 ? new Date() : null}, CURRENT_TIMESTAMP
        )
      `);
    }
    const listed = await service.list(accountIds[2], symbol);
    expect(listed.filter((item) => historicalIds.includes(item.id))).toHaveLength(3);
    await expect(
      service.create({
        ...previewInput,
        previewHash: previewFor(version1Id, accountIds[2]!, 'existingAndFuture').previewHash,
        idempotencyKey: `t05-history-new-${suffix}`,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: 'STRATEGY_RISK_APPLICATION_IDENTITY_AMBIGUOUS',
        applications: expect.arrayContaining([
          expect.objectContaining({ id: historicalIds[0] }),
          expect.objectContaining({ id: historicalIds[1] }),
        ]),
      }),
    });
  });

  it('升级命中目标版本已有应用时只返回目标管理入口，不覆盖源记录', async () => {
    const source = await create({
      strategyVersionId: version1Id,
      accountId: accountIds[3]!,
      idempotencyKey: `t05-upgrade-source-${suffix}`,
    });
    const target = await create({
      strategyVersionId: version2Id,
      accountId: accountIds[3]!,
      idempotencyKey: `t05-upgrade-target-${suffix}`,
    });
    const targetPreview = previewFor(version2Id, accountIds[3]!, 'existingAndFuture');
    const upgraded = await service.upgrade(source.id, {
      expectedRevision: 1,
      targetStrategyVersionId: version2Id,
      previewHash: targetPreview.previewHash,
      idempotencyKey: `t05-upgrade-command-${suffix}`,
    });
    expect(upgraded).toMatchObject({
      id: target.id,
      applicationResolution: {
        kind: 'upgrade_target_exists',
        sourceApplicationId: source.id,
        management: { applicationId: target.id, actions: ['view', 'edit'] },
      },
    });
    expect(await store.get(source.id)).toMatchObject({
      strategyVersionId: version1Id,
      revision: 1,
      enabled: false,
    });
    expect(await store.get(target.id)).toMatchObject({
      strategyVersionId: version2Id,
      revision: 1,
      enabled: false,
    });
  });

  it('停用保存后的过期 revision 仍拒绝写入', async () => {
    const application = await create({
      strategyVersionId: version1Id,
      accountId: accountIds[4]!,
      idempotencyKey: `t05-stale-revision-${suffix}`,
    });
    await expect(
      service.update(application.id, {
        expectedRevision: 1,
        enabled: false,
        notification: { enabled: false, cooldownMinutes: 30, severity: 'info', channels: [] },
      }),
    ).resolves.toMatchObject({ revision: 2, enabled: false });
    await expect(
      service.update(application.id, {
        expectedRevision: 1,
        enabled: false,
      }),
    ).rejects.toThrow('刷新后重试');
  });
});
