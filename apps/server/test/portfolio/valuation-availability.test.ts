import { expect, it, vi } from 'vitest';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import { MarketCacheControl } from '../../src/market/market-cache-control.js';
import { valuePortfolioPosition } from '../../src/portfolio/portfolio-position-valuation.js';

const position = { symbol: '000001.OF', quantity: 90, costPrice: 1.22 };
it.each(['disabled', 'not_selected', 'not_eligible'] as const)('控制原因 %s 从围栏传至估值，缺值不标陈旧', async (reason) => {
  const control = new MarketCacheControl({ marketCacheContextV3: vi.fn(async () => ({ ready: false, reason })) } as never);
  const value = await valuePortfolioPosition(position, 'CNY', {
    getQuote: vi.fn(),
    getFundNav: async () => { await control.read({ capability: 'FUND_NAV', symbol: position.symbol }); throw new Error('不应继续'); },
  });
  expect(value).toMatchObject({ marketPrice: null, marketValue: null, pnl: null, stale: false, availabilityReason: reason });
  expect(position).toEqual({ symbol: '000001.OF', quantity: 90, costPrice: 1.22 });
});
it('普通来源异常保留不可估值，不通过中文文本猜测控制原因', async () => {
  const value = await valuePortfolioPosition(position, 'CNY', { getQuote: vi.fn(), getFundNav: async () => { throw new DsaError('not_selected 功能未启用', 'unavailable'); } });
  expect(value).toMatchObject({ stale: false, availabilityReason: 'unavailable', marketPrice: null });
});
it.each(['delayed', 'stale'])('有效基金净值 %s 保留真实日期、金额和前一净值口径', async (freshness) => {
  const value = await valuePortfolioPosition(position, 'CNY', {
    getQuote: vi.fn(),
    getFundNav: async () => ({ unitNav: 0.895, navDate: '2026-11-03T00:00:00Z', freshness }),
    getFundNavHistory: async () => [{ unitNav: 0.939, navDate: '2026-11-02T00:00:00Z' }, { unitNav: 0.895, navDate: '2026-11-03T00:00:00Z' }],
  });
  expect(value).toMatchObject({ navDate: '2026-11-03T00:00:00Z', marketPrice: 0.895, previousClose: 0.939, marketValue: 80.55, stale: freshness === 'stale' });
  expect(value).not.toHaveProperty('availabilityReason');
});
