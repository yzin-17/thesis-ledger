import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

const aapl = { symbol: 'AAPL.US', assetType: 'STOCK' as const };
const spy = { symbol: 'SPY.US', assetType: 'ETF' as const };
const unavailable = (identity: typeof aapl | typeof spy) => ({
  identity,
  status: 'unavailable',
  error: { code: 'market_quote_unavailable', reason: 'not_selected' },
});
describe('显式批量行情客户端', () => {
  it('单次POST保留原请求数、首次去重顺序、逐证券失败及中断信号', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        version: 'market-quote-batch-v1',
        requestedCount: 3,
        results: [unavailable(aapl), unavailable(spy)],
      }),
    );
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    const result = await client.market.getQuotes({ items: [aapl, spy, aapl] }, signal);
    expect(result.results).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://ledger.test/api/market/quotes');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', signal });
  });
  it('拒绝顺序错绑和缺项，而非将结果对错证券', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        version: 'market-quote-batch-v1',
        requestedCount: 2,
        results: [unavailable(spy), unavailable(aapl)],
      }),
    );
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(client.market.getQuotes({ items: [aapl, spy] })).rejects.toThrow();
    fetcher.mockResolvedValueOnce(
      Response.json({
        version: 'market-quote-batch-v1',
        requestedCount: 2,
        results: [unavailable(aapl)],
      }),
    );
    await expect(client.market.getQuotes({ items: [aapl, spy] })).rejects.toThrow();
  });
  it('空集合及超预算零发送', () => {
    const fetcher = vi.fn();
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(() => client.market.getQuotes({ items: [] })).toThrow();
    expect(() =>
      client.market.getQuotes({ items: Array.from({ length: 101 }, () => aapl) }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
