import { describe, expect, it, vi } from 'vitest';
import { PortfolioService } from '../../src/portfolio/portfolio.service.js';

describe('持仓迁移事务边界', () => {
  it('账户或标的变化时只调用一次 Ledger 复合迁移命令', async () => {
    const sourceAccountId = '11111111-1111-4111-8111-111111111111';
    const targetAccountId = '22222222-2222-4222-8222-222222222222';
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'position',
        accountId: sourceAccountId,
        symbol: '600519.SH',
        quantity: '100',
        costPrice: '10',
      })
      .mockResolvedValueOnce({
        id: 'moved-position',
        accountId: targetAccountId,
        symbol: '000001.SZ',
        quantity: '200',
        costPrice: '12',
      });
    const movePositionBaseline = vi.fn(async () => ({}));
    const setPosition = vi.fn(async () => ({}));
    const service = new PortfolioService(
      { position: { findUniqueOrThrow } } as never,
      {} as never,
      { movePositionBaseline, setPosition } as never,
    );

    await service.updatePosition('position', {
      accountId: targetAccountId,
      symbol: '000001.SZ',
      quantity: '200',
      costPrice: '12',
      source: 'manual',
      assetName: '平安银行',
      assetType: 'stock',
    });

    expect(movePositionBaseline).toHaveBeenCalledTimes(1);
    expect(movePositionBaseline).toHaveBeenCalledWith({
      positionId: 'position',
      fromAccountId: sourceAccountId,
      fromSymbol: '600519.SH',
      toAccountId: targetAccountId,
      toSymbol: '000001.SZ',
      quantity: '200',
      costPrice: '12',
      source: 'manual',
      options: { assetName: '平安银行', assetType: 'stock' },
    });
    expect(setPosition).not.toHaveBeenCalled();
  });

  it('清空持仓只调用一次 Ledger 批量命令，不在 Portfolio 层读取并循环写入', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const findMany = vi.fn(async () => [{ symbol: '600519.SH' }, { symbol: '000001.SZ' }]);
    const clearPositions = vi.fn(async () => ({ accountId, cleared: 2 }));
    const setPosition = vi.fn(async () => ({}));
    const service = new PortfolioService(
      { position: { findMany } } as never,
      {} as never,
      { clearPositions, setPosition } as never,
    );

    await expect(service.clearPositions(accountId)).resolves.toEqual({
      accountId,
      cleared: 2,
      sourceOfTruth: 'ledger',
    });

    expect(clearPositions).toHaveBeenCalledOnce();
    expect(clearPositions).toHaveBeenCalledWith(accountId);
    expect(findMany).not.toHaveBeenCalled();
    expect(setPosition).not.toHaveBeenCalled();
  });
});
