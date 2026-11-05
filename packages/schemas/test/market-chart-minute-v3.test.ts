import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketChartBarsRequestV3Schema,
  marketChartBarsResponseV3Schema,
  marketChartBarsRequestResponseV3Schema,
} from '../src/market-chart-wire-v3.js';
import { marketDataBarSeriesResponseV3Schema } from '../src/market-data-wire-v3.js';

const fixture = () => {
  const original = JSON.parse(readFileSync(new URL('../fixtures/market-data-v3.response.etf-qfq.json', import.meta.url), 'utf8'));
  const { coverageProof: _proof, ...base } = original;
  void _proof;
  const observedAt = '2026-05-18T01:31:30Z';
  const bars = base.bars.slice(0, 2).map((point: Record<string, unknown>, index: number) => ({
    ...point,
    timestamp: index === 0 ? '2026-05-18T09:30:00+08:00' : '2026-05-18T09:31:00+08:00',
    completionStatus: index === 0 ? 'complete' : 'incomplete',
    availableAt: observedAt,
  }));
  const response = {
    ...base, purpose: 'interactive-chart', symbol: '02800.HK', session: 'regular',
    routeKey: { kind: 'bar', market: 'HK', assetType: 'ETF', capability: 'MINUTE_BAR', timeframe: '1m', adjustment: 'none' },
    bars,
    sourcePriceBasis: { ...base.sourcePriceBasis, adjustment: 'none', observedAt },
    coverage: { requestedStart: '2026-05-18', requestedEnd: '2026-05-18',
      actualStart: bars[0].timestamp, actualEnd: bars[1].timestamp,
      hasMoreBefore: false, latestCompleteTradingDate: null },
  };
  const request = { contractVersion: 3, purpose: 'interactive-chart', requestId: response.requestId,
    symbol: response.symbol, routeKey: response.routeKey, start: '2026-05-18', end: '2026-05-18',
    routeTarget: { providerId: response.provenance.providerId, upstreamSource: response.provenance.upstreamSource,
      routeIndex: response.provenance.routeIndex } };
  return { request, response };
};

describe('港美分钟图表合同', () => {
  it('同日不同分钟保留，仍不能作为完整回测窗口', () => {
    const { request, response } = fixture();
    expect(marketChartBarsRequestResponseV3Schema.safeParse({ request, response }).success).toBe(true);
    expect(marketDataBarSeriesResponseV3Schema.safeParse(response).success).toBe(false);
  });

  it.each([
    { market: 'CN' }, { assetType: 'INDEX' }, { adjustment: 'qfq' }, { adjustment: 'hfq' },
    { capability: 'DAILY_BAR' },
  ])('拒绝分钟路由越界 %j', (change) => {
    const { request, response } = fixture();
    const routeKey = { ...request.routeKey, ...change };
    expect(marketChartBarsRequestV3Schema.safeParse({ ...request, routeKey }).success).toBe(false);
    expect(marketChartBarsResponseV3Schema.safeParse({ ...response, routeKey }).success).toBe(false);
  });

  it('分钟不能推导整日完成，也不能丢失时段声明', () => {
    const { response } = fixture();
    expect(marketChartBarsResponseV3Schema.safeParse({ ...response, session: undefined }).success).toBe(false);
    expect(marketChartBarsResponseV3Schema.safeParse({ ...response, session: 'extended' }).success).toBe(false);
    expect(marketChartBarsResponseV3Schema.safeParse({
      ...response, coverage: { ...response.coverage, latestCompleteTradingDate: '2026-05-18' },
    }).success).toBe(false);
  });

  it('不能提前声明当前分钟完成，整分钟结束才允许', () => {
    const { response } = fixture();
    const bars = response.bars.map((point: Record<string, unknown>) => ({ ...point, completionStatus: 'complete' }));
    expect(marketChartBarsResponseV3Schema.safeParse({ ...response, bars }).success).toBe(false);
    expect(marketChartBarsResponseV3Schema.safeParse({
      ...response, bars, sourcePriceBasis: { ...response.sourcePriceBasis, observedAt: '2026-05-18T01:32:00Z' },
    }).success).toBe(true);
  });

  it.each(['2026-05-18T09:30:01+08:00', '2026-05-18T09:30:00+08:00', '2026-05-19T09:31:00+08:00'])(
    '拒绝非整分钟、重复或窗口外记录 %s', (timestamp) => {
      const { response } = fixture();
      const bars = [response.bars[0], { ...response.bars[1], timestamp }];
      expect(marketChartBarsResponseV3Schema.safeParse({
        ...response, bars, coverage: { ...response.coverage, actualEnd: timestamp },
      }).success).toBe(false);
    },
  );

  it('请求身份、窗口及目标不能串用', () => {
    const { request, response } = fixture();
    expect(marketChartBarsRequestResponseV3Schema.safeParse({
      request: { ...request, symbol: '00700.HK' }, response,
    }).success).toBe(false);
  });
});
