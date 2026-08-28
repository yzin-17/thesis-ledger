import { describe, expect, it, vi } from 'vitest';
import { PortfolioService } from '../../src/portfolio/portfolio.service.js';

describe('持仓迁移事务边界', () => {
  it('账户或标的变化时先归零旧位置再写入新位置', async () => {
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
    const setPosition = vi.fn(async () => ({}));
    const service = new PortfolioService(
      { position: { findUniqueOrThrow } } as never,
      {} as never,
      { setPosition } as never,
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

    expect(setPosition).toHaveBeenCalledTimes(2);
    expect(setPosition).toHaveBeenNthCalledWith(
      1,
      sourceAccountId,
      '600519.SH',
      '0',
      '10',
      'manual',
      '手工修改持仓并迁移原标的',
    );
    expect(setPosition).toHaveBeenNthCalledWith(
      2,
      targetAccountId,
      '000001.SZ',
      '200',
      '12',
      'manual',
      '手工修改持仓',
      { assetName: '平安银行', assetType: 'stock' },
    );
  });
});
