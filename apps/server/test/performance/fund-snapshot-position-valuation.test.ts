import { describe, expect, it, vi } from 'vitest';
import { fundNavSchema } from '@thesis-ledger/schemas';
import { valueSnapshotPosition } from '../../src/performance/performance-snapshot-position-valuation.js';

const position = {
  symbol: '161725.OF',
  quantity: 100,
  costPrice: 1.25,
  asset: { assetType: 'fund' },
};
const nav = fundNavSchema.parse({
  version: 3,
  symbol: position.symbol,
  unitNav: 0.54,
  navDate: '2026-10-20T00:00:00Z',
  provider: 'controlled-fund-fixture',
  fetchedAt: '2026-10-20T12:00:00Z',
  freshness: 'delayed',
  servedFromCache: false,
});

describe('基金快照定价的可用净值边界', () => {
  it.each(['ESTIMATED', 'OFFICIAL'] as const)('%s 的零净值或不可用返回保持缺价', async (basis) => {
    for (const point of [
      { ...nav, unitNav: 0 },
      { ...nav, freshness: 'unavailable' as const },
      { ...nav, freshness: 'stale' as const },
    ]) {
      // 这些输入均为合法 wire 数据，不能靠收紧共享 Schema 隐藏消费侧问题。
      const parsed = fundNavSchema.parse(point);
      const market = {
        getFundNav: vi.fn(async () => parsed),
        getFundNavHistory: vi.fn(async () => [parsed]),
        getQuote: vi.fn(),
      };
      const result = await valueSnapshotPosition(market as never, position, 'CNY', '2026-10-20', {
        valuationBasis: basis,
      });
      expect(result).toMatchObject({ marketValue: null, provider: 'unavailable', stale: true });
      expect(market.getQuote).not.toHaveBeenCalled();
    }
  });

  it('合格基金正式价格只读估值日精确 NAV，保留原数量和成本', async () => {
    const history = vi.fn(async () => [nav]);
    const getFundNav = vi.fn();
    const result = await valueSnapshotPosition(
      { getFundNavHistory: history, getFundNav } as never,
      position,
      'CNY',
      '2026-10-20',
      { valuationBasis: 'OFFICIAL' },
    );
    expect(history).toHaveBeenCalledWith(
      position.symbol,
      { start: '2026-10-20', end: '2026-10-20', limit: 10 },
      { persistIdentity: false },
    );
    expect(getFundNav).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      marketValue: 54,
      quantity: 100,
      costPrice: 1.25,
      nativeCostValue: 125,
      provider: nav.provider,
      stale: false,
      valuationEvidence: { kind: 'fund-nav', date: '2026-10-20', unitNav: 0.54 },
    });
  });
});
