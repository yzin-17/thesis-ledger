import { describe, expect, it, vi } from 'vitest';
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';

const applicationId = '22222222-2222-4222-8222-222222222222';

describe('StrategyRiskApplicationService update', () => {
  it('仅修改通知配置时不会把 RiskRule.version 当作判断语义升级', async () => {
    const current = {
      id: applicationId,
      strategyVersionId: '33333333-3333-4333-8333-333333333333',
      accountId: '11111111-1111-4111-8111-111111111111',
      symbol: '600519.SH',
      revision: 1,
      semanticVersion: 'strategy-monitoring-v1',
      planHash: 'plan',
      plan: { rules: [] },
      cycleMode: 'existingAndFuture',
      cycleAnchor: null,
      enabled: true,
      notification: { enabled: true, cooldownMinutes: 60 },
      coverage: {},
      ownerKey: 'local-user',
      idempotencyKey: 'idem',
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    };
    const updated = {
      ...current,
      revision: 2,
      notification: { enabled: false, cooldownMinutes: 30 },
    };
    const store = {
      get: vi.fn(async () => current),
      updateApplication: vi.fn(async () => updated),
      syncFrozenRuleState: vi.fn(async () => ({ count: 2 })),
      audit: vi.fn(async () => 1),
      assertNoEnabledConflict: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback({})),
    };
    const service = new StrategyRiskApplicationService(
      prisma as never,
      {} as never,
      store as never,
      {} as never,
    );

    await expect(
      service.update(applicationId, {
        expectedRevision: 1,
        notification: { enabled: false, cooldownMinutes: 30 },
      }),
    ).resolves.toEqual(updated);

    expect(store.syncFrozenRuleState).toHaveBeenCalledWith(
      expect.anything(),
      applicationId,
      { enabled: true, revision: 2, enabledChanged: false },
    );
  });
});
