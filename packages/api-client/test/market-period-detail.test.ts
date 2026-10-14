import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { MarketDetailResponse, MarketDisplayDetailResponse } from '@thesis-ledger/schemas';
import { marketDisplayDetailFixture } from '../../schemas/test/fixtures/market-display-detail.js';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

describe('派生详情与周期能力 SDK', () => {
  it('派生详情实际解析，保留周期/口径/参数和 signal', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(marketDisplayDetailFixture())));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    const result = await client.market.getDetail('159516.SZ', {
      timeframe: '1w',
      barsLimit: 1,
      include: ['bars', 'indicator:MA'],
      adjustment: 'qfq',
      indicatorParams: { period: 5 },
      signal,
    });
    expect(result.barSeries?.identity.timeframe).toBe('1w');
    expect(result.sections['indicator:MA']?.data).toMatchObject({
      calculationInput: { pointCount: 60 },
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get('timeframe')).toBe('1w');
    expect(url.searchParams.get('barsLimit')).toBe('1');
    expect(url.searchParams.get('indicatorParams')).toBe('{"period":5}');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ signal });
  });
  it('原生默认/显式类型保持原生，动态及派生类型是展示联合合同', () => {
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1');
    const native = () => client.market.getDetail('159516.SZ');
    const daily = () => client.market.getDetail('159516.SZ', { timeframe: '1d' });
    const derived = () => client.market.getDetail('159516.SZ', { timeframe: '1w' });
    expectTypeOf(native).returns.resolves.toEqualTypeOf<MarketDetailResponse>();
    expectTypeOf(daily).returns.resolves.toEqualTypeOf<MarketDetailResponse>();
    expectTypeOf(derived).returns.resolves.toEqualTypeOf<MarketDisplayDetailResponse>();
  });
  it.each([undefined, null, []])('空分段 %j 不参与价格序列身份校验', async (data) => {
    const response = {
      ...marketDisplayDetailFixture(),
      barSeries: undefined,
      requested: ['bars'],
      capabilities: { supported: ['bars'], unsupported: [] },
      sections: { bars: { capability: 'bars', status: 'empty', data } },
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response)));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    for (const timeframe of ['1d', '1w'] as const) {
      const result = await client.market.getDetail('159516.SZ', { timeframe, include: ['bars'] });
      expect(result.sections.bars).toEqual({ capability: 'bars', status: 'empty', data });
      expect(result.barSeries).toBeUndefined();
    }
  });
  it('拒绝错周期/口径或 bars 指纹漂移，默认日线不接受派生', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(marketDisplayDetailFixture())));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    for (const params of [
      { timeframe: '1mo' as const },
      { timeframe: '1w' as const, adjustment: 'hfq' as const },
      {},
    ])
      await expect(client.market.getDetail('159516.SZ', params)).rejects.toBeInstanceOf(
        ThesisLedgerContractError,
      );
    const wrong = marketDisplayDetailFixture();
    wrong.sections.bars.data = { ...wrong.barSeries, inputFingerprint: 'c'.repeat(64) };
    fetcher.mockImplementation(async () => new Response(JSON.stringify(wrong)));
    await expect(client.market.getDetail('159516.SZ', { timeframe: '1w' })).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('周期 options 使用独立入口，传窗口/指标参数，校验响应口径', async () => {
    const response = {
      version: 'market-period-options-v1',
      symbol: '159516.SZ',
      assetType: 'ETF',
      adjustment: 'qfq',
      evaluationAsOf: '2026-10-04T00:00:00Z',
      options: ['5d', '1w', '1mo', '1y'].map((timeframe) => ({
        timeframe,
        kind: 'derived',
        limit: 2,
        available: false,
        reason: 'route_not_configured',
        indicators: ['MA', 'MACD', 'RSI'].map((name) => ({
          name,
          parameters: {},
          available: false,
          reason: 'route_not_configured',
        })),
      })),
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response)));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    expect(
      (
        await client.market.getPeriodOptions('159516.SZ', {
          barsLimit: 2,
          start: '2026-01-01',
          end: '2026-10-02',
          indicatorParams: { period: 5 },
          signal,
        })
      ).options,
    ).toHaveLength(4);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/market/159516.SZ/period-options');
    expect(url.searchParams.get('start')).toBe('2026-01-01');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ signal });
    await expect(
      client.market.getPeriodOptions('159516.SZ', { adjustment: 'hfq' }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
});
