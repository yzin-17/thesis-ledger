import { describe, expect, it, vi } from 'vitest';
import { JournalService } from '../../src/journal/journal.service.js';

describe('Journal 与行为复盘', () => {
  it('按账户范围查询日志/计划，并输出反事实和周期复盘', async () => {
    const prisma = {
      journalEntry: {
        findMany: vi.fn(async () => [{ id: 'entry', accountId: 'a' }]),
        create: vi.fn(async ({ data }: { data: object }) => data),
        findUnique: vi.fn(async () => ({ id: 'entry' })),
        update: vi.fn(async ({ data }: { data: object }) => data),
      },
      tradePlan: {
        findMany: vi.fn(async () => [{ id: 'plan', accountId: 'a' }]),
        create: vi.fn(async ({ data }: { data: object }) => data),
      },
    };
    const service = new JournalService(prisma as never);
    await expect(service.listEntries(undefined, 'a')).resolves.toEqual([
      { id: 'entry', accountId: 'a' },
    ]);
    await expect(service.listPlans(undefined, 'a')).resolves.toEqual([
      { id: 'plan', accountId: 'a' },
    ]);
    await expect(
      service.counterfactual({
        trades: [
          {
            symbol: '600519.SH',
            entryAt: '2025-01-01',
            exitAt: '2025-01-03',
            pnl: -10,
            entryPrice: 10,
          },
        ],
        enforceStop: true,
        stopPrice: 9.5,
      }),
    ).toMatchObject({ counterfactualPnl: -0.5 });
    const planned = service.plannedVsActual({
      symbol: '600519.SH',
      entryAt: '2025-01-01',
      exitAt: '2025-01-03',
      pnl: -10,
      plannedEntry: 10,
      entryPrice: 10.2,
      plannedExit: 11,
      exitPrice: 10.5,
      plannedHoldingDays: 1,
    });
    expect(planned.entryDeviation).toBeCloseTo(0.2);
    expect(planned.exitDeviation).toBeCloseTo(-0.5);
    expect(
      service.review({
        trades: [
          {
            symbol: '600519.SH',
            entryAt: '2025-01-01',
            exitAt: '2025-01-03',
            pnl: -10,
          },
        ],
        start: '2025-01-01',
        end: '2025-01-04',
      }),
    ).toMatchObject({ tradeCount: 1, behavior: { winRate: 0 } });
  });

  it('从 Ledger 交易和显式 Journal 关联组装复盘候选', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const buyId = '22222222-2222-4222-8222-222222222222';
    const sellId = '33333333-3333-4333-8333-333333333333';
    const journalId = '44444444-4444-4444-8444-444444444444';
    const planId = '55555555-5555-4555-8555-555555555555';
    const prisma = {
      ledgerEvent: {
        findMany: vi.fn(async () => [
          {
            id: buyId,
            accountId,
            type: 'BUY',
            occurredAt: new Date('2025-01-01T09:30:00.000Z'),
            symbol: '600519.SH',
            quantity: 100,
            price: 10,
            amount: null,
            fee: 5,
            tax: null,
            metadata: null,
          },
          {
            id: sellId,
            accountId,
            type: 'SELL',
            occurredAt: new Date('2025-01-03T09:30:00.000Z'),
            symbol: '600519.SH',
            quantity: 100,
            price: 12,
            amount: null,
            fee: 5,
            tax: 3,
            metadata: null,
          },
        ]),
      },
      tradePlan: {
        findMany: vi.fn(async () => [
          {
            id: planId,
            accountId,
            plannedEntry: 10,
            plannedExit: 13,
            stopLoss: 9,
            takeProfit: 13,
            targetWeight: 0.1,
            expectedHoldingDays: 2,
            plannedEntryAt: new Date('2025-01-01T09:30:00.000Z'),
            plannedExitAt: new Date('2025-01-03T09:30:00.000Z'),
            status: 'executed',
          },
        ]),
      },
      journalEntry: {
        findMany: vi.fn(async () => [
          { id: journalId, ledgerEventId: sellId, tradePlanId: planId },
        ]),
      },
    };
    const service = new JournalService(prisma as never);

    const result = await service.listReviewCandidates({ accountId, limit: 10 });

    expect(result).toMatchObject({ total: 1, nextCursor: null });
    expect(result.items[0]).toMatchObject({
      accountId,
      symbol: '600519.SH',
      pnl: 187,
      evidenceCompleteness: 'complete',
      missingEvidence: [],
      plan: { id: planId, plannedEntry: 10, stopLoss: 9 },
      sources: { entryEventIds: [buyId], exitEventIds: [sellId], planId },
    });
    expect(prisma.ledgerEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId } }),
    );
  });

  it('按账户、标的、退出窗口和稳定 cursor 分页，未关联计划时保持仅实际交易', async () => {
    const accountId = '66666666-6666-4666-8666-666666666666';
    const otherAccountId = '77777777-7777-4777-8777-777777777777';
    const buyId = '88888888-8888-4888-8888-888888888888';
    const sellId = '99999999-9999-4999-8999-999999999999';
    const buyId2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const sellId2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const events = [
      {
        id: buyId,
        accountId,
        type: 'BUY',
        occurredAt: new Date('2025-02-01T09:30:00.000Z'),
        symbol: '000001.SZ',
        quantity: 10,
        price: 10,
        amount: null,
        fee: null,
        tax: null,
        metadata: null,
      },
      {
        id: sellId,
        accountId,
        type: 'SELL',
        occurredAt: new Date('2025-02-03T09:30:00.000Z'),
        symbol: '000001.SZ',
        quantity: 10,
        price: 11,
        amount: null,
        fee: null,
        tax: null,
        metadata: null,
      },
      {
        id: buyId2,
        accountId,
        type: 'BUY',
        occurredAt: new Date('2025-02-04T09:30:00.000Z'),
        symbol: '000001.SZ',
        quantity: 10,
        price: 12,
        amount: null,
        fee: null,
        tax: null,
        metadata: null,
      },
      {
        id: sellId2,
        accountId,
        type: 'SELL',
        occurredAt: new Date('2025-02-06T09:30:00.000Z'),
        symbol: '000001.SZ',
        quantity: 10,
        price: 13,
        amount: null,
        fee: null,
        tax: null,
        metadata: null,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        accountId: otherAccountId,
        type: 'SELL',
        occurredAt: new Date('2025-02-03T09:30:00.000Z'),
        symbol: '600519.SH',
        quantity: 1,
        price: 2,
        amount: null,
        fee: null,
        tax: null,
        metadata: null,
      },
    ];
    const prisma = {
      ledgerEvent: {
        findMany: vi.fn(async ({ where }: { where: { accountId: string } }) =>
          events.filter((event) => event.accountId === where.accountId),
        ),
      },
      tradePlan: { findMany: vi.fn(async () => []) },
      journalEntry: { findMany: vi.fn(async () => []) },
    };
    const service = new JournalService(prisma as never);

    const page = await service.listReviewCandidates({
      accountId,
      symbol: '000001.SZ',
      start: '2025-02-03T00:00:00.000Z',
      end: '2025-02-06T23:59:59.000Z',
      limit: 1,
    });
    expect(page).toMatchObject({ total: 2, nextCursor: expect.stringContaining('review:') });
    expect(page.items[0]).toMatchObject({
      accountId,
      symbol: '000001.SZ',
      evidenceCompleteness: 'actual-only',
      missingEvidence: ['交易计划'],
    });

    const nextPageInput = page.nextCursor ? { accountId, cursor: page.nextCursor } : { accountId };
    await expect(service.listReviewCandidates(nextPageInput)).resolves.toMatchObject({
      items: [expect.objectContaining({ symbol: '000001.SZ' })],
      total: 2,
      nextCursor: null,
    });
    await expect(
      service.listReviewCandidates({ accountId, cursor: 'missing-cursor' }),
    ).rejects.toThrow('复盘候选 cursor 不存在');
    expect(prisma.tradePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId, symbol: '000001.SZ' } }),
    );
  });
});
