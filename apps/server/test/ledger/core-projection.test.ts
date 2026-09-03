import { describe, expect, it, vi } from 'vitest';
import {
  projectCashBalances,
  projectCashMaterialization,
  type StoredCashEvent,
} from '../../src/ledger/cash-projection.js';
import { rebuildCoreProjections } from '../../src/ledger/core-projection.js';
import { storedV2Event } from './ledger-event-fixtures.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const strategyId = '22222222-2222-4222-8222-222222222222';

const execution = (input: {
  id: string;
  factId: string;
  revision: number;
  type: 'BUY_EXECUTION' | 'SELL_EXECUTION';
  quantity: string;
  price: string;
  occurredAt: string;
  expectedAt?: string;
  settledAt?: string;
  charges?: Array<{
    category: 'COMMISSION' | 'TAX';
    amount: string;
    currency: string;
  }>;
}): StoredCashEvent => ({
  id: input.id,
  accountId,
  type: input.type,
  occurredAt: new Date(input.occurredAt),
  createdAt: new Date(input.occurredAt),
  factId: input.factId,
  ledgerRevision: BigInt(input.revision),
  timePrecision: 'INSTANT',
  sourceTimezone: 'UTC',
  economicOrderKey: `execution:${input.revision}`,
  recordedAt: new Date(input.occurredAt),
  payloadVersion: 1,
  payload: {
    symbol: 'AAPL.US',
    quantity: input.quantity,
    price: input.price,
    currency: 'USD',
    ...(input.expectedAt === undefined ? {} : { expectedAt: input.expectedAt }),
    ...(input.settledAt === undefined ? {} : { settledAt: input.settledAt }),
    capabilityVerification: 'VERIFIED',
    charges: input.charges ?? [],
  },
  sourceCategory: 'MANUAL',
  sourceChannel: 'test',
  externalId: null,
  actorId: 'test',
  revisionAction: 'CREATE',
  supersedesEventId: null,
  reason: null,
});

const cashFlow = (input: {
  id: string;
  amount: string;
  occurredAt: string;
  expectedAt?: string;
  settledAt?: string;
}): StoredCashEvent =>
  storedV2Event({
    id: input.id,
    accountId,
    type: 'CASH_FLOW',
    occurredAt: input.occurredAt,
    payload: {
      direction: 'INFLOW',
      category: 'DEPOSIT',
      amount: input.amount,
      currency: 'CNY',
      ...(input.expectedAt === undefined ? {} : { expectedAt: input.expectedAt }),
      ...(input.settledAt === undefined ? {} : { settledAt: input.settledAt }),
    },
  }) as StoredCashEvent;

const cashSnapshot = (input: { id: string; amount: string; capturedAt: string }): StoredCashEvent =>
  storedV2Event({
    id: input.id,
    accountId,
    type: 'CASH_BALANCE_OBSERVATION',
    occurredAt: input.capturedAt,
    payload: { currency: 'CNY', amount: input.amount, capturedAt: input.capturedAt },
  }) as StoredCashEvent;

const fakeCoreClient = (events: StoredCashEvent[]) => ({
  account: {
    findUnique: vi.fn(async () => ({
      id: accountId,
      mode: 'actual',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })),
  },
  accountCostStrategyVersion: {
    findMany: vi.fn(async () => [
      {
        id: strategyId,
        accountId,
        revision: 1,
        method: 'AVG',
        effectiveAt: new Date('2025-01-01T00:00:00.000Z'),
        reason: 'test',
        actorId: 'test',
      },
    ]),
    create: vi.fn(),
  },
  accountLedgerState: {
    findUnique: vi.fn(),
  },
  ledgerEvent: {
    findMany: vi.fn(async () => events),
  },
  position: {
    findMany: vi.fn(async () => []),
    update: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  },
  trade: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  tradeEntryLeg: { create: vi.fn() },
  tradeBaselineComponent: { create: vi.fn() },
  tradeCorporateActionAdjustment: { create: vi.fn() },
  tradeCloseSlice: { create: vi.fn() },
  tradeCloseAllocation: { create: vi.fn() },
  tradeDividendAttribution: { create: vi.fn() },
  tradeEvidenceSource: { create: vi.fn() },
  cashBalance: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  cashSettlement: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
});

describe('core ledger projection', () => {
  it('兼容旧迁移产生的无 transfer 元数据现金划转，并保留进出金额效果', () => {
    const legacyEvent = (input: {
      id: string;
      accountId: string;
      factId: string;
      direction: 'INFLOW' | 'OUTFLOW';
      amount: string;
    }): StoredCashEvent => ({
      id: input.id,
      accountId: input.accountId,
      type: 'CASH_FLOW',
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      factId: input.factId,
      ledgerRevision: 1n,
      timePrecision: 'UNKNOWN',
      sourceTimezone: 'UNKNOWN',
      economicOrderKey: `migration:${input.id}`,
      recordedAt: new Date('2026-08-01T00:00:00.000Z'),
      payloadVersion: 1,
      payload: {
        direction: input.direction,
        category: 'TRANSFER',
        amount: input.amount,
        currency: 'CNY',
      },
      sourceCategory: 'MANUAL',
      sourceChannel: 'manual',
      externalId: null,
      actorId: 'migration:legacy-ledger-v2',
      revisionAction: 'CREATE',
      supersedesEventId: null,
      reason: null,
    });

    const balances = projectCashBalances([
      legacyEvent({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        accountId,
        factId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        direction: 'OUTFLOW',
        amount: '40',
      }),
      legacyEvent({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        accountId: strategyId,
        factId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        direction: 'INFLOW',
        amount: '75',
      }),
    ]);

    expect(balances.get(accountId)?.get('CNY')?.toString()).toBe('-40');
    expect(balances.get(strategyId)?.get('CNY')?.toString()).toBe('75');
  });

  it('当前事件载荷解析失败时显式中止现金投影', () => {
    const malformed: StoredCashEvent = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      accountId,
      type: 'CASH_FLOW',
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      factId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ledgerRevision: 1n,
      timePrecision: 'INSTANT',
      sourceTimezone: 'UTC',
      economicOrderKey: 'current:1',
      recordedAt: new Date('2026-08-01T00:00:00.000Z'),
      payloadVersion: 1,
      payload: {
        direction: 'INFLOW',
        category: 'TRANSFER',
        amount: '50',
        currency: 'CNY',
      },
      sourceCategory: 'MANUAL',
      sourceChannel: 'desktop',
      externalId: null,
      actorId: 'user-1',
      revisionAction: 'CREATE',
      supersedesEventId: null,
      reason: null,
    };

    expect(() => projectCashMaterialization([malformed])).toThrow(
      `现金投影无法解析账本事件 ${malformed.id}`,
    );
  });

  it('未来外部入账在结算前只进入待结算应收', () => {
    const futureDeposit: StoredCashEvent = {
      id: '11111111-1111-4111-8111-111111111111',
      accountId,
      type: 'CASH_FLOW',
      occurredAt: new Date('2026-08-04T01:00:00.000Z'),
      createdAt: new Date('2026-08-03T01:00:00.000Z'),
      factId: '22222222-2222-4222-8222-222222222222',
      ledgerRevision: 1n,
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: 'desktop-cash-deposit:future-1',
      recordedAt: new Date('2026-08-03T01:00:00.000Z'),
      payloadVersion: 1,
      payload: {
        direction: 'INFLOW',
        category: 'DEPOSIT',
        amount: '500',
        currency: 'CNY',
        settledAt: '2026-08-04T01:00:00.000Z',
      },
      sourceCategory: 'MANUAL',
      sourceChannel: 'desktop-cash-deposit',
      externalId: 'future-1',
      actorId: 'desktop-user',
      revisionAction: 'CREATE',
      supersedesEventId: null,
      reason: null,
    };

    const beforeSettlement = projectCashMaterialization(
      [futureDeposit],
      new Date('2026-08-03T12:00:00.000Z'),
    );
    const beforeBalance = beforeSettlement.balances[0];
    expect(beforeBalance?.settledAmount.toString()).toBe('0');
    expect(beforeBalance?.pendingReceivable.toString()).toBe('500');
    expect(beforeSettlement.settlements[0]).toMatchObject({
      status: 'PENDING',
      amount: expect.anything(),
    });

    const afterSettlement = projectCashMaterialization(
      [futureDeposit],
      new Date('2026-08-04T01:00:01.000Z'),
    );
    const afterBalance = afterSettlement.balances[0];
    expect(afterBalance?.settledAmount.toString()).toBe('500');
    expect(afterBalance?.pendingReceivable.toString()).toBe('0');
  });

  it('Case 1：快照后的预计现金流只在生效时间进入余额', () => {
    const events = [
      cashSnapshot({
        id: 'case-1-snapshot',
        amount: '2000',
        capturedAt: '2026-09-03T00:00:00.000Z',
      }),
      cashFlow({
        id: 'case-1-flow',
        amount: '700',
        occurredAt: '2026-09-03T00:00:00.000Z',
        expectedAt: '2026-09-05T00:00:00.000Z',
      }),
    ];

    const before = projectCashMaterialization(events, new Date('2026-09-04T00:00:00.000Z'));
    expect(before.balances[0]?.settledAmount.toString()).toBe('2000');
    expect(before.balances[0]?.pendingReceivable.toString()).toBe('700');

    const after = projectCashMaterialization(events, new Date('2026-09-05T00:00:00.000Z'));
    expect(after.balances[0]?.settledAmount.toString()).toBe('2700');
    expect(after.balances[0]?.pendingReceivable.toString()).toBe('0');
  });

  it('Case 2：快照前已经结算的现金流不会重复重放', () => {
    const events = [
      cashFlow({
        id: 'case-2-flow',
        amount: '700',
        occurredAt: '2026-09-01T00:00:00.000Z',
        settledAt: '2026-09-01T00:00:00.000Z',
      }),
      cashSnapshot({
        id: 'case-2-snapshot',
        amount: '2000',
        capturedAt: '2026-09-03T00:00:00.000Z',
      }),
    ];

    const materialized = projectCashMaterialization(events, new Date('2026-09-05T00:00:00.000Z'));
    expect(materialized.balances[0]?.settledAmount.toString()).toBe('2000');
  });

  it('Case 3：发生时间早于快照但预计生效时间晚于快照的现金流不会丢失', () => {
    const events = [
      cashSnapshot({
        id: 'case-3-snapshot',
        amount: '2000',
        capturedAt: '2026-09-03T00:00:00.000Z',
      }),
      cashFlow({
        id: 'case-3-flow',
        amount: '700',
        occurredAt: '2026-09-01T00:00:00.000Z',
        expectedAt: '2026-09-05T00:00:00.000Z',
      }),
    ];

    const before = projectCashMaterialization(events, new Date('2026-09-04T00:00:00.000Z'));
    expect(before.balances[0]?.settledAmount.toString()).toBe('2000');
    expect(before.balances[0]?.pendingReceivable.toString()).toBe('700');
    const after = projectCashMaterialization(events, new Date('2026-09-05T00:00:00.000Z'));
    expect(after.balances[0]?.settledAmount.toString()).toBe('2700');
  });

  it('Case 4：实际结算早于预计时间时从实际结算时间进入余额', () => {
    const events = [
      cashSnapshot({
        id: 'case-4-snapshot',
        amount: '2000',
        capturedAt: '2026-09-03T00:00:00.000Z',
      }),
      cashFlow({
        id: 'case-4-flow',
        amount: '700',
        occurredAt: '2026-09-01T00:00:00.000Z',
        expectedAt: '2026-09-05T00:00:00.000Z',
        settledAt: '2026-09-04T00:00:00.000Z',
      }),
    ];

    const materialized = projectCashMaterialization(events, new Date('2026-09-04T00:00:00.000Z'));
    expect(materialized.balances[0]?.settledAmount.toString()).toBe('2700');
    expect(materialized.balances[0]?.pendingReceivable.toString()).toBe('0');
  });

  it('Case 5：连续快照从最新快照继续，不重放更早现金流', () => {
    const events = [
      cashSnapshot({
        id: 'case-5-snapshot-1',
        amount: '1000',
        capturedAt: '2026-09-01T00:00:00.000Z',
      }),
      cashFlow({
        id: 'case-5-flow-1',
        amount: '500',
        occurredAt: '2026-09-02T00:00:00.000Z',
        settledAt: '2026-09-02T00:00:00.000Z',
      }),
      cashSnapshot({
        id: 'case-5-snapshot-2',
        amount: '1800',
        capturedAt: '2026-09-03T00:00:00.000Z',
      }),
      cashFlow({
        id: 'case-5-flow-2',
        amount: '200',
        occurredAt: '2026-09-04T00:00:00.000Z',
        settledAt: '2026-09-04T00:00:00.000Z',
      }),
    ];

    const materialized = projectCashMaterialization(events, new Date('2026-09-04T00:00:00.000Z'));
    expect(materialized.balances[0]?.settledAmount.toString()).toBe('2000');
  });

  it('Case 6：现金流生效时间等于快照时间时严格排除重放', () => {
    const events = [
      cashSnapshot({
        id: 'case-6-snapshot',
        amount: '2000',
        capturedAt: '2026-09-03T00:00:00.000Z',
      }),
      cashFlow({
        id: 'case-6-flow',
        amount: '700',
        occurredAt: '2026-09-01T00:00:00.000Z',
        settledAt: '2026-09-03T00:00:00.000Z',
      }),
    ];

    const materialized = projectCashMaterialization(events, new Date('2026-09-04T00:00:00.000Z'));
    expect(materialized.balances[0]?.settledAmount.toString()).toBe('2000');
  });

  it('快照缺少 capturedAt 时回退到事件 occurredAt 作为边界', () => {
    const snapshot = storedV2Event({
      id: 'snapshot-without-captured-at',
      accountId,
      type: 'CASH_BALANCE_OBSERVATION',
      occurredAt: '2026-09-03T00:00:00.000Z',
      payload: { currency: 'CNY', amount: '2000' },
    }) as StoredCashEvent;
    const materialized = projectCashMaterialization(
      [
        cashFlow({
          id: 'flow-before-fallback-snapshot',
          amount: '700',
          occurredAt: '2026-09-01T00:00:00.000Z',
          settledAt: '2026-09-02T00:00:00.000Z',
        }),
        snapshot,
      ],
      new Date('2026-09-04T00:00:00.000Z'),
    );

    expect(materialized.balances[0]?.settledAmount.toString()).toBe('2000');
  });

  it('历史现金流缺少时间字段时仅按 occurredAt 有限回退', () => {
    const materialized = projectCashMaterialization(
      [
        cashFlow({
          id: 'legacy-past-flow',
          amount: '300',
          occurredAt: '2026-09-01T00:00:00.000Z',
        }),
        cashFlow({
          id: 'legacy-future-flow',
          amount: '500',
          occurredAt: '2026-09-05T00:00:00.000Z',
        }),
      ],
      new Date('2026-09-03T00:00:00.000Z'),
    );

    expect(materialized.balances[0]?.settledAmount.toString()).toBe('300');
    expect(materialized.balances[0]?.pendingReceivable.toString()).toBe('500');
  });

  it('将 ACTIVE Trade 的剩余来源物化为 Position，并保存稳定的子表引用', async () => {
    const events = [
      execution({
        id: '33333333-3333-4333-8333-333333333333',
        factId: '44444444-4444-4444-8444-444444444444',
        revision: 1,
        type: 'BUY_EXECUTION',
        quantity: '10',
        price: '100',
        occurredAt: '2026-08-01T01:00:00.000Z',
      }),
      execution({
        id: '55555555-5555-4555-8555-555555555555',
        factId: '66666666-6666-4666-8666-666666666666',
        revision: 2,
        type: 'SELL_EXECUTION',
        quantity: '4',
        price: '120',
        occurredAt: '2026-08-02T01:00:00.000Z',
      }),
    ];
    const client = fakeCoreClient(events);
    const first = await rebuildCoreProjections(client as never, accountId, {
      method: 'AVG',
      projectionGeneration: 7n,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });
    await rebuildCoreProjections(client as never, accountId, {
      method: 'AVG',
      projectionGeneration: 7n,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(first.positions).toEqual([
      {
        accountId,
        symbol: 'AAPL.US',
        quantity: '6',
        averageCost: '100',
        realizedPnl: '80',
      },
    ]);
    expect(first.tradeCount).toBe(1);
    expect(first.cashBalanceCount).toBe(1);
    expect(first.cashSettlementCount).toBe(2);
    const tradeData = client.trade.create.mock.calls[0]?.[0].data;
    expect(tradeData?.remainingQuantity.toString()).toBe('6');
    expect(tradeData?.projectionGeneration).toBe(7n);
    const positionData = client.position.create.mock.calls[0]?.[0].data;
    expect(positionData).toMatchObject({
      accountId,
      symbol: 'AAPL.US',
      source: 'ledger',
    });
    expect(positionData?.quantity.toString()).toBe('6');
    expect(positionData?.costPrice.toString()).toBe('100');
    expect(client.tradeEntryLeg.create.mock.calls[0]?.[0].data.id).toBe(
      client.tradeEntryLeg.create.mock.calls[1]?.[0].data.id,
    );
    expect(client.cashSettlement.create.mock.calls[0]?.[0].data.id).toBe(
      client.cashSettlement.create.mock.calls[2]?.[0].data.id,
    );
  });

  it('按币种区分未来结算与已结算现金，并保留费用币种问题', () => {
    const events = [
      {
        id: '77777777-7777-4777-8777-777777777777',
        accountId,
        type: 'CASH_BALANCE_OBSERVATION',
        occurredAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        factId: '88888888-8888-4888-8888-888888888888',
        ledgerRevision: 1n,
        timePrecision: 'INSTANT',
        sourceTimezone: 'UTC',
        economicOrderKey: 'cash:1',
        recordedAt: new Date('2026-08-01T00:00:00.000Z'),
        payloadVersion: 1,
        payload: {
          currency: 'USD',
          amount: '1000',
        },
        sourceCategory: 'MANUAL',
        sourceChannel: 'test',
        externalId: null,
        actorId: 'test',
        revisionAction: 'CREATE',
        supersedesEventId: null,
        reason: null,
      },
      execution({
        id: '99999999-9999-4999-8999-999999999999',
        factId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        revision: 2,
        type: 'BUY_EXECUTION',
        quantity: '2',
        price: '100',
        occurredAt: '2026-08-02T00:00:00.000Z',
        settledAt: '2026-08-04T00:00:00.000Z',
        charges: [
          { category: 'COMMISSION', amount: '3', currency: 'HKD' },
          { category: 'TAX', amount: '2', currency: 'USD' },
        ],
      }),
    ];
    const materialized = projectCashMaterialization(events, new Date('2026-08-03T00:00:00.000Z'));

    expect(materialized.balances).toHaveLength(2);
    const usdBalance = materialized.balances.find((balance) => balance.currency === 'USD');
    const hkdBalance = materialized.balances.find((balance) => balance.currency === 'HKD');
    expect(usdBalance).toMatchObject({
      accountId,
      issues: ['FEE_CURRENCY_MISMATCH'],
      completeness: 'PARTIAL',
    });
    expect(usdBalance?.settledAmount.toString()).toBe('1000');
    expect(usdBalance?.pendingPayable.toString()).toBe('202');
    expect(hkdBalance).toMatchObject({
      accountId,
      issues: ['FEE_CURRENCY_MISMATCH'],
      completeness: 'PARTIAL',
    });
    expect(hkdBalance?.pendingPayable.toString()).toBe('3');
    const simpleBalances = projectCashBalances(events);
    expect(simpleBalances.get(accountId)?.get('HKD')?.toString()).toBe('-3');
    expect(materialized.settlements).toHaveLength(2);
    expect(materialized.settlements[0]).toMatchObject({
      direction: 'PAYABLE',
      status: 'PENDING',
      settledAt: '2026-08-04T00:00:00.000Z',
      sourceType: 'BUY_EXECUTION',
    });
    const hkdSettlement = materialized.settlements.find(
      (settlement) => settlement.currency === 'HKD',
    );
    expect(hkdSettlement).toMatchObject({
      factId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:charge:0',
      currency: 'HKD',
      direction: 'PAYABLE',
      status: 'PENDING',
    });
    expect(hkdSettlement?.amount.toString()).toBe('3');
  });

  it('核心物化任一写入失败时立即中止后续投影写入', async () => {
    const client = fakeCoreClient([
      execution({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        factId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        revision: 1,
        type: 'BUY_EXECUTION',
        quantity: '1',
        price: '100',
        occurredAt: '2026-08-01T01:00:00.000Z',
      }),
    ]);
    client.trade.create.mockRejectedValue(new Error('materialization failed'));

    await expect(
      rebuildCoreProjections(client as never, accountId, {
        method: 'AVG',
        projectionGeneration: 8n,
      }),
    ).rejects.toThrow('materialization failed');
    expect(client.cashBalance.deleteMany).not.toHaveBeenCalled();
    expect(client.position.create).not.toHaveBeenCalled();
  });
});
