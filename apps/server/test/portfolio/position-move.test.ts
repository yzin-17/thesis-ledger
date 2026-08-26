import { describe, expect, it, vi } from 'vitest';
import { PortfolioService } from '../../src/portfolio/portfolio.service.js';

describe('持仓迁移事务边界', () => {
  it('账户或标的变化时只调用一次 Ledger movePosition', async () => {
    const sourceAccountId = '11111111-1111-4111-8111-111111111111';
    const targetAccountId = '22222222-2222-4222-8222-222222222222';
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'position',
        accountId: sourceAccountId,
        symbol: '600519.SH',
        quantity: 100,
        costPrice: 10,
      })
      .mockResolvedValueOnce({
        id: 'moved-position',
        accountId: targetAccountId,
        symbol: '000001.SZ',
        quantity: 200,
        costPrice: 12,
      });
    const setPosition = vi.fn(async () => ({}));
    const movePosition = vi.fn(async () => ({}));
    const service = new PortfolioService(
      { position: { findUniqueOrThrow } } as never,
      {} as never,
      { setPosition, movePosition } as never,
    );

    await service.updatePosition('position', {
      accountId: targetAccountId,
      symbol: '000001.SZ',
      quantity: 200,
      costPrice: 12,
      source: 'manual',
      assetName: '平安银行',
      assetType: 'stock',
    });

    expect(movePosition).toHaveBeenCalledOnce();
    expect(movePosition).toHaveBeenCalledWith(
      { accountId: sourceAccountId, symbol: '600519.SH', costPrice: 10 },
      {
        accountId: targetAccountId,
        symbol: '000001.SZ',
        quantity: 200,
        costPrice: 12,
      },
      'manual',
      { assetName: '平安银行', assetType: 'stock' },
    );
    expect(setPosition).not.toHaveBeenCalled();
  });
});
