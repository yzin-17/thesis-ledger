import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  desiredProviderPolicyV3Schema, effectiveProviderPolicyV3Schema,
  marketRouteCatalogV3Schema, marketChartBarsResponseV3Schema,
  marketDataBarSeriesResponseV3Schema, type MarketChartBarsRequestV3,
} from '@thesis-ledger/schemas';
import { MarketChartReaderV3 } from '../../src/market/market-chart-reader-v3.js';
import { planMarketChartWindow } from '../../src/market/market-chart-window.js';
import { marketChartRequest } from '../../src/market/market-chart-request.js';
import { parseChartOptionsQuery, planChartOptionsRequest } from '../../src/market/market-chart-options-request.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));

function setup(market: 'HK' | 'US', assetType: 'ETF' | 'STOCK', symbol: string) {
  const desired = desiredProviderPolicyV3Schema.parse(fixture('market-route-v3.etf-qfq.json'));
  const effective = effectiveProviderPolicyV3Schema.parse(fixture('market-control-v3.effective.etf-qfq.json'));
  const catalog = marketRouteCatalogV3Schema.parse(fixture('market-route-catalog-v3.complete.json'));
  const key = { kind: 'bar' as const, market, assetType, capability: 'MINUTE_BAR' as const,
    timeframe: '1m' as const, adjustment: 'none' as const };
  const target = { providerId: 'futu', upstreamSource: 'futu' };
  desired.routes = [{ key, targets: [target] }];
  effective.routes = [{ key, targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }], reason: null }];
  catalog.entries = [{ key, target, state: 'ready' }];
  const original = marketDataBarSeriesResponseV3Schema.parse(fixture('market-data-v3.response.etf-qfq.json'));
  const { coverageProof: _proof, ...base } = original;
  void _proof;
  const offset = market === 'HK' ? '+08:00' : '-04:00';
  const bars = original.bars.slice(0, 2).map((point, index) => ({
    ...point, timestamp: `2026-05-18T09:3${index}:00${offset}`, availableAt: '2026-05-18T14:00:00Z',
  }));
  const response = marketChartBarsResponseV3Schema.parse({ ...base, routeKey: key, symbol,
    purpose: 'interactive-chart', session: 'regular', bars,
    coverage: { requestedStart: '2026-05-18', requestedEnd: '2026-05-18',
      actualStart: bars[0]!.timestamp, actualEnd: bars[1]!.timestamp,
      hasMoreBefore: false, latestCompleteTradingDate: null },
    provenance: { ...base.provenance, ...target, effectivePolicyRevision: effective.revision, routeIndex: 0 },
    sourcePriceBasis: { ...base.sourcePriceBasis, adjustment: 'none', observedAt: '2026-05-18T14:00:00Z' },
  });
  const control = { getPolicy: vi.fn(async () => ({ ...desired, syncState: 'applied', effectiveStale: false })) };
  const dsa = {
    effectiveControlPolicyV3: vi.fn(async () => ({ projection: { effective } })),
    marketRouteCatalogV3: vi.fn(async () => catalog),
    marketChartBarsV3: vi.fn(async (request: MarketChartBarsRequestV3) => ({ ...response, requestId: request.requestId })),
  };
  return { reader: new MarketChartReaderV3(control as never, dsa as never), control, dsa, response };
}

describe('富途分钟图表 Server 消费', () => {
  it.each([
    ['HK', 'STOCK', '00700.HK'], ['HK', 'ETF', '02800.HK'],
    ['US', 'STOCK', 'AAPL.US'], ['US', 'ETF', 'SPY.US'],
  ] as const)('%s %s 用分钟精确路由且保留同日点位与时段', async (market, assetType, symbol) => {
    const { reader, dsa } = setup(market, assetType, symbol);
    const result = await reader.read({ identity: { symbol, assetType, timeframe: '1m', adjustment: 'none' },
      acceptance: 'interactive', window: { start: '2026-05-18', end: '2026-05-18' } });
    expect(result.points).toHaveLength(2);
    expect(result.coverage.latestCompleteTradingDate).toBeNull();
    expect(result.chartContextV3?.session).toBe('regular');
    expect(result.identity.timeframe).toBe('1m');
    expect(dsa.marketChartBarsV3).toHaveBeenCalledWith(expect.objectContaining({
      routeKey: expect.objectContaining({ capability: 'MINUTE_BAR', timeframe: '1m', adjustment: 'none' }),
    }));
    const options = await reader.options({ symbol, assetType, timeframe: '1m' });
    expect(options.timeframe).toBe('1m');
    expect(options.options).toEqual([
      { adjustment: 'none', available: true, reason: null },
      { adjustment: 'qfq', available: false, reason: 'unsupported_adjustment' },
      { adjustment: 'hfq', available: false, reason: 'unsupported_adjustment' },
    ]);
  });

  it('分钟窗口有界并按市场当地日期规划，日线既有跨度保持', () => {
    const end = '2026-05-18T21:00:00Z';
    expect(planMarketChartWindow({ end, limit: 90 }, { symbol: 'SPY.US', timeframe: '1m' }))
      .toEqual({ start: '2026-05-11', end: '2026-05-18' });
    expect(planMarketChartWindow({ end, limit: 90 }, { symbol: '00700.HK', timeframe: '1m' }))
      .toEqual({ start: '2026-05-12', end: '2026-05-19' });
    expect(planMarketChartWindow({ end: '2026-05-18', limit: 90 }).start).toBe('2025-05-18');
  });

  it('分钟请求默认不复权并在读取前拒绝非法市场和口径', () => {
    expect(marketChartRequest('SPY.US', { timeframe: '1m', assetType: 'ETF' }).identity.adjustment).toBe('none');
    expect(() => marketChartRequest('SPY.US', { timeframe: '1m', adjustment: 'qfq', assetType: 'ETF' })).toThrow();
    expect(() => marketChartRequest('600519.SH', { timeframe: '1m', assetType: 'STOCK' })).toThrow();
  });

  it('港美只读规划允许显式类型，并在规划中回显而不改变本地未知身份', () => {
    const query = parseChartOptionsQuery({ start: undefined, end: undefined, barsLimit: '180',
      indicatorParams: '{}', planEnd: '2026-05-18', timeframe: '1m', assetType: 'ETF' });
    const identity = { symbol: 'SPY.US', assetType: 'UNKNOWN' };
    const selected = planChartOptionsRequest(identity, query);
    expect(selected.identity).toEqual({ symbol: 'SPY.US', assetType: 'ETF', timeframe: '1m' });
    expect(selected.plan?.assetType).toBe('ETF');
    expect(identity.assetType).toBe('UNKNOWN');
    expect(() => planChartOptionsRequest({ symbol: 'SPY.US', assetType: 'STOCK' }, query)).toThrow();
    expect(() => planChartOptionsRequest({ symbol: '510300.SH', assetType: 'UNKNOWN' }, query)).toThrow();
  });

  it('没有显式类型的未知身份保持未知，非法显式类型在身份查询前拒绝', () => {
    const base = { start: undefined, end: undefined, barsLimit: undefined,
      indicatorParams: undefined, planEnd: undefined, timeframe: '1m' };
    const selected = planChartOptionsRequest({ symbol: 'SPY.US', assetType: 'UNKNOWN' }, parseChartOptionsQuery(base));
    expect(selected.identity.assetType).toBe('UNKNOWN');
    expect(() => parseChartOptionsQuery({ ...base, assetType: 'INDEX' })).toThrow();
  });

  it('恢复无分钟路由的策略后返回控制拒绝且不调用价格上游', async () => {
    const { reader, control, dsa } = setup('US', 'ETF', 'SPY.US');
    const policy = await control.getPolicy();
    control.getPolicy.mockResolvedValue({ ...policy, routes: [] });
    await expect(reader.read({ identity: { symbol: 'SPY.US', assetType: 'ETF', timeframe: '1m', adjustment: 'none' },
      acceptance: 'interactive', window: { start: '2026-05-18', end: '2026-05-18' } }))
      .rejects.toMatchObject({ code: 'control-rejected' });
    expect(dsa.marketChartBarsV3).not.toHaveBeenCalled();
  });
});
