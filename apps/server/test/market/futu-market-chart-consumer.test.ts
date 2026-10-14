import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { desiredProviderPolicyV3Schema, effectiveProviderPolicyV3Schema, marketRouteCatalogV3Schema } from '@thesis-ledger/schemas';
import { MarketChartReaderV3 } from '../../src/market/market-chart-reader-v3.js';
import { barQueryFixture } from './bar-query.fixture.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(
  new URL(`../../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'));

function setup(market: 'HK' | 'US', assetType: 'ETF' | 'STOCK') {
  const desired = desiredProviderPolicyV3Schema.parse(fixture('market-route-v3.etf-qfq.json'));
  const effective = effectiveProviderPolicyV3Schema.parse(fixture('market-control-v3.effective.etf-qfq.json'));
  const catalog = marketRouteCatalogV3Schema.parse(fixture('market-route-catalog-v3.complete.json'));
  const key = { ...desired.routes[0]!.key, market, assetType };
  const target = { providerId: 'futu', upstreamSource: 'futu' };
  desired.routes = [{ key, targets: [target] }];
  effective.routes = [{ key, targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }], reason: null }];
  catalog.entries = [{ key, target, state: 'ready', barQuery: barQueryFixture('qfq') }];
  const control = { getPolicy: vi.fn(async () => ({ ...desired, syncState: 'applied', effectiveStale: false })) };
  const dsa = { effectiveControlPolicyV3: vi.fn(async () => ({ projection: { effective } })),
    marketRouteCatalogV3: vi.fn(async () => catalog),
    marketChartBarsV3: vi.fn().mockRejectedValue(new Error('synthetic acquisition boundary')) };
  return { reader: new MarketChartReaderV3(control as never, dsa as never), dsa, desired, effective, catalog };
}

describe('港美交互图表的精确市场消费', () => {
  it.each([
    ['HK', 'STOCK', '00700.HK'], ['HK', 'ETF', '02800.HK'],
    ['US', 'STOCK', 'AAPL.US'], ['US', 'ETF', 'SPY.US'],
  ] as const)('%s %s 请求固定本市场路由', async (market, assetType, symbol) => {
    const { reader, dsa } = setup(market, assetType);
    await expect(reader.read({ identity: { symbol, assetType, timeframe: '1d', adjustment: 'qfq' },
      acceptance: 'interactive', window: { start: '2026-05-18', end: '2026-05-20' } })).rejects.toThrow('synthetic acquisition boundary');
    expect(dsa.marketChartBarsV3).toHaveBeenCalledWith(expect.objectContaining({ symbol,
      routeKey: expect.objectContaining({ market, assetType, adjustment: 'qfq' }),
      routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 } }));
    expect((await reader.options({ symbol, assetType })).options[1]).toMatchObject({ available: true, reason: null });
  });

  it('其他市场路由不能启用本市场图表口径', async () => {
    const { reader, dsa } = setup('HK', 'ETF');
    expect((await reader.options({ symbol: 'SPY.US', assetType: 'ETF' })).options.every((x) => !x.available)).toBe(true);
    await expect(reader.read({ identity: { symbol: 'SPY.US', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      acceptance: 'interactive', window: { start: '2026-05-18', end: '2026-05-20' } })).rejects.toThrow('route_not_configured');
    expect(dsa.marketChartBarsV3).not.toHaveBeenCalled();
  });

  it.each(['HK', 'US'] as const)('%s 主源失败时仅尝试已配置的同口径备用来源', async (market) => {
    const { reader, dsa, desired, effective, catalog } = setup(market, 'ETF');
    const backup = { providerId: 'yfinance', upstreamSource: 'yfinance' };
    desired.routes[0]!.targets.push(backup);
    effective.routes[0]!.targets.push({ ...backup, routeIndex: 1, eligible: true, reason: null });
    catalog.entries.push({ key: desired.routes[0]!.key, target: backup, state: 'ready', barQuery: barQueryFixture('qfq') });
    const symbol = market === 'HK' ? '02800.HK' : 'SPY.US';
    await expect(reader.read({ identity: { symbol, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
      acceptance: 'interactive', window: { start: '2026-05-18', end: '2026-05-20' } })).rejects.toThrow();
    expect(dsa.marketChartBarsV3).toHaveBeenCalledTimes(2);
    expect(dsa.marketChartBarsV3.mock.calls.map(([request]) => request.routeTarget.providerId)).toEqual(['futu', 'yfinance']);
    expect(dsa.marketChartBarsV3.mock.calls.every(([request]) => request.routeKey.market === market &&
      request.symbol === symbol && request.routeKey.adjustment === 'qfq')).toBe(true);
  });
});
