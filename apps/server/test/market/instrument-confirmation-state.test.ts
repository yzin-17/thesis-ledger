import { describe, expect, it, vi } from 'vitest';
import { InstrumentSearchService } from '../../src/market/instruments/instrument-search.service.js';

const item = (id: string, market = 'SH', canonicalCode = '600036') => ({
  id, market, canonicalCode, instrumentType: 'STOCK', displayName: '招商银行', active: true,
  pinyin: 'zhaoshangyinhang', pinyinInitials: 'zsyh', searchAliases: [], generation: 1,
});

describe('目录已确认状态投影', () => {
  it('同名跨市场按完整身份投影，支持状态与已确认状态分离，结果批量查询一次', async () => {
    const findMany = vi.fn(async () => [{ instrumentId: 'a', symbol: '600036.SH' }]);
    const service = new InstrumentSearchService({
      $queryRaw: vi.fn(async () => [item('a'), item('b', 'SZ'), item('jp', 'JP', '03968')]),
      instrumentAssetAssociation: { findMany },
    } as never);
    const result = await service.search('招商银行');
    expect(result.find((row) => row.id === 'a')).toMatchObject({ confirmable: true, confirmed: true });
    expect(result.find((row) => row.id === 'b')).toMatchObject({ confirmable: true, confirmed: false });
    expect(result.find((row) => row.id === 'jp')).toMatchObject({ confirmable: false, confirmed: false, disabledReason: 'unsupported_market' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { instrumentId: { in: ['a','b'] }, symbol: { in: ['600036.SH','600036.SZ'] },
        status: 'active', confirmedAt: { not: null }, asset: { identityStatus: 'confirmed' } },
      select: { instrumentId: true, symbol: true },
    });
  });

  it('关联目录 ID 或完整代码不匹配不能标记已确认', async () => {
    const service = new InstrumentSearchService({
      $queryRaw: vi.fn(async () => [item('a'), item('b', 'SZ')]),
      instrumentAssetAssociation: { findMany: vi.fn(async () => [
        { instrumentId: 'other-id', symbol: '600036.SH' },
        { instrumentId: 'a', symbol: '600036.SZ' },
      ]) },
    } as never);
    expect((await service.search('招商银行')).map((row) => row.confirmed)).toEqual([false,false]);
  });

  it('没有候选或全部不支持时不读取关联', async () => {
    const findMany = vi.fn();
    const service = new InstrumentSearchService({
      $queryRaw: vi.fn(async () => [item('jp', 'JP', '03968')]),
      instrumentAssetAssociation: { findMany },
    } as never);
    expect(await service.search('')).toEqual([]);
    expect(await service.search('zzzzzz')).toEqual([]);
    expect(await service.search('招商银行')).toMatchObject([{ confirmed: false }]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('关联读取失败使查询失败，不生成未确认结果', async () => {
    const service = new InstrumentSearchService({
      $queryRaw: vi.fn(async () => [item('a')]),
      instrumentAssetAssociation: { findMany: vi.fn(async () => { throw new Error('association unavailable'); }) },
    } as never);
    await expect(service.search('招商银行')).rejects.toThrow('association unavailable');
  });

  it('搜索降级至目录查询时仍读取实际关联', async () => {
    const service = new InstrumentSearchService({
      $queryRaw: vi.fn(async () => { throw new Error('pg_trgm unavailable'); }),
      instrument: { findMany: vi.fn(async () => [item('a')]) },
      instrumentAssetAssociation: { findMany: vi.fn(async () => [{ instrumentId: 'a', symbol: '600036.SH' }]) },
    } as never);
    expect(await service.search('招商银行')).toMatchObject([{ confirmed: true }]);
  });
});
