import { readFileSync } from 'node:fs';
import { barSeriesSchema, marketDataBarSeriesResponseV3Schema } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../src/index.js';

const detailResponse = {
  contractVersion: 3,
  symbol: '159516.SZ',
  assetType: 'ETF',
  identity: { source: 'symbol', status: 'confirmed' },
  requested: [],
  capabilities: { supported: [], unsupported: [] },
  limits: { bars: 30, nav: 30 },
  sections: {},
  dependencies: {},
  requestId: 'test-request',
  generatedAt: '2026-10-04T00:00:00Z',
};
describe('展示周期 SDK 传输', () => {
  it.each(['5d', '1w', '1mo', '1y'] as const)(
    '%s 传输至三端点并保留结构化拒绝',
    async (timeframe) => {
      const fetcher = vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: 'market_period_unavailable',
              message: '该行情周期尚未完成数据装配',
              details: { requestedTimeframe: timeframe, reason: 'aggregation_not_assembled' },
            }),
            { status: 503 },
          ),
      );
      const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
      const signal = new AbortController().signal;
      const params = { assetType: 'ETF' as const, timeframe, signal };
      for (const operation of [
        () => client.market.getBars('159516.SZ', params),
        () =>
          client.market.getIndicator('159516.SZ', 'MA', { ...params, parameters: { period: 5 } }),
        () => client.market.getDetail('159516.SZ', { timeframe, signal }),
      ]) {
        await expect(operation()).rejects.toMatchObject({
          status: 503,
          payload: {
            error: 'market_period_unavailable',
            details: { requestedTimeframe: timeframe },
          },
        });
      }
      for (const call of fetcher.mock.calls) {
        expect(new URL(String(call[0])).searchParams.get('timeframe')).toBe(timeframe);
        expect(call[1]).toMatchObject({ signal });
      }
      expect(String(fetcher.mock.calls[1]?.[0])).toContain('parameters=');
    },
  );
  it('旧详情省略周期仍可解析原成功响应，且不添加周期参数', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(detailResponse), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    expect(await client.market.getDetail('159516.SZ')).toEqual(detailResponse);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.has('timeframe')).toBe(false);
    expect(url.searchParams.get('chartContractVersion')).toBe('3');
  });
  it('非法展示周期在 SDK 发起请求前拒绝', () => {
    const fetcher = vi.fn();
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    expect(() => client.market.getDetail('159516.SZ', { timeframe: 'weekly' as never })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('基金拒绝错误保持 HTTP 与稳定码', async () => {
    const client = new ThesisLedgerApiClient(
      'https://thesis-ledger.test/api/v1',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'market_period_asset_unsupported' }), {
          status: 422,
        }),
      ),
    );
    await expect(
      client.market.getBars('110011.OF', { assetType: 'MUTUAL_FUND', timeframe: '1w' }),
    ).rejects.toBeInstanceOf(ThesisLedgerApiError);
  });

  it('派生请求不接受伪装成成功的日线 bars 或详情', async () => {
    const raw = marketDataBarSeriesResponseV3Schema.parse(
      JSON.parse(
        readFileSync(
          new URL('../../schemas/fixtures/market-data-v3.response.etf-qfq.json', import.meta.url),
          'utf8',
        ),
      ),
    );
    const series = barSeriesSchema.parse({
      contractVersion: 3,
      identity: { symbol: raw.symbol, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      points: raw.bars,
      coverage: raw.coverage,
      inputFingerprint: raw.inputFingerprint,
      provenance: {
        ...raw.provenance,
        providerRevision: 'test-observation',
        fetchedAt: raw.sourcePriceBasis.observedAt,
        freshUntil: raw.sourcePriceBasis.observedAt,
        servedFromCache: false,
        cacheStatus: 'miss',
      },
      chartContextV3: {
        purpose: 'interactive-chart',
        requestedStart: '2026-05-18',
        requestedEnd: '2026-05-20',
        acquisitionFingerprint: 'test-acquisition',
        sourcePriceBasis: raw.sourcePriceBasis,
      },
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(series), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);
    await expect(
      client.market.getBars(raw.symbol, { assetType: 'ETF', timeframe: '1w' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    const response = {
      ...detailResponse,
      symbol: raw.symbol,
      requested: ['bars'],
      sections: { bars: { capability: 'bars', status: 'ready', data: series } },
    };
    for (const body of [response, { ...response, barSeries: series }]) {
      fetcher.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      await expect(client.market.getDetail(raw.symbol, { timeframe: '1w' })).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
    }
  });
});
