import { describe, expect, it, vi } from 'vitest';
import type { DesktopRequestClient } from '../src/features/shared/request.js';
import {
  createStrategyRiskApplication,
  deleteStrategyRiskApplication,
  fetchStrategyRiskApplications,
  previewStrategyRiskApplication,
  type StrategyRiskApplication,
} from '../src/features/strategy/strategy-optimization.api.js';
import {
  enabledRiskConflict,
  matchingRiskApplications,
  parseCooldownMinutes,
  riskApplicationFingerprint,
  riskCenterApplicationPath,
} from '../src/features/strategy/strategy-risk-application.model.js';

const application = (overrides: Partial<StrategyRiskApplication> = {}): StrategyRiskApplication =>
  ({
    id: 'application-1',
    strategyVersionId: 'version-1',
    accountId: 'account-1',
    symbol: '510300.SH',
    revision: 1,
    planHash: 'plan-1',
    plan: {
      semanticVersion: 'strategy-monitoring-v1',
      strategyHash: 'strategy-1',
      planHash: 'plan-1',
      executionSymbol: '510300.SH',
      evaluationTimeframe: '1d',
      rules: [],
      coverage: { riskTotal: 0, riskMapped: 0, items: [] },
    },
    cycleMode: 'existingAndFuture',
    enabled: false,
    notification: {
      enabled: true,
      cooldownMinutes: 60,
      severity: 'warning',
      channels: ['feishu'],
    },
    coverage: { riskTotal: 0, riskMapped: 0, items: [] },
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  }) satisfies StrategyRiskApplication;

describe('策略风险应用工作页', () => {
  it('同源身份不包含通知配置，并保留全部历史重复供明确选择', () => {
    const applications = [
      application({ id: 'application-1' }),
      application({
        id: 'application-2',
        notification: { enabled: false, cooldownMinutes: 5, severity: 'critical', channels: [] },
      }),
      application({ id: 'archived', archivedAt: '2026-09-18T01:00:00.000Z' }),
    ];
    expect(
      matchingRiskApplications(applications, {
        strategyVersionId: 'version-1',
        accountId: 'account-1',
        symbol: '510300.SH',
        cycleMode: 'existingAndFuture',
      }).map((item) => item.id),
    ).toEqual(['application-1', 'application-2']);
  });

  it('同账户标的的其他启用应用形成冲突，但同源记录不与自己冲突', () => {
    const applications = [
      application({ id: 'same', enabled: true }),
      application({ id: 'other', strategyVersionId: 'version-2', enabled: true }),
    ];
    expect(
      enabledRiskConflict(applications, {
        accountId: 'account-1',
        symbol: '510300.SH',
        matchingIds: new Set(['same']),
      })?.id,
    ).toBe('other');
  });

  it('配置指纹和通知冷却校验保持稳定', () => {
    expect(
      riskApplicationFingerprint({
        strategyVersionId: 'version-1',
        accountId: 'account-1',
        symbol: '510300.SH',
        cycleMode: 'existingAndFuture',
      }),
    ).not.toBe(
      riskApplicationFingerprint({
        strategyVersionId: 'version-1',
        accountId: 'account-2',
        symbol: '510300.SH',
        cycleMode: 'existingAndFuture',
      }),
    );
    expect(parseCooldownMinutes('60')).toBe(60);
    expect(parseCooldownMinutes('1.5')).toBeNull();
    expect(parseCooldownMinutes('10081')).toBeNull();
  });

  it('预览和保存消费同一明确版本、账户、标的与生效范围', async () => {
    const request = vi.fn().mockResolvedValue({});
    const client = { request } as unknown as DesktopRequestClient;
    const identity = {
      strategyVersionId: 'version-1',
      accountId: 'account-1',
      symbol: '510300.SH',
      cycleMode: 'existingAndFuture' as const,
    };
    await previewStrategyRiskApplication(identity, client);
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/strategy-optimization/risk-applications/preview',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(identity) }),
    );
    await createStrategyRiskApplication(
      {
        ...identity,
        previewHash: 'preview-1',
        idempotencyKey: 'intent-1',
        enabled: false,
        notification: {
          enabled: true,
          cooldownMinutes: 60,
          severity: 'warning',
          channels: ['feishu'],
        },
      },
      client,
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/strategy-optimization/risk-applications',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"idempotencyKey":"intent-1"'),
      }),
    );
  });

  it('风险应用列表隐藏已删除记录，删除请求携带预期修订', async () => {
    const request = vi.fn().mockResolvedValue({});
    const client = { request } as unknown as DesktopRequestClient;
    await fetchStrategyRiskApplications(undefined, undefined, client);
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/strategy-optimization/risk-applications?includeArchived=false',
      { cache: 'no-store' },
    );
    await deleteStrategyRiskApplication('application/id', 3, client);
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/strategy-optimization/risk-applications/application%2Fid',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ expectedRevision: 3 }),
      }),
    );
  });

  it('成功后使用可恢复的风险中心应用定位地址', () => {
    expect(riskCenterApplicationPath('application/id')).toBe(
      '/risk-center?tab=strategy-applications&applicationId=application%2Fid',
    );
  });
});
