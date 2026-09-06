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
      asset: {
        findMany: vi.fn(async () => [{ symbol: '600519.SH', name: '贵州茅台' }]),
      },
      account: {
        findMany: vi.fn(async () => [{ id: accountA, name: '同花顺' }]),
      },
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
          message: '600519.SH · 贵州茅台 · 同花顺 · 成本止损 10% 已触发',
          context: expect.objectContaining({
            accountName: '同花顺',
            assetName: '贵州茅台',
            positionId: positionA,
            quantity: 10,
            positionUpdatedAt: '2025-01-01T00:00:00Z',
          }),
        }),
      }),
    );
  });

  it('账户范围事件使用账户名称而不是内部账户标识', async () => {
    const rule = {
      id: 'account-rule',
      version: 1,
      kind: 'drawdown',
      scope: 'account',
      severity: 'warning',
      threshold: 0.1,
      enabled: true,
      accountId: accountA,
    };
    const riskEvent = { create: vi.fn(async () => ({ id: 'account-event' })) };
    const prisma = {
      riskRule: { findMany: vi.fn(async () => [rule]) },
      riskEvent,
      account: {
        findMany: vi.fn(async () => [{ id: accountA, name: '同花顺' }]),
      },
    };

    await new RiskService(prisma as never, { enqueue: vi.fn(async () => undefined) } as never).scan(
      {
        accounts: [
          {
            accountId: accountA,
            mode: 'actual',
            portfolioValues: [100, 80],
            marketTime: '2025-01-01T01:00:00Z',
            dataQuality: {},
          },
        ],
      },
    );

    expect(riskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: '同花顺 · 回撤 0.1 已触发',
          context: expect.objectContaining({ accountName: '同花顺' }),
        }),
      }),
    );
  });

  it('名称查询失败时仍继续执行风险扫描', async () => {
    const rule = {
      id: 'label-fallback-rule',
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 100,
      enabled: true,
      symbol: '600519.SH',
    };
    const riskEvent = { create: vi.fn(async () => ({ id: 'label-fallback-event' })) };
    const prisma = {
      riskRule: { findMany: vi.fn(async () => [rule]) },
      riskEvent,
      asset: { findMany: vi.fn(async () => Promise.reject(new Error('asset db down'))) },
    };

    await expect(
      new RiskService(prisma as never, { enqueue: vi.fn(async () => undefined) } as never).scan([
        {
          symbol: '600519.SH',
          price: 99,
          marketTime: '2025-01-01T01:00:00Z',
          dataQuality: {},
        },
      ]),
    ).resolves.toMatchObject({ results: [{ ruleId: rule.id, eventId: 'label-fallback-event' }] });
  });

  it('规则列表附带 Asset 标的名', async () => {
    const rule = {
      id: 'rule-name',
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      enabled: true,
      symbol: '600519.SH',
      accountId: null,
      archivedAt: null,
    };
    const prisma = {
      riskRule: { findMany: vi.fn(async () => [rule]) },
      asset: { findMany: vi.fn(async () => [{ symbol: '600519.SH', name: '贵州茅台' }]) },
    };
    const rules = await new RiskService(prisma as never, {} as never).listRules();
    expect(rules).toEqual([expect.objectContaining({ symbol: '600519.SH', assetName: '贵州茅台' })]);
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { symbol: { in: ['600519.SH'] } } }),
    );
  });

  it('归档写入 archivedAt、记录 archive 审计，并从默认列表排除', async () => {
    const stored = {
      id: 'rule-archive',
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      enabled: true,
      symbol: '600519.SH',
      accountId: null,
      archivedAt: null,
      effectiveAt: new Date('2025-01-01T00:00:00Z'),
    };
    const transaction = {
      riskRule: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(async () => ({
          ...stored,
          version: 2,
          enabled: false,
          archivedAt: new Date('2026-09-05T00:00:00Z'),
        })),
      },
      riskRuleAudit: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
      riskRule: { findMany: vi.fn(async () => []) },
    };
    const service = new RiskService(prisma as never, {} as never);
    const archived = await service.archiveRule('rule-archive');
    expect(archived).toMatchObject({ enabled: false, archivedAt: expect.any(Date) });
    expect(transaction.riskRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: false, archivedAt: expect.any(Date) }),
      }),
    );
    expect(transaction.riskRuleAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'archive', actor: 'local-user' }),
      }),
    );

    await service.listRules();
    expect(prisma.riskRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: null } }),
    );
    await service.listRules(true);
    expect(prisma.riskRule.findMany).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    );
  });

  it('恢复清空 archivedAt 并记录 restore 审计，未归档规则不可恢复', async () => {
    const stored = {
      id: 'rule-restore',
      version: 2,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      enabled: false,
      symbol: '600519.SH',
      accountId: null,
      archivedAt: new Date('2026-09-05T00:00:00Z') as Date | null,
      effectiveAt: new Date('2025-01-01T00:00:00Z'),
    };
    const transaction = {
      riskRule: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(async () => ({ ...stored, version: 3, archivedAt: null })),
      },
      riskRuleAudit: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    const service = new RiskService(prisma as never, {} as never);
    const restored = await service.restoreRule('rule-restore');
    expect(restored).toMatchObject({ version: 3, archivedAt: null });
    expect(transaction.riskRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archivedAt: null }) }),
    );
    expect(transaction.riskRuleAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'restore' }),
      }),
    );

    const notArchived = { ...stored, archivedAt: null };
    transaction.riskRule.findUniqueOrThrow.mockImplementation(async () => notArchived);
    await expect(service.restoreRule('rule-restore')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('未归档'),
    });
  });

  it('已归档规则禁止编辑更新', async () => {
    const stored = {
      id: 'rule-archived-edit',
      version: 2,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 10,
      enabled: false,
      symbol: '600519.SH',
      accountId: null,
      archivedAt: new Date('2026-09-05T00:00:00Z'),
      condition: null,
      parameters: null,
      config: null,
      effectiveAt: new Date('2025-01-01T00:00:00Z'),
    };
    const transaction = {
      riskRule: {
        findUniqueOrThrow: vi.fn(async () => stored),
        update: vi.fn(),
      },
      riskRuleAudit: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: (operation: (client: typeof transaction) => unknown) => operation(transaction),
    };
    await expect(
      new RiskService(prisma as never, {} as never).updateRule('rule-archived-edit', {
        threshold: 20,
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('归档') });
    expect(transaction.riskRule.update).not.toHaveBeenCalled();
  });
});
