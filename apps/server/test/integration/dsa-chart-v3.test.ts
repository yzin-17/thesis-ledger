import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  marketDataBarSeriesResponseV3Schema,
  type MarketChartBarsRequestV3,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';

const setup = () => {
  const { coverageProof: _proof, ...base } = marketDataBarSeriesResponseV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  void _proof;
  const response = { ...base, purpose: 'interactive-chart' };
  response.bars.at(-1)!.completionStatus = 'incomplete';
  response.coverage.latestCompleteTradingDate = '2026-05-19';
  const request: MarketChartBarsRequestV3 = {
    contractVersion: 3,
    purpose: 'interactive-chart',
    requestId: response.requestId,
    symbol: response.symbol,
    routeKey: response.routeKey,
    start: response.coverage.requestedStart,
    end: response.coverage.requestedEnd,
    routeTarget: {
      providerId: response.provenance.providerId,
      upstreamSource: response.provenance.upstreamSource,
      routeIndex: 0,
    },
  };
  const client = Object.assign(Object.create(DsaClient.prototype), {
    config: {
      dsaBaseUrl: 'https://dsa.example.test',
      dsaTimeoutMs: 5000,
      dsaToken: 'test-data-token',
    },
  }) as DsaClient;
  return { request, response, client };
};

describe('DSA 图表 V3 传输', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('独立端点使用 Data Token 并保留未收盘数据', async () => {
    const { request, response, client } = setup();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => response }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await client.marketChartBarsV3(request)).bars.at(-1)?.completionStatus).toBe(
      'incomplete',
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v3/thesis-ledger/market/chart-bars');
    expect(init.headers).toMatchObject({ authorization: 'Bearer test-data-token' });
    expect(JSON.parse(String(init.body))).toEqual(request);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['requestId', 'source', 'window', 'purpose'])('拒绝错配的 %s 响应', async (kind) => {
    const { request, response, client } = setup();
    if (kind === 'requestId') response.requestId = 'other';
    if (kind === 'source') response.provenance.upstreamSource = 'other';
    if (kind === 'window') response.coverage.requestedStart = '2026-05-17';
    if (kind === 'purpose') response.purpose = 'complete';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => response })),
    );
    await expect(client.marketChartBarsV3(request)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });

  it('透传安全错误分类且不自动切换端点重试', async () => {
    const { request, client } = setup();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        contractVersion: 3,
        requestId: request.requestId,
        error: { code: 'unsupported_price_basis', message: '来源不支持请求的价格口径' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.marketChartBarsV3(request)).rejects.toMatchObject({
      code: 'unsupported-capability',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
