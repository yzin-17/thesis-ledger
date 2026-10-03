import { describe, expect, it, vi } from 'vitest';
import { currentFundRiskContext } from '../../src/risk/strategy-risk-nav-context.js';

const source = {
  position: {
    id: 'position',
    quantity: { toString: () => '10' },
    costPrice: { toString: () => '1' },
  },
  trade: { id: 'trade', openedAt: new Date('2026-09-28T00:00:00Z') },
};
const point = (day: string, price: number, fetchedAt = '2026-10-01T00:00:00Z') => ({
  version: 3,
  symbol: '110011.OF',
  unitNav: price,
  navDate: `${day}T00:00:00Z`,
  provider: 'efinance',
  fetchedAt,
  freshness: 'delayed',
});
const evaluatedAt = new Date('2026-10-02T00:00:00Z');
describe('Risk 当前基金净值消费', () => {
  it('只调用 Market 当前 Reader 并保留可见净值、数量和持有期', async () => {
    const getFundNavHistory = vi
      .fn()
      .mockResolvedValue([
        point('2026-09-28', 1),
        point('2026-09-29', 1.2),
        point('2026-09-30', 1.3),
        point('2026-10-01', 1.5, '2026-10-03T00:00:00Z'),
      ]);
    const result = await currentFundRiskContext(
      { getFundNavHistory },
      '110011.OF',
      source,
      evaluatedAt,
      true,
    );
    expect(getFundNavHistory).toHaveBeenCalledWith(
      '110011.OF',
      { end: '2026-10-02', limit: 3650 },
      { persistIdentity: false },
    );
    expect(result.context).toMatchObject({ price: '1.3', quantity: '10', holdingPeriods: 2 });
  });
  it('拒绝旧版本与错误标的，不用数据库历史数据补齐', async () => {
    for (const bad of [
      { ...point('2026-09-30', 1), version: 2 },
      { ...point('2026-09-30', 1), symbol: '000001.OF' },
    ]) {
      await expect(
        currentFundRiskContext(
          { getFundNavHistory: vi.fn().mockResolvedValue([bad]) },
          '110011.OF',
          source,
          evaluatedAt,
          true,
        ),
      ).rejects.toThrow('当前合同');
    }
  });
  it('来源不可用传播失败；未配置 Reader 明确不可用', async () => {
    await expect(
      currentFundRiskContext(
        { getFundNavHistory: vi.fn().mockRejectedValue(new Error('source unavailable')) },
        '110011.OF',
        source,
        evaluatedAt,
        false,
      ),
    ).rejects.toThrow('source unavailable');
    await expect(
      currentFundRiskContext(undefined, '110011.OF', source, evaluatedAt, false),
    ).rejects.toThrow('未配置');
  });
  it('历史窗口不足不伪造持有期，未来捕获的数据不成为当前价格', async () => {
    const market = { getFundNavHistory: vi.fn().mockResolvedValue([point('2026-09-30', 1.3)]) };
    expect(
      (await currentFundRiskContext(market, '110011.OF', source, evaluatedAt, true)).context
        .holdingPeriods,
    ).toBeUndefined();
    market.getFundNavHistory.mockResolvedValue([point('2026-09-30', 1.3, '2026-10-03T00:00:00Z')]);
    expect(
      (await currentFundRiskContext(market, '110011.OF', source, evaluatedAt, true)).context.price,
    ).toBeUndefined();
  });
});
