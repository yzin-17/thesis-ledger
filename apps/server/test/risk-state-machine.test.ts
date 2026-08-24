import { describe, expect, it, vi } from 'vitest';
import { RiskService } from '../src/risk/risk.service.js';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';
const positionA = '33333333-3333-4333-8333-333333333333';
const positionB = '44444444-4444-4444-8444-444444444444';
const ruleA = '55555555-5555-4555-8555-555555555555';
const ruleB = '66666666-6666-4666-8666-666666666666';

type StoredState = Record<string, unknown>;
type TriggerStateWhere = {
  ruleId_targetKey_symbol_mode: {
    ruleId: string;
    targetKey: string;
    symbol: string;
    mode: string;
  };
};
type TriggerState = StoredState & {
  id: string;
  ruleId: string;
  targetKey: string;
  symbol: string;
  mode: string;
  positionId: string | null;
  ruleVersion: number;
  breachActive: boolean;
  activeEventId: string | null;
};

const keyOf = (ruleId: string, targetKey: string, symbol: string, mode: string) =>
  `${ruleId}:${targetKey}:${symbol}:${mode}`;

const createStateDelegate = () => {
  const states = new Map<string, TriggerState>();
  const findKey = (where: TriggerStateWhere) => {
    const value = where.ruleId_targetKey_symbol_mode;
    return keyOf(value.ruleId, value.targetKey, value.symbol, value.mode);
  };
  const delegate = {
    states,
    findUnique: vi.fn(
      async ({ where }: { where: TriggerStateWhere }) => states.get(findKey(where)) ?? null,
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: TriggerStateWhere;
        create: TriggerState;
        update: Partial<TriggerState>;
      }) => {
        const key = findKey(where);
        const current = states.get(key);
        const next = { ...(current ?? create), ...(current ? update : {}) };
        states.set(key, next as TriggerState);
        return next;
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: TriggerState & { ruleVersion: number; breachActive: boolean };
        data: Partial<TriggerState>;
      }) => {
        const key = keyOf(where.ruleId, where.targetKey, where.symbol, where.mode);
        const current = states.get(key);
        if (
          !current ||
          current.ruleVersion !== where.ruleVersion ||
          current.breachActive !== where.breachActive
        )
          return { count: 0 };
        states.set(key, { ...current, ...data } as TriggerState);
        return { count: 1 };
      },
    ),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<TriggerState> }) => {
        const current = [...states.values()].find((state) => state.id === where.id);
        if (!current) throw new Error('state not found');
        const next = { ...current, ...data } as TriggerState;
        states.set(keyOf(next.ruleId, next.targetKey, next.symbol, next.mode), next);
        return next;
      },
    ),
  };
  return delegate;
};

const createPositionStateDelegate = () => {
  const states = new Map<string, StoredState>();
  return {
    findMany: vi.fn(async () => [...states.values()]),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { accountId_symbol_mode: { accountId: string; symbol: string; mode: string } };
        create: StoredState;
        update: StoredState;
      }) => {
        const value = where.accountId_symbol_mode;
        const key = `${value.accountId}:${value.symbol}:${value.mode}`;
        const next = { ...(states.get(key) ?? create), ...update };
        states.set(key, next);
        return next;
      },
    ),
  };
};

const context = (price: number, positionId = positionA, marketHour = 1) => ({
  symbol: '600519.SH',
  accountId: accountA,
  positionId,
  quantity: 10,
  mode: 'actual' as const,
  price,
  costPrice: 100,
  positionUpdatedAt: '2026-08-20T00:00:00Z',
  marketTime: `2026-08-20T${String(marketHour).padStart(2, '0')}:00:00Z`,
  dataQuality: {},
});

const createService = (
  rules: StoredState[],
  options: { notifications?: { enqueue: ReturnType<typeof vi.fn> } } = {},
) => {
  let eventCount = 0;
  const events = new Map<string, StoredState & { id: string }>();
  const positionState = createPositionStateDelegate();
  const triggerState = createStateDelegate();
  const riskEvent = {
    create: vi.fn(async ({ data }: { data: StoredState }) => {
      await Promise.resolve();
      const dedupeKey = typeof data.dedupeKey === 'string' ? data.dedupeKey : null;
      if (dedupeKey && events.has(dedupeKey)) throw new Error('unique dedupeKey');
      const event = { id: `event-${++eventCount}`, ...data };
      if (dedupeKey) events.set(dedupeKey, event);
      return event;
    }),
    findUnique: vi.fn(
      async ({ where }: { where: { dedupeKey: string } }) => events.get(where.dedupeKey) ?? null,
    ),
  };
  const prisma = {
    riskRule: { findMany: vi.fn(async () => rules) },
    riskEvent,
    riskPositionState: positionState,
    riskRuleTriggerState: triggerState,
    notificationDelivery: {
      findMany: vi.fn(async (): Promise<Array<{ status: string }>> => []),
    },
  };
  const notifications = options.notifications ?? { enqueue: vi.fn(async () => undefined) };
  return {
    service: new RiskService(prisma as never, notifications as never),
    prisma,
    notifications,
  };
};

const trailingRule = (id: string, threshold: number) => ({
  id,
  version: 1,
  kind: 'trailing-stop',
  scope: 'security',
  severity: 'warning',
  threshold,
  enabled: true,
  needsRepair: false,
  repairReason: null,
  symbol: '600519.SH',
  accountId: accountA,
  sourcePlanId: null,
  parameters: null,
});

describe('风险扫描状态机', () => {
  it('补齐旧规则目标后清除待修复状态并允许启用', async () => {
    const stored = {
      id: ruleA,
      version: 1,
      kind: 'cost-stop',
      scope: 'security',
      severity: 'warning',
      threshold: 0.1,
      enabled: false,
      needsRepair: true,
      repairReason: 'account-binding-required',
      symbol: '600519.SH',
      accountId: null,
      sourcePlanId: null,
      condition: null,
      parameters: null,
      config: null,
      effectiveAt: new Date('2026-08-20T00:00:00Z'),
    };
    const update = vi.fn(async ({ data }: { data: StoredState }) => ({
      ...stored,
      ...data,
      version: 2,
    }));
    const prisma = {
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(prisma),
      riskRule: { findUniqueOrThrow: vi.fn(async () => stored), update },
      riskRuleAudit: { create: vi.fn(async () => undefined) },
      account: { findUnique: vi.fn(async () => ({ id: accountA, active: true })) },
      position: { findUnique: vi.fn(async () => ({ id: positionA, quantity: 10 })) },
    };
    const service = new RiskService(prisma as never, {} as never);

    await service.updateRule(ruleA, {
      symbol: '600519.SH',
      accountId: accountA,
      enabled: true,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabled: true,
          needsRepair: false,
          repairReason: null,
          accountId: accountA,
        }),
      }),
    );
  });

  it('同一标的跨账户按各自成本分别命中成本止损', async () => {
    const rules = [
      {
        ...trailingRule(ruleA, 0.1),
        kind: 'cost-stop',
        accountId: accountA,
      },
      {
        ...trailingRule(ruleB, 0.1),
        kind: 'cost-stop',
        accountId: accountB,
      },
    ];
    const { service, prisma } = createService(rules);
    await service.scan([
      { ...context(89, positionA, 1), mode: 'shadow', costPrice: 100 },
      {
        ...context(44, positionB, 1),
        accountId: accountB,
        mode: 'shadow',
        costPrice: 50,
      },
    ]);

    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(2);
    expect(
      prisma.riskEvent.create.mock.calls.map(
        (call: [{ data: StoredState }]) => call[0].data.accountId,
      ),
    ).toEqual([accountA, accountB]);
  });

  it('首次观察只建立峰值；下穿只触发一次，恢复后允许下一次下穿', async () => {
    const { service, prisma } = createService([trailingRule(ruleA, 0.1)]);

    expect((await service.scan([context(120, positionA, 1)])).results).toEqual([]);
    expect((await service.scan([context(105, positionA, 2)])).results).toHaveLength(1);
    expect((await service.scan([context(110, positionA, 3)])).results).toEqual([]);
    expect((await service.scan([context(120, positionA, 4)])).results).toEqual([]);
    expect((await service.scan([context(105, positionA, 5)])).results).toHaveLength(1);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(2);
  });

  it('首次观察忽略外部峰值提示，不因已有回撤直接触发', async () => {
    const { service, prisma } = createService([trailingRule(ruleA, 0.1)]);
    await service.scan([{ ...context(90), holdingPeak: 120 }]);
    expect(prisma.riskEvent.create).not.toHaveBeenCalled();
  });

  it('持仓生命周期变化会重置峰值，同一生命周期加减仓不重置', async () => {
    const { service, prisma } = createService([trailingRule(ruleA, 0.1)]);

    await service.scan([context(120, positionA, 1)]);
    await service.scan([context(105, positionA, 2)]);
    await service.scan([context(105, positionB, 3)]);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(1);
    await service.scan([context(90, positionB, 4)]);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(2);
  });

  it('多条移动止损共享峰值但分别维护下穿状态', async () => {
    const { service, prisma } = createService([trailingRule(ruleA, 0.1), trailingRule(ruleB, 0.2)]);

    await service.scan([context(120, positionA, 1)]);
    await service.scan([context(102, positionA, 2)]);
    await service.scan([context(90, positionA, 3)]);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(2);
    expect(
      prisma.riskEvent.create.mock.calls.map(
        (call: [{ data: StoredState }]) => call[0].data.ruleId,
      ),
    ).toEqual([ruleA, ruleB]);
  });

  it('并发扫描和重复 scanId 只创建一个风险事件', async () => {
    const { service, prisma } = createService([trailingRule(ruleA, 0.1)]);
    await service.scan([context(120, positionA, 1)]);
    const payload = { scanId: '77777777-7777-4777-8777-777777777777', security: [context(100)] };
    await Promise.all([service.scan(payload), service.scan(payload)]);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(1);
  });

  it('全局证券规则只生成一条事件并保留受影响账户列表', async () => {
    const rule = {
      id: ruleA,
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 100,
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId: null,
      sourcePlanId: null,
      parameters: null,
    };
    const { service, prisma } = createService([rule]);
    await service.scan([
      { ...context(90, positionA, 1) },
      { ...context(90, positionA, 1), accountId: accountB },
    ]);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(1);
    const data = prisma.riskEvent.create.mock.calls[0]![0].data;
    expect(data.accountId).toBeUndefined();
    expect((data.context as StoredState).affectedAccountIds).toEqual([accountA, accountB]);
  });

  it('允许陈旧数据时跳过价格规则，严格模式仍拒绝', async () => {
    const rule = {
      id: ruleA,
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 100,
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId: null,
      sourcePlanId: null,
      parameters: null,
    };
    const { service, prisma } = createService([rule]);
    const stale = { ...context(90), dataQuality: { marketData: 'stale' } };
    await service.scan({ allowStale: true, security: [stale] });
    expect(prisma.riskEvent.create).not.toHaveBeenCalled();
    await expect(service.scan([stale])).rejects.toThrow('陈旧');
  });

  it('通知失败后复用原事件重试，不创建第二条事件', async () => {
    const rule = {
      id: ruleA,
      version: 1,
      kind: 'price-below',
      scope: 'security',
      severity: 'warning',
      threshold: 100,
      enabled: true,
      needsRepair: false,
      repairReason: null,
      symbol: '600519.SH',
      accountId: null,
      sourcePlanId: null,
      parameters: null,
    };
    const notifications = { enqueue: vi.fn() };
    notifications.enqueue
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce([]);
    const { service, prisma } = createService([rule], { notifications });
    prisma.notificationDelivery.findMany.mockResolvedValue([{ status: 'failed' }]);
    const payload = {
      scanId: '88888888-8888-4888-8888-888888888888',
      security: [context(90)],
    };

    const first = await service.scan(payload);
    const second = await service.scan({
      ...payload,
      scanId: '99999999-9999-4999-8999-999999999999',
    });

    expect(first.results[0]?.error).toContain('通知排队失败');
    expect(second.results).toEqual([{ ruleId: ruleA, eventId: 'event-1' }]);
    expect(prisma.riskEvent.create).toHaveBeenCalledTimes(1);
    expect(notifications.enqueue).toHaveBeenCalledTimes(2);
  });
});
