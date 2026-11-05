import { describe, expect, it, vi } from 'vitest';
import { InstrumentDisplayService } from '../src/market/instruments/instrument-display.service.js';
import { PortfolioService } from '../src/portfolio/portfolio.service.js';
import { displayPrisma } from './instrument-display.fixture.js';

describe('当前标的名称公共读取', () => {
  it('批量去重并按市场精确解析，未知项回退代码', async () => {
    const prisma = displayPrisma();
    const names = await new InstrumentDisplayService(prisma as never).resolve([
      '000001.OF',
      ' 000001.of ',
      '000001.SZ',
      '999999.OF',
    ]);
    expect(names.name('000001.of')).toBe('华夏成长混合');
    expect(names.name('000001.SZ')).toBe('平安银行');
    expect(names.name('999999.OF')).toBe('999999.OF');
    expect(prisma.instrument.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.instrument.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        OR: [
          { canonicalCode: '000001', market: 'OF' },
          { canonicalCode: '000001', market: 'SZ' },
          { canonicalCode: '999999', market: 'OF' },
        ],
      },
    });
  });

  it('目录故障仍返回业务行和代码，且不改写输入', async () => {
    const prisma = displayPrisma();
    prisma.instrument.findMany.mockRejectedValueOnce(new Error('目录不可用'));
    const rows = [{ symbol: '000001.OF', asset: { name: '旧名' }, quantity: 90 }];
    const result = await new InstrumentDisplayService(prisma as never).nameAssets(rows);
    expect(result).toEqual([{ ...rows[0], asset: { name: '000001.OF' } }]);
    expect(rows[0]?.asset.name).toBe('旧名');
  });

  it('空集合不查询目录', async () => {
    const prisma = displayPrisma();
    expect(await new InstrumentDisplayService(prisma as never).nameAssets([])).toEqual([]);
    expect(prisma.instrument.findMany).not.toHaveBeenCalled();
  });

  it('可展示历史 inactive 目录，同优先级名称歧义时回退代码', async () => {
    const prisma = displayPrisma();
    const items = (await prisma.instrument.findMany({})).filter((row) => row.market === 'OF');
    prisma.instrument.findMany.mockResolvedValue(items.map((row) => ({ ...row, active: false })));
    const service = new InstrumentDisplayService(prisma as never);
    expect((await service.resolve(['000001.OF'])).name('000001.OF')).toBe('华夏成长混合');
    prisma.instrument.findMany.mockResolvedValue([
      ...items,
      ...items.map((row) => ({ ...row, id: 'conflict', displayName: '另一名称' })),
    ]);
    expect((await service.resolve(['000001.OF'])).name('000001.OF')).toBe('000001.OF');
  });

  it('持仓读接口与估值覆盖陈旧名称，多账户同代码只查一批且保留数量成本', async () => {
    const rows = ['a', 'b'].map((accountId) => ({
      id: accountId,
      accountId,
      symbol: '000001.OF',
      quantity: 90,
      costPrice: 1.22,
      asset: { name: accountId === 'a' ? '000001.OF' : '历史旧名', currency: 'CNY' },
    }));
    const prisma = { ...displayPrisma(), position: { findMany: vi.fn(async () => rows) } };
    const service = new PortfolioService(prisma as never, {} as never);
    const positions = await service.listPositions();
    expect(positions.map((row) => row.asset.name)).toEqual(['华夏成长混合', '华夏成长混合']);
    expect(prisma.instrument.findMany).toHaveBeenCalledTimes(1);
    const portfolio = await service.value();
    expect(portfolio.positions.map((row) => row.asset.name)).toEqual([
      '华夏成长混合',
      '华夏成长混合',
    ]);
    expect(portfolio.positions[0]).toMatchObject({
      quantity: 90,
      costPrice: 1.22,
      marketPrice: null,
    });
    expect(rows[0]?.asset.name).toBe('000001.OF');
    expect(rows[1]?.asset.name).toBe('历史旧名');
  });
});
