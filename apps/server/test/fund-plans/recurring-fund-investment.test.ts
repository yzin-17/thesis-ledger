import { describe, expect, it, vi } from 'vitest';
import { RecurringFundInvestmentService } from '../../src/fund-plans/recurring-fund-investment.service.js';
import { scheduledFundInvestmentForPeriod } from '../../src/fund-plans/recurring-fund-investment.schedule.js';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  active: true,
  mode: 'actual',
  type: 'fund',
  currency: 'CNY',
};
const asset = {
  symbol: '000001.OF',
  name: '示例基金',
  assetType: 'fund',
  identityStatus: 'confirmed',
};

describe('基金定投', () => {
  it('31 日计划在短月按月末生成', () => {
    expect(scheduledFundInvestmentForPeriod('2026-02', 31)).toEqual(
      new Date('2026-02-28T01:00:00.000Z'),
    );
  });

  it('只为真实基金账户和已确认场外基金创建计划', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'plan-1', ...data }));
    const prisma = {
      account: { findUnique: vi.fn(async () => account) },
      asset: { findUnique: vi.fn(async () => asset) },
      recurringFundInvestmentPlan: { create },
    };
    const service = new RecurringFundInvestmentService(prisma as never, {} as never);
    await service.create({
      accountId: account.id,
      name: '每月定投',
      symbol: asset.symbol,
      expectedAmount: '1000',
      dayOfMonth: 31,
      startPeriod: '2026-09',
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: account.id,
        symbol: asset.symbol,
        fundName: asset.name,
      }),
    });
  });

  it('到期只补齐唯一待确认实例并推进下次日期', async () => {
    const plan = {
      id: '33333333-3333-4333-8333-333333333333',
      accountId: account.id,
      name: '每月定投',
      symbol: asset.symbol,
      fundName: asset.name,
      expectedAmount: '1000',
      currency: 'CNY',
      dayOfMonth: 31,
      status: 'ACTIVE',
      nextDueAt: new Date('2026-07-31T01:00:00.000Z'),
      version: 1,
    };
    const createMany = vi.fn(async () => ({ count: 2 }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const transaction = {
      recurringFundInvestmentPlan: {
        findUnique: vi.fn(async () => plan),
        updateMany,
      },
      recurringFundInvestmentOccurrence: {
        findMany: vi.fn(async () => []),
        createMany,
      },
    };
    const prisma = {
      recurringFundInvestmentPlan: { findMany: vi.fn(async () => [plan]) },
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new RecurringFundInvestmentService(prisma as never, {} as never);

    await expect(service.materializeDue(new Date('2026-08-31T02:00:00.000Z'))).resolves.toEqual({
      planCount: 1,
      results: [{ planId: plan.id, createdCount: 2, periods: ['2026-07', '2026-08'] }],
    });
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ periodKey: '2026-07' }),
          expect.objectContaining({ periodKey: '2026-08' }),
        ]),
        skipDuplicates: true,
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nextDueAt: new Date('2026-09-30T01:00:00.000Z'), version: { increment: 1 } },
      }),
    );
  });

  it('确认实例通过 Ledger 原子回调写入一次 BUY 成交', async () => {
    const occurrence = {
      id: '22222222-2222-4222-8222-222222222222',
      accountId: account.id,
      planId: '33333333-3333-4333-8333-333333333333',
      periodKey: '2026-09',
      planName: '每月定投',
      symbol: asset.symbol,
      fundName: asset.name,
      expectedAmount: '1000',
      currency: 'CNY',
      status: 'PENDING',
      version: 1,
    };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findUnique = vi.fn(async () => occurrence);
    const createExecutionWithEffect = vi.fn(async (command, effect) => {
      await effect(
        { recurringFundInvestmentOccurrence: { updateMany } },
        {
          eventId: '44444444-4444-4444-8444-444444444444',
          factId: '55555555-5555-4555-8555-555555555555',
        },
      );
      occurrence.status = 'CONFIRMED';
      return { response: {}, effectResult: undefined };
    });
    const prisma = {
      account: { findUnique: vi.fn(async () => account) },
      asset: { findUnique: vi.fn(async () => asset) },
      recurringFundInvestmentOccurrence: { findUnique, updateMany },
    };
    const service = new RecurringFundInvestmentService(
      prisma as never,
      { createExecutionWithEffect } as never,
    );
    await service.confirmOccurrence(occurrence.id, {
      expectedVersion: 1,
      actualQuantity: '800',
      unitPrice: '1.25',
      commission: '1',
      occurredAt: '2026-09-08',
    });
    expect(createExecutionWithEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'BUY',
        payload: expect.objectContaining({ symbol: asset.symbol, quantity: '800', price: '1.25' }),
      }),
      expect.any(Function),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: occurrence.id, status: 'PENDING', version: 1 } }),
    );
  });
});
