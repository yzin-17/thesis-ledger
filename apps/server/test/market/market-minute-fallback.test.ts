import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MarketChartBarsRequestV3, MarketDataBarRouteKeyV3 } from '@thesis-ledger/schemas';
import { supportsBasicPriceFallback } from '../../src/market/market-basic-price-fallback.js';
import { resolveChartOptionsV3 } from '../../src/market/market-chart-options-v3.js';
import { marketRouteContextV3 } from '../../src/market/market-window-selector-v3.js';
import { selectChartWindowV3 } from '../../src/market/market-chart-selector-v3.js';

const key: MarketDataBarRouteKeyV3 = {
  kind: 'bar', market: 'CN', assetType: 'ETF', capability: 'MINUTE_BAR', timeframe: '1m', adjustment: 'none',
};
const targets = [{ providerId: 'efinance', upstreamSource: 'eastmoney' }, { providerId: 'yfinance', upstreamSource: 'yfinance' }];
const setup = () => {
  const desired = { contractVersion: 1, consumer: 'thesis-ledger', requestId: 'minute-fallback', revision: 192,
    enabled: true, routes: [{ key, targets }] };
  const effective = { ...desired, sourceDesiredRevision: 192, appliedAt: '2026-11-08T00:00:00Z',
    routes: [{ key, reason: null, targets: targets.map((target, routeIndex) => ({ ...target, routeIndex,
      eligible: routeIndex === 1, reason: routeIndex === 0 ? 'upstream_failure' : null })) }] };
  const catalog = { contractVersion: 1 as const, consumer: 'thesis-ledger' as const, catalogRevision: 10,
    generatedAt: '2026-11-08T00:00:00Z', integrity: 'complete' as const,
    entries: targets.map((target) => ({ key, target, state: 'ready' as const })) };
  return { desired, effective, catalog };
};

describe('原生分钟交互图表整段备用', () => {
  it.each(['1m', '5m', '15m', '30m', '60m'] as const)('主源熔断时 %s 预检放行精确备用', (timeframe) => {
    const { desired, effective, catalog } = setup();
    const routeKey = { ...key, timeframe };
    desired.routes[0]!.key = routeKey;
    effective.routes[0]!.key = routeKey;
    catalog.entries = catalog.entries.map((entry) => ({ ...entry, key: routeKey }));
    const result = resolveChartOptionsV3({ symbol: '510300.SH', assetType: 'ETF', timeframe }, desired, effective, catalog);
    expect(result.options[0]).toEqual({ adjustment: 'none', available: true, reason: null, availableVia: 'backup' });
    expect(result.options.slice(1).every((entry) => !entry.available)).toBe(true);
  });

  it('备用未就绪、错周期、错口径或目录不完整时不放行', () => {
    const { catalog } = setup();
    expect(supportsBasicPriceFallback(key, targets, { ...catalog, integrity: 'partial' })).toBe(false);
    expect(supportsBasicPriceFallback(key, targets, { ...catalog, entries: catalog.entries.map((entry) => ({ ...entry, key: { ...key, timeframe: '5m' } })) })).toBe(false);
    expect(supportsBasicPriceFallback(key, targets, { ...catalog, entries: catalog.entries.map((entry) => ({ ...entry, state: 'credential_missing' })) })).toBe(false);
    expect(supportsBasicPriceFallback({ ...key, adjustment: 'qfq' }, targets, catalog)).toBe(false);
  });

  it.each([false, true])('主源资格 %s 时整段回退；身份、周期、窗口和修订漂移均拒绝', async (primaryEligible) => {
    const { desired, effective, catalog } = setup();
    effective.routes[0]!.targets[0]!.eligible = primaryEligible;
    effective.routes[0]!.targets[0]!.reason = primaryEligible ? null : 'upstream_failure';
    const context = marketRouteContextV3({ desired, effective, catalog, routeKey: key });
    if (!context.ok) throw new Error(context.reason);
    const response = {
      contractVersion: 1, purpose: 'interactive-chart', requestId: 'minute-fallback', symbol: '510300.SH', routeKey: key,
      bars: [{ timestamp: '2026-11-06T09:31:00+08:00', open: 4.1, high: 4.2, low: 4, close: 4.124,
        volume: null, amount: null, availableAt: '2026-11-06T09:32:00+08:00', completionStatus: 'unknown' }],
      coverage: { requestedStart: '2026-11-06', requestedEnd: '2026-11-06', actualStart: '2026-11-06T09:31:00+08:00',
        actualEnd: '2026-11-06T09:31:00+08:00', hasMoreBefore: false, latestCompleteTradingDate: null },
      session: 'regular', timestampConvention: 'source-native',
      sourcePriceBasis: { ...JSON.parse(readFileSync(new URL('../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json', import.meta.url), 'utf8')).sourcePriceBasis,
        adjustment: 'none', observedAt: '2026-11-08T00:00:00Z' },
      provenance: { ...targets[1], routeIndex: 1, effectivePolicyRevision: 192 }, inputFingerprint: 'a'.repeat(64),
    };
    const read = vi.fn(async (request: MarketChartBarsRequestV3) => {
      if (request.routeTarget.routeIndex === 0) throw new Error('主源超时');
      return response;
    });
    const input = {
      request: { contractVersion: 1 as const, purpose: 'interactive-chart' as const, requestId: 'minute-fallback',
        symbol: '510300.SH', routeKey: key, start: '2026-11-06', end: '2026-11-06' },
      context: context.context, read,
    };
    const run = () => selectChartWindowV3(input);
    const result = await run();
    expect(result.bars).toEqual(response.bars);
    expect(result.provenance).toEqual(response.provenance);
    expect(read).toHaveBeenCalledTimes(primaryEligible ? 2 : 1);
    expect(read.mock.calls.at(-1)![0].routeTarget).toEqual({ ...targets[1], routeIndex: 1 });
    for (const mismatch of [{ symbol: '600519.SH' }, { routeKey: { ...key, timeframe: '5m' } },
      { coverage: { ...response.coverage, requestedEnd: '2026-11-07' } },
      { provenance: { ...response.provenance, effectivePolicyRevision: 193 } }]) {
      read.mockImplementation(async (request) => {
        if (request.routeTarget.routeIndex === 0) throw new Error('主源超时');
        return { ...response, ...mismatch } as typeof response;
      });
      await expect(run()).rejects.toThrow();
    }
  });
});
