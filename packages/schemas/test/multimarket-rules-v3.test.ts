import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marketTradingStatusResponseV3Schema } from '../src/market-trading-status-v3.js';
import { marketPublicFeesResponseV3Schema } from '../src/market-public-fees-v3.js';
import { instrumentFactSchema } from '../src/backtest-data.js';
import { marketDataBarSeriesRequestV3Schema } from '../src/market-data-wire-v3.js';
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/market-${name}-v3.response.json`, import.meta.url), 'utf8')).response;

describe('真实港美收费/盘中状态合同', () => {
  it.each(['HK', 'US'])('%s日线缺日研究假设接受，盘中与其他市场仍拒绝', (market) => {
    const request = { contractVersion: 3, requestId: 'p6-window', symbol: market === 'HK' ? '00147.HK' : 'GME.US',
      start: '2024-05-10', end: '2024-05-24', tradabilityMode: 'assume-untradable-no-bar',
      routeKey: { kind: 'bar', market, assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' } };
    expect(marketDataBarSeriesRequestV3Schema.safeParse(request).success).toBe(true);
    expect(marketDataBarSeriesRequestV3Schema.safeParse({ ...request, routeKey: { ...request.routeKey, timeframe: '1m', capability: 'MINUTE_BAR' } }).success).toBe(false);
    expect(marketDataBarSeriesRequestV3Schema.safeParse({ ...request, routeKey: { ...request.routeKey, market: 'JP' } }).success).toBe(false);
  });
  it.each(['hk', 'us'])('%s生产读取逐字段保留', (market) => {
    for (const kind of ['fees', 'status']) {
      const response = fixture(`${market}-${kind}`);
      const schema = kind === 'fees' ? marketPublicFeesResponseV3Schema : marketTradingStatusResponseV3Schema;
      expect(schema.parse(response)).toEqual(response);
    }
  });
  it('盘中状态时区与市场绑定，不允许缺失恢复或引用被静默改写', () => {
    const value = fixture('us-status');
    value.provenance.timezone = 'Asia/Hong_Kong';
    expect(marketTradingStatusResponseV3Schema.safeParse(value).success).toBe(false);
    const bad = fixture('hk-status');
    bad.days[1].intradayHalts[0].endedAt = '2025-08-07T10:00:00+08:00';
    expect(marketTradingStatusResponseV3Schema.safeParse(bad).success).toBe(false);
  });
  it('身份未知单位必须成对null，单侧未知拒绝', () => {
    const value = { symbol: 'GME.US', market: 'US', instrumentType: 'STOCK', currency: 'USD',
      lotSize: null, tickSize: null, tradable: false, provider: 'observed', providerRevision: '1',
      occurredAt: '2026-10-07T00:00:00Z', availableAt: '2026-10-07T00:00:00Z',
      executionRules: { status: 'unavailable', reason: '未知' } };
    expect(instrumentFactSchema.parse(value)).toEqual(value);
    expect(instrumentFactSchema.safeParse({ ...value, tickSize: '0.01' }).success).toBe(false);
  });
});
