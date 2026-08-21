import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../../src/risk/risk.service.js';

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
});
