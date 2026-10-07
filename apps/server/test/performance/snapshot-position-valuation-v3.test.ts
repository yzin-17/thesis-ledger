import { describe, expect, it, vi } from 'vitest';
import { valueSnapshotPosition } from '../../src/performance/performance-snapshot-position-valuation.js';

const position = (symbol: string, assetType: string) => ({
  symbol,
  accountId: 'account-1',
  quantity: 10,
  costPrice: 80,
  asset: { assetType },
});

const selected = (status: 'complete' | 'incomplete' = 'complete') => ({
  status: 'selected',
  selection: {
    response: {
      bars: [{ timestamp: '2026-09-28T07:00:00.000Z', close: 100, completionStatus: status }],
      provenance: { providerId: 'hithink' },
    },
  },
});

describe('正式绩效估值使用精确行情窗口', () => {
  it.each([
    ['600519.SH', 'stock', 'STOCK'],
    ['159516.SZ', 'etf', 'ETF'],
  ] as const)('%s 使用当日不复权日线与真实来源', async (symbol, assetType, expectedAssetType) => {
    const bars = { readV3: vi.fn(async () => selected()) };
    const result = await valueSnapshotPosition(
      {} as never, position(symbol, assetType), 'CNY', '2026-09-28',
      { valuationBasis: 'OFFICIAL' }, bars as never,
    );
    expect(bars.readV3).toHaveBeenCalledWith({
      market: 'CN',
      symbol,
      routeKey: {
        kind: 'bar', market: 'CN', assetType: expectedAssetType,
        capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none',
      },
      window: { start: '2026-09-28', end: '2026-09-28' },
    });
    expect(result).toMatchObject({ marketValue: 1000, provider: 'hithink', stale: false, freshness: 'delayed' });
  });

  it('不可用窗口或未完成日线不产生正式价格', async () => {
    for (const response of [
      { status: 'unavailable', selection: { status: 'unavailable', reason: 'insufficient_coverage' } },
      selected('incomplete'),
    ]) {
      const bars = { readV3: vi.fn(async () => response) };
      const result = await valueSnapshotPosition(
        {} as never, position('600519.SH', 'stock'), 'CNY', '2026-09-28',
        { valuationBasis: 'OFFICIAL' }, bars as never,
      );
      expect(result).toMatchObject({ marketValue: null, provider: 'unavailable', stale: true });
    }
  });
});
