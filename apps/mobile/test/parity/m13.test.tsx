// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, mount, setApi } from './mobile-view-harness';
import { marketDisplayDetailResponseSchema } from '@thesis-ledger/schemas';
import type * as ApiClient from '@thesis-ledger/api-client';
import {
  marketChartData,
  marketChartRequest,
  type MarketChartFilters,
} from '../../src/features/market-detail/market-model';
import { MarketChartPanel } from '../../src/features/market-detail/MarketChartPanel';
const reads = vi.hoisted(() => vi.fn());
vi.mock('@thesis-ledger/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  readPlannedMarketDetail: reads,
}));
vi.mock('../../src/platform/charts/MobileChart', () => ({
  MobileChart: () => <div>原生图表适配</div>,
}));
const filters: MarketChartFilters = {
  timeframe: '1d',
  adjustment: 'qfq',
  barsLimit: 30,
  end: '',
  ma: true,
  macd: true,
  rsi: true,
  maPeriod: '5',
  rsiPeriod: '12',
  macdFast: '12',
  macdSlow: '26',
  macdSignal: '9',
};
const detail = (count: number) => {
  const points = Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 9, 23) - (count - 1 - index) * 86400000).toISOString(),
    open: 4,
    high: 5,
    low: 3,
    close: 4.2,
    volume: 100,
    amount: 420,
    completionStatus: 'complete',
    availableAt: '2026-10-23T01:00:00Z',
  }));
  const series = {
    contractVersion: 3,
    identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
    points,
    coverage: {
      actualStart: points[0]!.timestamp,
      actualEnd: points.at(-1)!.timestamp,
      hasMoreBefore: true,
      latestCompleteTradingDate: '2026-10-23',
    },
    provenance: {
      providerId: 'controlled',
      upstreamSource: 'fixture',
      routeIndex: 0,
      effectivePolicyRevision: 1,
      providerRevision: 'fixture-v1',
      fetchedAt: '2026-10-23T01:00:00Z',
      freshUntil: '2026-10-24T01:00:00Z',
      servedFromCache: false,
      cacheStatus: 'miss',
    },
    inputFingerprint: 'fixture-window',
  };
  return marketDisplayDetailResponseSchema.parse({
    contractVersion: 3,
    symbol: '510300.SH',
    assetType: 'ETF',
    identity: { source: 'asset', status: 'confirmed' },
    requested: ['bars'],
    capabilities: { supported: ['bars'], unsupported: [] },
    limits: { bars: count, nav: 90 },
    barSeries: series,
    sections: { bars: { capability: 'bars', status: 'ready', data: series } },
    dependencies: {},
    requestId: 'fixture-request',
    generatedAt: '2026-10-23T01:00:00Z',
  });
};
describe('M13 行情窗口与指标', () => {
  it('指标参数采用实际 Server 键名，坏周期与超限窗口拒绝', () => {
    expect(marketChartRequest('510300.SH', filters).indicatorParams).toEqual({
      period: 5,
      macdFast: 12,
      macdSlow: 26,
      macdSignal: 9,
      rsiMid: 12,
    });
    expect(() => marketChartRequest('510300.SH', { ...filters, maPeriod: '1' })).toThrow('2～200');
    expect(() => marketChartRequest('510300.SH', { ...filters, macdFast: '30' })).toThrow('快周期');
    expect(() => marketChartRequest('510300.SH', filters, 3001)).toThrow('3000');
  });
  it('更早窗口沿用截止日及计算锚点，图表点数从 30 扩至 90', async () => {
    setApi(vi.fn());
    reads.mockImplementation(async (_market, request) => ({ detail: detail(request.barsLimit) }));
    await mount(<MarketChartPanel symbol="510300.SH" filters={filters} onAdjustment={vi.fn()} />);
    expect(document.body.textContent).toContain('当前图表 30 根');
    await click(button('读取更早行情'));
    expect(document.body.textContent).toContain('当前图表 90 根');
    expect(reads.mock.calls.at(-1)![1]).toMatchObject({
      barsLimit: 90,
      end: '2026-10-23',
      calculationAnchor: '2026-10-23T01:00:00Z',
    });
  });
  it('指标指纹不匹配时拒绝混画，不从手机重新计算', () => {
    const result = detail(3);
    result.sections['indicator:MA'] = {
      capability: 'indicator:MA',
      status: 'ready',
      data: { name: 'MA', parameters: { period: 5 }, inputFingerprint: 'other-window', points: [] },
    };
    expect(() => marketChartData(result, filters)).toThrow('指纹不一致');
  });
});
