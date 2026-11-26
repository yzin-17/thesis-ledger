import { expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

it('详情 HTTP 合同不丢失报价回退诊断和原始时间', async () => {
  const staleReason = { code: 'timeout', message: '数据源请求超时。', httpStatus: 504 };
  const quote = {
    version: 3, symbol: '600519.SH', price: 10, open: 10, high: 11, low: 9,
    previousClose: 10, volume: null, amount: null, provider: 'fixture',
    stale: true, freshness: 'stale', marketTime: '2026-11-06T07:00:00Z',
    fetchedAt: '2026-11-09T02:00:00Z', refreshFailure: 'fetch_failed', staleReason,
    sessionContext: { session: 'closed_snapshot', evaluatedAt: '2026-11-09T02:00:00Z', latestTradingDate: '2026-11-06', calendarRevision: 'verified' },
  };
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({
    contractVersion: 1, symbol: quote.symbol, assetType: 'STOCK',
    requestId: 'controlled', generatedAt: quote.fetchedAt,
    identity: { source: 'asset', status: 'confirmed' }, requested: ['quote'],
    capabilities: { supported: ['quote'], unsupported: [] }, limits: { bars: 90, nav: 90 },
    dependencies: {}, sections: { quote: { capability: 'quote', status: 'stale', data: quote } },
  }));
  const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
  const result = await client.market.getDetail(quote.symbol, { include: ['quote'] });
  expect(result.sections.quote?.data).toEqual(quote);
  expect(result.sections.quote?.data?.staleReason).toEqual(staleReason);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
