import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../../src/index.js';
const instrument = { market: 'CN', assetType: 'ETF', symbol: '510300.SH' } as const;
const input = { instrument, publishedStart: null, publishedEnd: null, limit: 5 };
const unavailable = {
  instrument,
  status: 'unavailable',
  items: [],
  fetchedAt: null,
  source: null,
  upstreamAttempts: 0,
  nextCursor: null,
  cacheIdentity: null,
  coverage: {
    basis: 'current-search',
    publishedStart: null,
    publishedEnd: null,
    complete: false,
    truncated: false,
    unknownPublishedTimeCount: 0,
    examinedCount: null,
    returnedCount: 0,
    uniqueEvidenceCount: 0,
    missingReasons: ['not_admitted'],
  },
  errors: [
    { code: 'not_admitted', message: '当前范围未准入', providerId: null, upstreamSource: null },
  ],
};
describe('C06b 资讯与资料共享合同', () => {
  it('新闻使用独立 API 前缀和取消信号，未准入保留零尝试及原因', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(unavailable));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    expect(await api.market.getNews(input, signal)).toMatchObject({
      status: 'unavailable',
      upstreamAttempts: 0,
    });
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://ledger.test/api/market-data/news');
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).instrument).toEqual(instrument);
  });
  it('错标的、错时间窗口及公告页码不允许混入当前响应', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...unavailable, instrument: { ...instrument, symbol: '510500.SH' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          providerId: 'official-states',
          items: [],
          total: 100,
          page: 1,
          pageSize: 30,
        }),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(api.market.getNews(input)).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(
      api.market.getAnnouncements({ q: '510300', page: 2, pageSize: 30 }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('公告筛选与分页完整，参数无效时不请求', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        providerId: 'official-states',
        items: [],
        total: 0,
        page: 2,
        pageSize: 30,
      }),
    );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await api.market.getAnnouncements({ q: '规则', page: 2, pageSize: 30 });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: '规则', page: '2', pageSize: '30' });
    expect(() => api.market.getAnnouncements({ page: 0 })).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
