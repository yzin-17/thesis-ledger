import { describe, expect, it } from 'vitest';
import type { MarketDataBarRouteKeyV3, MarketRouteCatalogV3 } from '@thesis-ledger/schemas';
import { supportsBasicPriceFallback } from '../../src/market/market-basic-price-fallback.js';
import { barQueryFixture } from './bar-query.fixture.js';

const key: MarketDataBarRouteKeyV3 = { kind: 'bar', market: 'CN', assetType: 'ETF', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' };
const targets = [{ providerId: 'new-price-a', upstreamSource: 'source-a' }, { providerId: 'new-price-b', upstreamSource: 'source-b' }];
const catalog = (routeKey = key): MarketRouteCatalogV3 => ({
  contractVersion: 3, consumer: 'thesis-ledger', catalogRevision: 10, generatedAt: '2026-10-10T00:00:00Z', integrity: 'complete',
  entries: targets.map((target) => ({ key: routeKey, target, state: 'ready', barQuery: barQueryFixture(routeKey.adjustment) })),
});

describe('基础价格备用按标准能力与消费者要求判断', () => {
  it('新的供应商标识无需增加名单，CN ETF 与港美沿同一规则', () => {
    expect(supportsBasicPriceFallback(key, targets, catalog())).toBe(true);
    const hk: MarketDataBarRouteKeyV3 = { ...key, market: 'HK', assetType: 'STOCK' };
    expect(supportsBasicPriceFallback(hk, targets, catalog(hk))).toBe(true);
  });
  it('CN 股票保持原兼容证明边界', () => {
    const stock: MarketDataBarRouteKeyV3 = { ...key, assetType: 'STOCK' };
    expect(supportsBasicPriceFallback(stock, targets, catalog(stock))).toBe(false);
  });
  it('单个许可布尔值、旧目录、错口径、重复目标和备用未就绪均不能放行', () => {
    const cases = [
      { ...catalog(), integrity: 'partial' as const },
      { ...catalog(), entries: catalog().entries.map((entry) => ({ key: entry.key, target: entry.target, state: entry.state })) },
      { ...catalog(), entries: catalog().entries.map((entry) => ({ ...entry, barQuery: { ...entry.barQuery!, adjustment: 'none' as const } })) },
      { ...catalog(), entries: catalog().entries.map((entry) => ({ ...entry, state: 'credential_missing' as const })) },
    ];
    for (const value of cases) expect(supportsBasicPriceFallback(key, targets, value)).toBe(false);
    expect(supportsBasicPriceFallback(key, [targets[0]!, targets[0]!], catalog())).toBe(false);
    expect(supportsBasicPriceFallback(key, targets, { ...catalog(), entries: [] })).toBe(false);
  });
});
