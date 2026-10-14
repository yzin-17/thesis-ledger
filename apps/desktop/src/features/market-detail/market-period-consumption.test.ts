import { describe, expect, it } from 'vitest';
import { marketDisplayDetailResponseSchema } from '@thesis-ledger/schemas';
import { marketDisplayDetailFixture } from './market-period-consumption.fixture.js';
import { chartPageFromResponse } from './market-chart-types.js';
import { canCombineChartSeries } from './market-chart-acquisition.js';
import { marketDetailRequestKey } from './market-detail.coordinator.js';
import { mergeMarketDetail } from './market-detail.types.js';
import { latestDetailQueryKey } from './useMarketChartLatestBoundary.js';

describe('派生周期消费与页隔离', () => {
  const detail = () => marketDisplayDetailResponseSchema.parse(marketDisplayDetailFixture());
  it('页内指标与 bars 使用显示摘要，实际计算摘要保持独立且披露派生来源', () => {
    const response = detail();
    const page = chartPageFromResponse(response)!;
    expect(page.bars[0]).toMatchObject({ timeframe: '1w', timeframeKind: 'derived', provider: 'thesis-ledger-server', upstreamSource: 'tencent' });
    expect(page.indicators[0]?.inputFingerprint).toBe(page.bars[0]?.inputFingerprint);
    expect(page.indicators[0]?.calculationInput?.inputFingerprint).not.toBe(page.bars[0]?.inputFingerprint);
  });
  it('跨周期或聚合上下文变化不能合并旧页及旧指标', () => {
    const current = detail();
    const next = detail();
    next.barSeries!.identity.timeframe = '1mo';
    delete next.sections['indicator:MA'];
    expect(canCombineChartSeries(current.barSeries!, next.barSeries!)).toBe(false);
    const merged = mergeMarketDetail(current, next);
    expect(merged.barSeries).toBe(next.barSeries);
    expect(merged.sections['indicator:MA']).toBeUndefined();
    const changed = detail();
    changed.barSeries!.inputFingerprint = 'c'.repeat(64);
    expect(canCombineChartSeries(current.barSeries!, changed.barSeries!)).toBe(false);
  });
  it('派生根序列不拍平合并并冒用下一页摘要', () => {
    const current = detail();
    const next = detail();
    const merged = mergeMarketDetail(current, next);
    expect(merged.barSeries).toBe(next.barSeries);
    expect(merged.sections.bars?.data).toEqual(next.barSeries);
  });
  it('协调器与 TanStack 最新窗口键包含周期，省略周期保持日线等价', () => {
    const request = { symbol: '159516.SZ', barsLimit: 90 };
    expect(marketDetailRequestKey(request)).toBe(marketDetailRequestKey({ ...request, timeframe: '1d' }));
    expect(marketDetailRequestKey({ ...request, timeframe: '1w' })).not.toBe(marketDetailRequestKey({ ...request, timeframe: '1mo' }));
    const params = { fast: 12, slow: 26, signal: 9, short: 6, mid: 12, long: 24 };
    expect(latestDetailQueryKey(request.symbol, 0, params, 'qfq', { barsLimit: 90, timeframe: '1w' }))
      .not.toEqual(latestDetailQueryKey(request.symbol, 0, params, 'qfq', { barsLimit: 90, timeframe: '1mo' }));
  });
});
