import { expect, it, vi } from 'vitest';
import { PerformanceValuationSeriesService } from '../../src/performance/performance-valuation-series.service.js';

it('未知披露时间不能用于基金估值采样，且不请求持仓价格', async () => {
  const getQuote = vi.fn();
  const read = vi.fn();
  const upsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
  const service = new PerformanceValuationSeriesService(
    {
      account: { findMany: vi.fn(async () => [{ id: 'account-1' }]) },
      position: { findMany: vi.fn(async () => [{ symbol: '000001.OF', quantity: 100 }]) },
      accountValuationPoint: { upsert },
    } as never,
    { layers: vi.fn(async () => ({ account: [{ accountId: 'account-1', marketValue: 100, cashValue: 0, partial: false }] })) } as never,
    {} as never,
    {
      getFundNav: vi.fn(async () => ({ unitNav: 1, navDate: '2026-09-24T00:00:00Z' })),
      getFundHoldings: vi.fn(async () => ({ disclosureDate: null, holdings: [{ symbol: '600519.SH', weight: 0.1 }] })),
      getQuote,
    } as never,
    { read } as never,
  );
  await service.sample(new Date('2026-09-27T04:00:00Z'));
  expect(upsert.mock.calls[0]?.[0].create).toMatchObject({
    marketValue: 100, disclosureCoverage: 0, pricedCoverage: 0, dataQuality: 'LOW_COVERAGE',
  });
  expect(getQuote).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
