import { describe, expect, it, vi } from 'vitest';
import { TradeInstrumentQueryService } from '../../src/ledger/trade-instrument-query.service.js';
import { InstrumentDisplayService } from '../../src/market/instruments/instrument-display.service.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';

function fixture(failDirectory = false) {
  const groupBy = vi
    .fn()
    .mockResolvedValue([{ symbol: '000001.OF' }, { symbol: '000001.SZ' }, { symbol: '999999.OF' }]);
  const findMany = vi.fn();
  if (failDirectory) findMany.mockRejectedValue(new Error('目录暂不可用'));
  else
    findMany.mockResolvedValue([
      {
        id: 'fund',
        canonicalCode: '000001',
        instrumentType: 'MUTUAL_FUND',
        market: 'OF',
        displayName: '华夏成长混合',
        generation: 1,
        active: true,
        updatedAt: new Date(),
      },
      {
        id: 'stock',
        canonicalCode: '000001',
        instrumentType: 'STOCK',
        market: 'SZ',
        displayName: '平安银行',
        generation: 1,
        active: true,
        updatedAt: new Date(),
      },
    ]);
  const account = { findFirst: vi.fn().mockResolvedValue({ id: 'a' }) };
  const prisma = {
    trade: { groupBy },
    account,
    instrument: { findMany },
    catalogSyncState: { findUnique: vi.fn().mockResolvedValue({ generation: 1 }) },
  } as unknown as PrismaService;
  return {
    groupBy,
    findMany,
    account,
    service: new TradeInstrumentQueryService(prisma, new InstrumentDisplayService(prisma)),
  };
}

describe('交易标的选项', () => {
  it('按完整历史分组，名称批量读取并区分同代码不同市场', async () => {
    const { service, groupBy, findMany } = fixture();
    const result = await service.list({ mode: 'actual' });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['symbol'],
      where: { accountMode: 'actual', account: { mode: 'actual' } },
      orderBy: { symbol: 'asc' },
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([
      { symbol: '000001.OF', displayName: '华夏成长混合' },
      { symbol: '000001.SZ', displayName: '平安银行' },
      { symbol: '999999.OF', displayName: '999999.OF' },
    ]);
  });
  it('目录故障保留标的代码', async () => {
    const { service } = fixture(true);
    expect((await service.list({ mode: 'shadow' })).items.map((item) => item.displayName)).toEqual([
      '000001.OF',
      '000001.SZ',
      '999999.OF',
    ]);
  });
  it('选项数量覆盖超过交易页面大小的标的', async () => {
    const { service, groupBy } = fixture();
    groupBy.mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({ symbol: `${String(i).padStart(6, '0')}.OF` })),
    );
    expect((await service.list({ mode: 'actual' })).items).toHaveLength(101);
  });
  it('账户必须属于当前模式，校验失败不读取交易', async () => {
    const { service, groupBy, account } = fixture();
    account.findFirst.mockResolvedValue(null);
    await expect(service.list({ mode: 'shadow', accountId: 'a' })).rejects.toThrow(
      '当前模式下找不到该账户',
    );
    expect(groupBy).not.toHaveBeenCalled();
  });
});
