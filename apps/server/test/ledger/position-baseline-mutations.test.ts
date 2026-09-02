import { beforeEach, describe, expect, it, vi } from 'vitest';

const rebuildLedgerProjection = vi.hoisted(() => vi.fn(async () => ({ rebuilt: true })));

vi.mock('../../src/ledger/ledger-projection.js', () => ({ rebuildLedgerProjection }));

import { LedgerService } from '../../src/ledger/ledger.service.js';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';

const createHarness = () => {
  const positionFindUnique = vi.fn(async () => ({
    id: 'position-1',
    accountId: accountA,
    symbol: '600519.SH',
    quantity: '100',
    costPrice: '10',
  }));
  const positionFindMany = vi.fn(async () => [
    { id: 'position-a', accountId: accountA, symbol: '000001.SZ', costPrice: '8' },
    { id: 'position-b', accountId: accountA, symbol: '600519.SH', costPrice: '10' },
  ]);
  const transaction = {
    account: {
      findUnique: vi.fn(async () => ({ active: true, currency: 'CNY', type: 'securities' })),
    },
    asset: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
    },
    baselineObservationBatch: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    position: {
      findUnique: positionFindUnique,
      findMany: positionFindMany,
    },
  };
  const context = (accountId: string) => ({
    transaction,
    accountId,
    currentLedgerRevision: 10n,
    nextLedgerRevision: 11n,
    currentProjectionGeneration: 20n,
    nextProjectionGeneration: 21n,
  });
  const appendRevision = vi.fn(async (_context: unknown, event: unknown) => event);
  const withAccountWrite = vi.fn(
    async (
      accountId: string,
      operation: (value: ReturnType<typeof context>) => Promise<{
        value: unknown;
        advanceRevision: boolean;
      }>,
    ) => {
      const mutation = await operation(context(accountId));
      return {
        value: mutation.value,
        ledgerRevision: mutation.advanceRevision ? '11' : '10',
        projectionGeneration: mutation.advanceRevision ? '21' : '20',
      };
    },
  );
  const withAccountsWrite = vi.fn(
    async (
      accountIds: string[],
      operation: (
        values: Map<string, ReturnType<typeof context>>,
      ) => Promise<{ value: unknown; advanceAccountIds: string[] }>,
    ) => {
      const values = new Map(accountIds.map((accountId) => [accountId, context(accountId)]));
      const mutation = await operation(values);
      return {
        value: mutation.value,
        ledgerRevisions: Object.fromEntries(accountIds.map((accountId) => [accountId, '11'])),
        projectionGenerations: Object.fromEntries(accountIds.map((accountId) => [accountId, '21'])),
      };
    },
  );
  const repository = { appendRevision, withAccountWrite, withAccountsWrite };
  const service = new LedgerService({} as never, repository as never);
  return {
    service,
    repository,
    transaction,
    appendRevision,
    withAccountWrite,
    withAccountsWrite,
    positionFindMany,
  };
};

describe('Ledger position baseline composite mutations', () => {
  beforeEach(() => {
    rebuildLedgerProjection.mockClear();
  });

  it('同账户迁移在一个账户事务中写两条同 revision 事件并只 rebuild 一次', async () => {
    const harness = createHarness();

    await harness.service.movePositionBaseline({
      positionId: 'position-1',
      fromAccountId: accountA,
      fromSymbol: '600519.SH',
      toAccountId: accountA,
      toSymbol: '000001.SZ',
      quantity: '200',
      costPrice: '12',
      source: 'manual',
      options: { assetName: '平安银行', assetType: 'stock' },
    });

    expect(harness.withAccountWrite).toHaveBeenCalledTimes(1);
    expect(harness.withAccountsWrite).not.toHaveBeenCalled();
    expect(harness.appendRevision).toHaveBeenCalledTimes(2);
    const first = harness.appendRevision.mock.calls[0]?.[1] as {
      ledgerRevision: string;
      economicOrderKey: string;
    };
    const second = harness.appendRevision.mock.calls[1]?.[1] as {
      ledgerRevision: string;
      economicOrderKey: string;
    };
    expect(first.ledgerRevision).toBe('11');
    expect(second.ledgerRevision).toBe('11');
    expect(first.economicOrderKey).toMatch(/:000000$/u);
    expect(second.economicOrderKey).toMatch(/:000001$/u);
    expect(rebuildLedgerProjection).toHaveBeenCalledTimes(1);
    expect(rebuildLedgerProjection).toHaveBeenCalledWith(
      harness.transaction,
      accountA,
      'AVG',
      21n,
    );
  });

  it('跨账户迁移使用一个多账户事务并按账户各 rebuild 一次', async () => {
    const harness = createHarness();

    await harness.service.movePositionBaseline({
      positionId: 'position-1',
      fromAccountId: accountA,
      fromSymbol: '600519.SH',
      toAccountId: accountB,
      toSymbol: '000001.SZ',
      quantity: '200',
      costPrice: '12',
      source: 'manual',
      options: { assetName: '平安银行', assetType: 'stock' },
    });

    expect(harness.withAccountWrite).not.toHaveBeenCalled();
    expect(harness.withAccountsWrite).toHaveBeenCalledTimes(1);
    expect(harness.withAccountsWrite.mock.calls[0]?.[0]).toEqual([accountA, accountB]);
    expect(harness.appendRevision).toHaveBeenCalledTimes(2);
    expect(rebuildLedgerProjection).toHaveBeenCalledTimes(2);
    expect(rebuildLedgerProjection).toHaveBeenNthCalledWith(
      1,
      harness.transaction,
      accountA,
      'AVG',
      21n,
    );
    expect(rebuildLedgerProjection).toHaveBeenNthCalledWith(
      2,
      harness.transaction,
      accountB,
      'AVG',
      21n,
    );
  });

  it('批量清仓在事务内读取目标并写同 revision 事件，最后只 rebuild 一次', async () => {
    const harness = createHarness();

    await expect(harness.service.clearPositions(accountA)).resolves.toEqual({
      accountId: accountA,
      cleared: 2,
    });

    expect(harness.positionFindMany).toHaveBeenCalledWith({
      where: { accountId: accountA },
      orderBy: { symbol: 'asc' },
    });
    expect(harness.appendRevision).toHaveBeenCalledTimes(2);
    const events = harness.appendRevision.mock.calls.map((call) => call[1]) as Array<{
      ledgerRevision: string;
      economicOrderKey: string;
    }>;
    expect(events.map((event) => event.ledgerRevision)).toEqual(['11', '11']);
    expect(events[0]?.economicOrderKey).toMatch(/:000000$/u);
    expect(events[1]?.economicOrderKey).toMatch(/:000001$/u);
    expect(rebuildLedgerProjection).toHaveBeenCalledTimes(1);
  });

  it('批量清仓中途写入失败时不会执行 projection rebuild', async () => {
    const harness = createHarness();
    harness.appendRevision.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error('boom'));

    await expect(harness.service.clearPositions(accountA)).rejects.toThrow('boom');
    expect(rebuildLedgerProjection).not.toHaveBeenCalled();
  });

  it('空账户不推进 revision 且不 rebuild', async () => {
    const harness = createHarness();
    harness.positionFindMany.mockResolvedValueOnce([]);

    await expect(harness.service.clearPositions(accountA)).resolves.toEqual({
      accountId: accountA,
      cleared: 0,
    });

    expect(harness.appendRevision).not.toHaveBeenCalled();
    expect(rebuildLedgerProjection).not.toHaveBeenCalled();
  });
});
