import { expect, it, vi } from 'vitest';
import { requestPlannedMarketDetail, ThesisLedgerApiClient } from '../src/index.js';

it('规划使用同一市场截止日，detail保留精确锚点', async () => {
  const anchor = '2026-11-04T00:00:00+08:00';
  const fetcher = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/chart-options'))
      return new Response(
        JSON.stringify({
          contractVersion: 3,
          symbol: '159516.SZ',
          mode: 'v3',
          window: { start: '2025-01-01', end: '2026-11-04' },
          plan: { barsLimit: 180, indicatorParams: {}, end: '2026-11-04' },
          options: ['none', 'qfq', 'hfq'].map((adjustment) => ({
            adjustment,
            available: true,
            reason: null,
          })),
        }),
      );
    return new Response(
      JSON.stringify({
        contractVersion: 3,
        symbol: '159516.SZ',
        assetType: 'ETF',
        identity: { source: 'asset', status: 'confirmed' },
        requested: ['bars'],
        capabilities: { supported: ['bars'], unsupported: [] },
        limits: { bars: 180, nav: 90, barsHasMoreBefore: false },
        sections: { bars: { capability: 'bars', status: 'empty', data: null } },
        dependencies: {},
        requestId: 'anchor-test',
        generatedAt: '2026-11-04T08:00:00Z',
      }),
    );
  });
  const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
  await requestPlannedMarketDetail(client.market, {
    symbol: '159516.SZ',
    include: ['bars'],
    chartContractVersion: 3,
    barsLimit: 180,
    calculationAnchor: anchor,
  });
  const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
  expect(urls).toHaveLength(2);
  expect(urls[0]!.searchParams.get('planEnd')).toBe('2026-11-04');
  expect(urls[1]!.searchParams.get('calculationAnchor')).toBe(anchor);
  expect(urls[1]!.searchParams.get('end')).toBe('2026-11-04');
});

it('窗口冲突在规划前拒绝，不发服务端请求', async () => {
  const fetcher = vi.fn();
  const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
  await expect(
    requestPlannedMarketDetail(client.market, {
      symbol: '159516.SZ',
      end: '2026-11-05',
      calculationAnchor: '2026-11-04T00:00:00+08:00',
    }),
  ).rejects.toThrow('end必须');
  expect(fetcher).not.toHaveBeenCalled();
});
