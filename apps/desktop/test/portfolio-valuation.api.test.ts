import { expect, it, vi } from 'vitest';
import { fetchPortfolioValuation } from '../src/features/portfolio/portfolio.api.js';
it('桌面响应归一化保留未估值原因和来源净值日期，不改写输入', async () => {
  const raw = { positions: [{ id: 'p1', accountId: 'a1', symbol: '000001.OF', quantity: 90, costPrice: 1.22, marketPrice: null, marketValue: null, pnl: null, stale: false, availabilityReason: 'not_selected', navDate: '2026-11-03T00:00:00Z', asset: { name: '华夏成长混合', assetType: 'fund' } }], mode: 'actual', partial: true, valuedAt: '2026-11-04T08:00:00Z' };
  const before = structuredClone(raw);
  const request = vi.fn(async () => raw);
  const result = await fetchPortfolioValuation('actual', undefined, { request } as never);
  expect(result.positions[0]).toMatchObject({ availabilityReason: 'not_selected', navDate: '2026-11-03T00:00:00Z', marketPrice: null, stale: false });
  expect(raw).toEqual(before);
});
