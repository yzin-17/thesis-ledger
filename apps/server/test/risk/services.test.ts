import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../../src/risk/risk.service.js';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';
const positionA = '33333333-3333-4333-8333-333333333333';

describe('风险事件与通知解耦', () => {
  it('规则修改递增版本并记录启停审计', async () => {
    const stored = {
      id: 'rule-1',
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      enabled: true,
      symbol: '600519.SH',
      accountId: null,
      condition: null,
      parameters: null,
      config: null,
      effectiveAt: new Date('2025-01-01T00:00:00Z'),
    };
    const transaction = {
      riskRule: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(async () => ({ ...stored, version: 2, enabled: false })),
      },
      riskRuleAudit: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const updated = await new RiskService(prisma as never, {} as never).updateRule('rule-1', {
      enabled: false,
    });
    expect(updated).toMatchObject({ version: 2, enabled: false });
    expect(transaction.riskRuleAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ruleId: 'rule-1',
        ruleVersion: 2,
        action: 'disable',
        actor: 'local-user',
      }),
    });
  });
  it('通知排队失败时仍保留已写入的 RiskEvent 和 ruleVersion', async () => {
    const event = { id: 'event-1' };
    const prisma = {
      riskRule: {
        findMany: vi.fn(async () => [
          {
            id: 'rule-1',
            version: 3,
            kind: 'price-below',
            scope: 'security',
            severity: 'warning',
            threshold: 10,
            enabled: true,
            symbol: '600519.SH',
            accountId: null,
          },
        ]),
      },
      riskEvent: { create: vi.fn(async () => event) },
    };
    const notifications = { enqueue: vi.fn(async () => Promise.reject(new Error('redis down'))) };
    const result = await new RiskService(prisma as never, notifications as never).scan([
      {
        symbol: '600519.SH',
        price: 9,
        marketTime: '2025-01-01T01:00:00Z',
        dataQuality: { quote: 'fresh' },
      },
    ]);
    expect(prisma.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleVersion: 3, context: expect.any(Object) }),
      }),
    );
    expect(result.results).toEqual([
      expect.objectContaining({
        ruleId: 'rule-1',
        eventId: 'event-1',
        error: expect.stringMatching('通知'),
      }),
    ]);
  });
  it('影子风险事件保留审计但默认不发送通知', async () => {
    const prisma = {
      riskRule: {
        findMany: vi.fn(async () => [
          {
            id: 'shadow-rule',
            version: 1,
            kind: 'price-below',
            scope: 'security',
            severity: 'warning',
            threshold: 10,
            enabled: true,
            symbol: '600519.SH',
            accountId: null,
          },
        ]),
      },
      riskEvent: {
        create: vi.fn(async () => ({ id: 'shadow-event' })),
      },
    };
    const notifications = { enqueue: vi.fn(async () => []) };
    const result = await new RiskService(prisma as never, notifications as never).scan([
      {
        symbol: '600519.SH',
        price: 9,
        mode: 'shadow',
        marketTime: '2025-01-01T01:00:00Z',
        dataQuality: { quote: 'fresh' },
      },
    ]);
    expect(prisma.riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({ mode: 'shadow' }),
        }),
      }),
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ ruleId: 'shadow-rule', eventId: 'shadow-event' }]);
  });

  it('创建账户持仓规则时拒绝不存在的当前持仓', async () => {
    const transaction = {
      account: { findUnique: vi.fn(async () => ({ id: accountA, active: true })) },
      position: { findUnique: vi.fn(async () => null) },
      riskRule: { create: vi.fn() },
      riskRuleAudit: { create: vi.fn() },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new RiskService(prisma as never, {} as never);

    await expect(
      service.createRule({
        kind: 'cost-stop',
        scope: 'security',
        severity: 'warning',
        threshold: 0.1,
        enabled: true,
        accountId: accountA,
        symbol: '600519.SH',
      }),
    ).rejects.toThrow('当前持仓');
    expect(transaction.riskRule.create).not.toHaveBeenCalled();
  });

  it('账户停用时拒绝创建账户绑定规则', async () => {
    const transaction = {
      account: { findUnique: vi.fn(async () => ({ id: accountA, active: false })) },
      position: { findUnique: vi.fn() },
      riskRule: { create: vi.fn() },
      riskRuleAudit: { create: vi.fn() },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };

    await expect(
      new RiskService(prisma as never, {} as never).createRule({
        kind: 'trailing-stop',
        scope: 'security',
        severity: 'warning',
        threshold: 0.1,
        enabled: true,
        accountId: accountA,
        symbol: '600519.SH',
      }),
    ).rejects.toThrow('已停用');
  });

  it('清仓后的既有规则仍可编辑阈值，但改绑目标必须重新验证持仓', async () => {
    const stored = {
      id: 'rule-cleared',
      version: 1,
      kind: 'cost-stop',
      scope: 'security',
      severity: 'warning',
      threshold: 0.1,
      enabled: false,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId: accountA,
      sourcePlanId: null,
      condition: null,
      parameters: null,
      config: null,
      effectiveAt: new Date('2025-01-01T00:00:00Z'),
    };
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...stored,
      ...data,
      version: 2,
    }));
    const transaction = {
      riskRule: { findUniqueOrThrow: vi.fn(async () => stored), update },
      riskRuleAudit: { create: vi.fn(async () => undefined) },
      account: { findUnique: vi.fn(async () => ({ id: accountB, active: true })) },
      position: { findUnique: vi.fn(async () => null) },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new RiskService(prisma as never, {} as never);

    await expect(service.updateRule(stored.id, { threshold: 0.2 })).resolves.toMatchObject({
      version: 2,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enabled: false }) }),
    );
    await expect(service.updateRule(stored.id, { accountId: accountB })).rejects.toThrow(
      '当前持仓',
    );
    expect(transaction.position.findUnique).toHaveBeenCalledWith({
      where: { accountId_symbol: { accountId: accountB, symbol: '600519.SH' } },
      select: { id: true, quantity: true },
    });
  });

  it('账户成本类事件保留 positionId 和持仓更新时间上下文', async () => {
    const rule = {
      id: 'rule-context',
      version: 1,
      kind: 'cost-stop',
      scope: 'security',
      severity: 'warning',
      threshold: 0.1,
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId: accountA,
      parameters: null,
    };
    const riskEvent = { create: vi.fn(async () => ({ id: 'event-context' })) };
    const prisma = {
      riskRule: { findMany: vi.fn(async () => [rule]) },
      riskEvent,
    };
    const result = await new RiskService(
      prisma as never,
      {
        enqueue: vi.fn(async () => undefined),
      } as never,
    ).scan([
      {
        symbol: '600519.SH',
        accountId: accountA,
        positionId: positionA,
        quantity: 10,
        costPrice: 100,
        price: 89,
        positionUpdatedAt: '2025-01-01T00:00:00Z',
        marketTime: '2025-01-01T01:00:00Z',
        dataQuality: {},
      },
    ]);
    expect(result.results).toEqual([{ ruleId: rule.id, eventId: 'event-context' }]);
    expect(riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          context: expect.objectContaining({
            positionId: positionA,
            quantity: 10,
            positionUpdatedAt: '2025-01-01T00:00:00Z',
          }),
        }),
      }),
    );
  });
});
