import { describe, expect, it, vi } from 'vitest';
import { riskApplicationNotificationSchema } from '@thesis-ledger/schemas';
import {
  strategyRiskNotification,
  strategyRiskNotificationForPlan,
} from '../../src/risk/strategy-risk-notification.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import {
  compileRiskApplicationPlan,
  validateRiskRuleOverrides,
} from '../../src/strategy-optimization/strategy-risk-plan.js';
import { createStrategyFixture } from '../strategy-optimization/strategy-optimization-postgres-fixtures.js';
import { StrategyRiskRuntimeService } from '../../src/risk/strategy-risk-runtime.service.js';

const strategy = createStrategyFixture('600519.SH', '逐条通知')('0.03');
strategy.risk.push({ type: 'maxHoldingPeriod', periods: 10 });
const plan = compileRiskApplicationPlan(strategy, 'version');
const stop = plan.rules[0]!,
  holding = plan.rules[1]!;
const notification = {
  enabled: true,
  severity: 'warning' as const,
  cooldownMinutes: 60,
  channels: ['feishu' as const],
  ruleOverrides: { [stop.sourceKey]: { severity: 'error' as const, cooldownMinutes: 0 } },
};

describe('单条策略风险规则通知', () => {
  it('分别继承字段，保留零值并拒绝非法输入和未知规则', () => {
    expect(strategyRiskNotification(notification, stop.sourceKey)).toMatchObject({
      severity: 'error',
      cooldownMinutes: 0,
    });
    expect(strategyRiskNotification(notification, holding.sourceKey)).toMatchObject({
      severity: 'warning',
      cooldownMinutes: 60,
    });
    expect(
      strategyRiskNotification({ ruleOverrides: { a: { severity: 'info' } } }, 'a'),
    ).toMatchObject({ severity: 'info', cooldownMinutes: 30 });
    for (const cooldownMinutes of [-1, 1.5, 10081, '5', null]) {
      expect(
        riskApplicationNotificationSchema.safeParse({ ruleOverrides: { a: { cooldownMinutes } } })
          .success,
      ).toBe(false);
    }
    expect(
      riskApplicationNotificationSchema.safeParse({ ruleOverrides: { a: { severity: 'urgent' } } })
        .success,
    ).toBe(false);
    expect(() =>
      validateRiskRuleOverrides(
        { ...notification, ruleOverrides: { unknown: { severity: 'info' } } },
        plan,
      ),
    ).toThrow('不属于当前应用');
    expect(strategyRiskNotificationForPlan(notification, [holding]).ruleOverrides).toEqual({});
    expect(strategyRiskNotificationForPlan(notification, [stop]).ruleOverrides).toEqual(
      notification.ruleOverrides,
    );
  });

  it('冻结规则分别保存严重级别，更新默认值时仍保留覆盖并支持清除', async () => {
    const create = vi.fn(async () => ({ id: 'rule', version: 1 }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = { riskRule: { create, updateMany }, riskRuleAudit: { create: vi.fn() } };
    const store = new StrategyRiskApplicationStoreService({} as never);
    await store.createFrozenRules(tx as never, {
      applicationId: 'app',
      accountId: 'account',
      symbol: '600519.SH',
      revision: 1,
      enabled: true,
      notification,
      plan,
    });
    expect(
      create.mock.calls.map(
        (call) => (call as unknown as [{ data: { severity: string } }])[0].data.severity,
      ),
    ).toEqual(['error', 'warning']);
    await store.syncFrozenRuleState(tx as never, 'app', {
      enabled: true,
      notification,
      plan,
      revision: 2,
      enabledChanged: false,
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'error', parameters: expect.objectContaining({ notification: expect.objectContaining({ cooldownMinutes: 0 }) }) }),
        where: expect.objectContaining({ config: { path: ['sourceKey'], equals: stop.sourceKey } }),
      }),
    );
    updateMany.mockClear();
    await store.syncFrozenRuleState(tx as never, 'app', {
      enabled: true,
      notification: { ...notification, severity: 'info', ruleOverrides: {} },
      plan,
      revision: 3,
      enabledChanged: false,
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: 'info' }) }),
    );
  });

  it('同一应用两条规则的实际评估事件与通知策略分别取值', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [
        {
          id: 'app',
          revision: 1,
          enabled: true,
          accountId: 'account',
          symbol: '600519.SH',
          cycleMode: 'existingAndFuture',
          notification,
        },
      ]),
      asset: { findUnique: vi.fn(async () => ({ assetType: 'stock', market: 'CN' })) },
    };
    const contexts = {
      load: vi.fn(async () => ({
        context: { quantity: '10', averageCost: '100', price: '90', holdingPeriods: 15 },
      })),
    };
    const runtime = new StrategyRiskRuntimeService(prisma as never, contexts as never);
    const evaluate = (rule: typeof stop) =>
      runtime.evaluateStoredRule({
        id: rule.sourceKey,
        version: 1,
        kind: rule.kind,
        scope: 'security',
        severity: 'warning',
        threshold: rule.threshold,
        enabled: true,
        accountId: 'account',
        symbol: '600519.SH',
        sourcePlanId: 'app',
        parameters: { applicationRevision: 1 },
        config: rule,
      } as never);
    const a = await evaluate(stop),
      b = await evaluate(holding);
    expect(a.event).toMatchObject({ triggered: true, severity: 'error' });
    expect(a.notification).toMatchObject({
      cooldownMinutes: 0,
      severity: 'error',
      channels: ['feishu'],
    });
    expect(b.event).toMatchObject({ triggered: true, severity: 'warning' });
    expect(b.notification.cooldownMinutes).toBe(60);
  });
});
