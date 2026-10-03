import { describe, expect, it, vi } from 'vitest';
import { projectCashMaterialization } from '../../src/ledger/cash-projection.js';
import { rebuildCoreProjections } from '../../src/ledger/core-projection.js';
import { rebuildLedgerProjection } from '../../src/ledger/ledger-projection.js';
import { PortfolioService } from '../../src/portfolio/portfolio.service.js';
import { cashFlowEvent } from './ledger-event-fixtures.js';

describe('当前信封消费边界', () => {
  const old = {
    ...cashFlowEvent({ id: 'old', amount: '100' }),
    payload: { direction: 'INFLOW', category: 'DEPOSIT', amount: '100', currency: 'CNY' },
    envelopeVersion: null,
  };

  it('现金投影不忽略无 factId 的旧行', () => {
    expect(() => projectCashMaterialization([{ ...old, factId: null }])).toThrow(
      '旧账本事件不支持读取或修订',
    );
  });

  it.each(['core', 'position'])('%s 重建在修改策略或物化表前拒绝旧行', async (kind) => {
    const client = {
      ledgerEvent: { findMany: vi.fn(async () => [{ ...old, factId: null }]) },
      account: { findUnique: vi.fn() },
      accountCostStrategyVersion: { findMany: vi.fn(), create: vi.fn() },
      position: { findMany: vi.fn(), delete: vi.fn(), create: vi.fn() },
      trade: { deleteMany: vi.fn() },
      cashBalance: { deleteMany: vi.fn() },
    };
    const operation =
      kind === 'core'
        ? rebuildCoreProjections(client as never, old.accountId, { method: 'AVG' })
        : rebuildLedgerProjection(
            { ledgerEvent: client.ledgerEvent, position: client.position } as never,
            old.accountId,
            'AVG',
          );
    await expect(operation).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_CONTRACT_VERSION' },
    });
    expect(client.account.findUnique).not.toHaveBeenCalled();
    expect(client.accountCostStrategyVersion.create).not.toHaveBeenCalled();
    expect(client.position.findMany).not.toHaveBeenCalled();
    expect(client.trade.deleteMany).not.toHaveBeenCalled();
    expect(client.cashBalance.deleteMany).not.toHaveBeenCalled();
  });

  it('Portfolio 现金读取明确拒绝旧行，不回显旧余额', async () => {
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      account: { findMany: vi.fn(async () => [{ id: old.accountId, currency: 'CNY' }]) },
      ledgerEvent: { findMany: vi.fn(async () => [old]) },
    };
    const market = { getFxRates: vi.fn() };
    await expect(
      new PortfolioService(prisma as never, market as never).value(old.accountId),
    ).rejects.toMatchObject({ response: { code: 'UNSUPPORTED_CONTRACT_VERSION' } });
    expect(market.getFxRates).not.toHaveBeenCalled();
  });
});
