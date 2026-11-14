import { describe, expect, it, vi } from 'vitest';
import { RiskRuleService } from '../../src/risk/risk-rule.service.js';
import { enqueueRiskNotificationIfNeeded } from '../../src/risk/risk-notification.js';

const id = '22222222-2222-4222-8222-222222222222';
const input = {
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: 10,
  symbol: '600519.SH',
  enabled: true,
};
function fixture(sourcePlanId: string | null = null) {
  let row = {
    ...input,
    id,
    version: 1,
    accountId: null,
    sourcePlanId,
    archivedAt: null,
    effectiveAt: new Date(),
    condition: null,
    config: null,
    parameters: {
      retained: '保留',
      notification: { enabled: true, cooldownMinutes: 120, providers: [] as string[] },
    },
  };
  const tx = {
    riskRule: {
      create: vi.fn(
        async ({ data }: { data: Record<string, unknown> }) =>
          (row = { ...row, ...data } as typeof row),
      ),
      update: vi.fn(
        async ({ data }: { data: Record<string, unknown> }) =>
          (row = { ...row, ...data, version: row.version + 1 } as typeof row),
      ),
      findUniqueOrThrow: vi.fn(async () => row),
      findMany: vi.fn(async () => [row]),
    },
    riskRuleAudit: { create: vi.fn() },
  };
  const prisma = {
    ...tx,
    providerConfig: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (run: (db: typeof tx) => unknown) => run(tx)),
  };
  const service = new RiskRuleService(
    prisma as never,
    { resolve: vi.fn(async () => ({ name: () => '样本' })) } as never,
  );
  return { service, prisma, tx };
}
describe('普通规则通知配置', () => {
  it('策略生成规则由所属应用管理，不能写入无效的独立通知覆盖', async () => {
    const { service, tx } = fixture('application');
    await expect(
      service.updateRule(id, { notification: { cooldownMinutes: 30, providers: [] } }),
    ).rejects.toThrow('所属策略应用');
    expect(tx.riskRule.update).not.toHaveBeenCalled();
  });
  it('创建通知参数与审计，编辑冷却不丢失其他参数，读取回显一致', async () => {
    const { service, tx } = fixture();
    const notification = { enabled: true, cooldownMinutes: 0, providers: [] };
    const created = await service.createRule({
      ...input,
      parameters: { retained: '保留' },
      notification,
    });
    expect(created.notification).toEqual(notification);
    expect(created.parameters).toEqual({ retained: '保留', notification });
    await service.updateRule(id, { threshold: 12 });
    expect((await service.getRule(id)).notification).toEqual(notification);
    await service.updateRule(id, {
      notification: { enabled: false, cooldownMinutes: 90, providers: [] },
    });
    expect((await service.listRules())[0]).toMatchObject({
      notification: { enabled: false, cooldownMinutes: 90 },
      parameters: { retained: '保留' },
    });
    expect(tx.riskRuleAudit.create).toHaveBeenCalledTimes(3);
  });
  it('无效提供方在写入前拒绝，不回退到其他配置', async () => {
    const { service, tx } = fixture();
    await expect(
      service.createRule({ ...input, notification: { providers: ['missing'] } }),
    ).rejects.toThrow('部分通知提供方当前不可用');
    expect(tx.riskRule.create).not.toHaveBeenCalled();
  });
  it('实际投递从单条规则读取零冷却和提供方，关闭与空选择均不入队', async () => {
    const enqueue = vi.fn();
    const notifications = { enqueue, subjectDeliveryStatus: vi.fn() };
    const base = {
      eventId: id,
      severity: 'warning' as const,
      message: '样本',
      traceId: 'trace',
      mode: 'actual' as const,
      created: true,
    };
    await enqueueRiskNotificationIfNeeded(notifications as never, {
      ...base,
      rule: {
        id,
        kind: 'price-below',
        threshold: 10,
        parameters: { notification: { enabled: true, cooldownMinutes: 0, providers: ['备用'] } },
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cooldownMinutes: 0, providers: ['备用'] }),
    );
    enqueue.mockClear();
    for (const notification of [
      { enabled: false, providers: ['备用'] },
      { enabled: true, providers: [] },
    ])
      await enqueueRiskNotificationIfNeeded(notifications as never, {
        ...base,
        rule: { id, kind: 'price-below', threshold: 10, parameters: { notification } },
      });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
