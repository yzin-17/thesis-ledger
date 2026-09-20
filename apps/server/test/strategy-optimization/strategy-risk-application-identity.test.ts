import { ConflictException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import type { StrategyRiskApplicationRow } from '../../src/strategy-optimization/strategy-risk-application.types.js';

const strategyVersionId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const secondApplicationId = '33333333-3333-4333-8333-333333333333';
const symbol = '600519.SH';

const row = (overrides: Partial<StrategyRiskApplicationRow> = {}): StrategyRiskApplicationRow => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ownerKey: 'local-user',
  strategyVersionId,
  accountId,
  symbol,
  revision: 1,
  semanticVersion: 'strategy-monitoring-v1',
  planHash: 'plan-hash',
  plan: { rules: [] },
  cycleMode: 'existingAndFuture',
  cycleAnchor: null,
  enabled: false,
  notification: {
    enabled: true,
    cooldownMinutes: 60,
    severity: 'warning',
    channels: ['feishu'],
  },
  coverage: {},
  idempotencyKey: 'request-1',
  createdAt: new Date('2026-09-18T00:00:00.000Z'),
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
  archivedAt: null,
  ...overrides,
});

const preview = {
  previewHash: 'preview-hash',
  plan: {
    semanticVersion: 'strategy-monitoring-v1',
    strategyVersionId,
    strategyHash: 'strategy-hash',
    planHash: 'plan-hash',
    executionSymbol: symbol,
    evaluationTimeframe: '1d',
    rules: [
      {
        sourceKey: 'risk.0',
        sourceRiskIndex: 0,
        semanticVersion: 'strategy-monitoring-v1',
        kind: 'cost-stop',
        label: '成本止损',
        metric: 'priceToAverageCostReturn',
        operator: 'lte',
        threshold: '-0.08',
        evaluationTimeframe: '1d',
        costBasisPolicy: 'account-projection-average-cost-including-known-fees',
      },
    ],
    coverage: { riskTotal: 1, riskMapped: 1, items: [] },
  },
  evaluations: [],
  cycleMode: 'existingAndFuture' as const,
  context: {
    positionId: null,
    tradeId: null,
    openedAt: null,
    occurredAt: null,
    availableAt: null,
  },
};

const setup = (identityRows: StrategyRiskApplicationRow[] = []) => {
  const existingByIdempotency = vi.fn(async () => null);
  const findByIdentityForUpdate = vi.fn(async () => identityRows);
  const insertApplication = vi.fn(async (_transaction: unknown, input: { id: string }) =>
    row({ id: input.id }),
  );
  const store = {
    findByIdempotencyKey: existingByIdempotency,
    lockIdentity: vi.fn(async () => undefined),
    findByIdentityForUpdate,
    findByIdentity: vi.fn(async () => []),
    insertApplication,
    assertNoEnabledConflict: vi.fn(async () => undefined),
    createFrozenRules: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
    get: vi.fn(async (id: string) => row({ id })),
    getForUpdate: vi.fn(async (_transaction: unknown, id: string) => row({ id })),
    updateApplication: vi.fn(async () => row({ revision: 2 })),
    syncFrozenRuleState: vi.fn(async () => ({ count: 1 })),
    findEnabledConflict: vi.fn(async () => null),
    replacePlan: vi.fn(async () => row({ revision: 2 })),
    archiveFrozenRules: vi.fn(async () => ({ count: 1 })),
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({}),
    ),
    $queryRaw: vi.fn(async () => []),
    strategyVersion: { findUnique: vi.fn(async () => null) },
  };
  const service = new StrategyRiskApplicationService(
    prisma as never,
    {} as never,
    store as never,
    {} as never,
  );
  vi.spyOn(service, 'preview').mockResolvedValue(preview as never);
  return { service, store, prisma, insertApplication, findByIdentityForUpdate };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StrategyRiskApplicationService identity and conflict handling', () => {
  it('跨会话复用同源停用应用，通知变化不改变身份且不覆盖既有记录', async () => {
    const existing = row({
      notification: { enabled: false, cooldownMinutes: 5, severity: 'critical', channels: [] },
    });
    const { service, insertApplication } = setup([existing]);

    const result = await service.create({
      strategyVersionId,
      accountId,
      symbol,
      cycleMode: 'existingAndFuture',
      previewHash: preview.previewHash,
      idempotencyKey: 'request-2',
      enabled: true,
      notification: { enabled: true, cooldownMinutes: 900, severity: 'info', channels: ['feishu'] },
    });

    expect(result).toMatchObject({
      id: existing.id,
      enabled: false,
      notification: existing.notification,
      applicationResolution: {
        kind: 'reused',
        reason: 'same_identity',
        management: { applicationId: existing.id, actions: ['view', 'edit'] },
      },
    });
    expect(insertApplication).not.toHaveBeenCalled();
  });

  it('同源历史重复不自动选择，返回全部管理入口并阻止继续新增', async () => {
    const first = row();
    const second = row({
      id: secondApplicationId,
      updatedAt: new Date('2026-09-18T00:01:00.000Z'),
    });
    const { service, insertApplication } = setup([first, second]);

    const error = await service
      .create({
        strategyVersionId,
        accountId,
        symbol,
        cycleMode: 'existingAndFuture',
        previewHash: preview.previewHash,
        idempotencyKey: 'request-3',
        enabled: false,
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      errorCode: 'STRATEGY_RISK_APPLICATION_IDENTITY_AMBIGUOUS',
      applications: [
        { id: first.id, strategyVersionId, accountId, symbol, cycleMode: 'existingAndFuture' },
        { id: second.id, strategyVersionId, accountId, symbol, cycleMode: 'existingAndFuture' },
      ],
    });
    expect(insertApplication).not.toHaveBeenCalled();
  });

  it('源版本升级命中同源目标时返回目标管理入口而不覆盖源记录', async () => {
    const source = row({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    const target = row({
      id: secondApplicationId,
      strategyVersionId: '44444444-4444-4444-8444-444444444444',
    });
    const { service, store } = setup();
    store.get.mockResolvedValue(source);
    store.getForUpdate.mockResolvedValue(source);
    store.findByIdentityForUpdate.mockResolvedValue([target]);
    vi.spyOn(service, 'upgradePreview').mockResolvedValue({
      ...preview,
      currentRevision: source.revision,
      diff: [],
      targetApplication: {
        id: target.id,
        strategyVersionId: target.strategyVersionId,
        accountId: target.accountId,
        symbol: target.symbol,
        cycleMode: target.cycleMode,
        revision: target.revision,
        enabled: target.enabled,
        archivedAt: target.archivedAt,
      },
    } as never);

    const result = await service.upgrade(source.id, {
      expectedRevision: source.revision,
      targetStrategyVersionId: target.strategyVersionId,
      previewHash: preview.previewHash,
      idempotencyKey: 'upgrade-1',
    });

    expect(result).toMatchObject({
      id: target.id,
      applicationResolution: {
        kind: 'upgrade_target_exists',
        sourceApplicationId: source.id,
        management: { applicationId: target.id, actions: ['view', 'edit'] },
      },
    });
    expect(store.replacePlan).not.toHaveBeenCalled();
    expect(store.archiveFrozenRules).not.toHaveBeenCalled();
  });

  it('归档应用只读，重复进入不会自动恢复', async () => {
    const archived = row({ archivedAt: new Date('2026-09-17T00:00:00.000Z') });
    const { service, store } = setup();
    store.get.mockResolvedValue(archived);

    const error = await service
      .update(archived.id, { expectedRevision: archived.revision, enabled: true })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      errorCode: 'STRATEGY_RISK_APPLICATION_ARCHIVED',
      application: { id: archived.id, archivedAt: archived.archivedAt },
    });
    expect(store.updateApplication).not.toHaveBeenCalled();
  });
});
