import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountsController } from '../../src/portfolio/accounts.controller.js';
import { AccountPermanentDeletionService } from '../../src/portfolio/account-permanent-deletion.service.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const HTTP_CODE_METADATA = '__httpCode__';

const relationDelegates = [
  'accountLedgerState',
  'accountCostStrategyVersion',
  'position',
  'trade',
  'cashBalance',
  'cashSettlement',
  'importDraft',
  'baselineObservationBatch',
  'ledgerEvent',
  'portfolioSnapshot',
  'accountValuationPoint',
  'riskRule',
  'riskPositionState',
  'riskEvent',
  'tradePlan',
  'recurringCashDepositPlan',
  'recurringCashDepositOccurrence',
  'recurringFundInvestmentPlan',
  'recurringFundInvestmentOccurrence',
  'targetAllocation',
  'journalEntry',
  'journalReviewSnapshot',
  'aiDecisionLog',
] as const;

type MockOptions = {
  counts?: Partial<Record<(typeof relationDelegates)[number], number>>;
  rawCount?: number;
  queryFailure?: Error;
  deleteFailure?: unknown;
};

type MockDelegate = { count: ReturnType<typeof vi.fn> };

type MockTransaction = {
  account: { delete: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
} & Record<(typeof relationDelegates)[number], MockDelegate>;

const createMockPrisma = (options: MockOptions = {}) => {
  const tx = {
    account: {
      delete: vi.fn(async () => {
        if (options.deleteFailure) throw options.deleteFailure;
      }),
    },
  } as MockTransaction;
  for (const delegate of relationDelegates)
    tx[delegate] = { count: vi.fn(async () => options.counts?.[delegate] ?? 0) };

  let queryCount = 0;
  tx.$queryRaw = vi.fn(async () => {
    queryCount += 1;
    if (options.queryFailure) throw options.queryFailure;
    return queryCount === 1 ? [{ id: accountId }] : [{ count: BigInt(options.rawCount ?? 0) }];
  });
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { prisma, tx };
};

const responseOf = (error: unknown) =>
  error instanceof ConflictException ? error.getResponse() : undefined;

describe('AccountPermanentDeletionService', () => {
  it.each(relationDelegates)('拒绝存在 %s 关联记录的账户', async (delegate) => {
    const { prisma, tx } = createMockPrisma({ counts: { [delegate]: 1 } });
    const service = new AccountPermanentDeletionService(prisma as never);

    const error = await service.delete(accountId).catch((caught) => caught);
    expect(responseOf(error)).toMatchObject({ errorCode: 'ACCOUNT_IN_USE' });
    expect(tx[delegate].count).toHaveBeenCalledWith({ where: { accountId } });
    expect(tx.account.delete).not.toHaveBeenCalled();
  });

  it('拒绝存在 raw-owned StrategyRiskApplication 的账户', async () => {
    const { prisma, tx } = createMockPrisma({ rawCount: 1 });
    const service = new AccountPermanentDeletionService(prisma as never);

    const error = await service.delete(accountId).catch((caught) => caught);
    expect(responseOf(error)).toMatchObject({ errorCode: 'ACCOUNT_IN_USE' });
    expect(tx.account.delete).not.toHaveBeenCalled();
  });

  it('不以零余额或停用状态豁免历史 Ledger 记录', async () => {
    const { prisma } = createMockPrisma({ counts: { ledgerEvent: 1 } });
    const service = new AccountPermanentDeletionService(prisma as never);

    const error = await service.delete(accountId).catch((caught) => caught);
    expect(responseOf(error)).toMatchObject({
      errorCode: 'ACCOUNT_IN_USE',
      message: expect.stringContaining('Ledger'),
    });
  });

  it('账户不存在返回 404，重复删除的后请求也返回 404', async () => {
    let exists = true;
    const { prisma, tx } = createMockPrisma();
    let lockQueryCount = 0;
    tx.$queryRaw.mockImplementation(async () => {
      if (!exists) return [];
      if (lockQueryCount === 0) {
        lockQueryCount += 1;
        return [{ id: accountId }];
      }
      return [{ count: 0n }];
    });
    tx.account.delete.mockImplementation(async () => {
      exists = false;
    });
    const service = new AccountPermanentDeletionService(prisma as never);

    await expect(service.delete(accountId)).resolves.toBeUndefined();
    await expect(service.delete(accountId)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.account.delete).toHaveBeenCalledOnce();
  });

  it('查询失败时 fail-closed 且不删除账户', async () => {
    const { prisma, tx } = createMockPrisma({ queryFailure: new Error('database unavailable') });
    const service = new AccountPermanentDeletionService(prisma as never);

    await expect(service.delete(accountId)).rejects.toThrow('database unavailable');
    expect(tx.account.delete).not.toHaveBeenCalled();
  });

  it('删除时遇到 FK 冲突映射为 ACCOUNT_IN_USE，其他错误继续抛出', async () => {
    const fk = createMockPrisma({ deleteFailure: { code: 'P2003' } });
    const service = new AccountPermanentDeletionService(fk.prisma as never);
    await expect(service.delete(accountId)).rejects.toMatchObject({
      response: { errorCode: 'ACCOUNT_IN_USE' },
    });

    const failure = createMockPrisma({ deleteFailure: new Error('delete failed') });
    await expect(
      new AccountPermanentDeletionService(failure.prisma as never).delete(accountId),
    ).rejects.toThrow('delete failed');
  });
});

describe('AccountsController permanent delete route', () => {
  it('returns no body with explicit 204 and keeps legacy deactivate route', async () => {
    const permanentDelete = vi.fn(async () => undefined);
    const accounts = { deactivate: vi.fn(async () => ({ active: false })) };
    const controller = new AccountsController(
      accounts as never,
      { delete: permanentDelete } as never,
    );

    await expect(controller.permanentDelete(accountId)).resolves.toBeUndefined();
    expect(permanentDelete).toHaveBeenCalledWith(accountId);
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, AccountsController.prototype.permanentDelete),
    ).toBe(204);
    await expect(controller.deactivate(accountId)).resolves.toEqual({ active: false });
    expect(accounts.deactivate).toHaveBeenCalledWith(accountId);
  });
});
