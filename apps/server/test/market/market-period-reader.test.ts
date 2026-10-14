import { describe, expect, it, vi } from 'vitest';
import type { MarketBarReader } from '../../src/market/market-bar-reader.js';
import type { MarketPeriodCalendarReader } from '../../src/market/market-period-calendar-reader.js';
import {
  MarketPeriodReader,
  type MarketPeriodReadInput,
} from '../../src/market/market-period-reader.js';
import { periodViewFixture, refreshSourceFingerprint } from './market-period-view.fixture.js';
import { MarketPeriodViewCache } from '../../src/market/market-period-view-cache.js';

function fixture() {
  const { source, window } = periodViewFixture('1w', true);
  const readCalendar = vi.fn().mockResolvedValue({ status: 'ready', calendar: window.calendar });
  const readBars = vi.fn().mockResolvedValue(source);
  const reader = new MarketPeriodReader(
    { read: readCalendar } as unknown as MarketPeriodCalendarReader,
    { readChartV3: readBars } as unknown as MarketBarReader,
  );
  const input: MarketPeriodReadInput = {
    identity: { symbol: source.identity.symbol, assetType: 'ETF', adjustment: 'qfq' },
    timeframe: window.timeframe,
    limit: window.limit,
    indicators: window.indicators,
    calendarRange: { start: window.calendar.coverageStart, end: window.calendar.coverageEnd },
  };
  return { reader, input, source, window, readCalendar, readBars };
}

describe('周期真实读取编排', () => {
  it('真实读取完成后使用派生缓存，refresh 显式重算', async () => {
    const f = fixture();
    const cache = new MarketPeriodViewCache();
    const resolve = vi.spyOn(cache, 'resolve');
    const reader = new MarketPeriodReader(
      { read: f.readCalendar } as unknown as MarketPeriodCalendarReader,
      { readChartV3: f.readBars } as unknown as MarketBarReader,
      cache,
    );
    await reader.read(f.input, () => f.window.evaluationAsOf);
    await reader.read(f.input, () => f.window.evaluationAsOf);
    expect((await resolve.mock.results[0]!.value).status).toBe('miss');
    expect((await resolve.mock.results[1]!.value).status).toBe('hit');
    f.input.refresh = true;
    await reader.read(f.input, () => f.window.evaluationAsOf);
    expect((await resolve.mock.results[2]!.value).status).toBe('miss');
    expect(resolve.mock.calls[2]![2]).toBe(true);
    expect(f.readBars).toHaveBeenCalledTimes(3);
  });
  it('请求完整原生日线窗口，在获取后固定时刻并重读日历', async () => {
    const f = fixture();
    const clock = vi
      .fn()
      .mockReturnValueOnce('2026-10-04T00:00:00Z')
      .mockReturnValue('2026-10-04T01:00:00Z');
    const result = await f.reader.read(f.input, clock);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(result.reason);
    expect(result.view.visible.series.derivation.evaluationAsOf).toBe('2026-10-04T01:00:00Z');
    expect(result.view.calculation.series.points).toHaveLength(61);
    expect(f.readBars).toHaveBeenCalledWith({
      identity: { ...f.input.identity, timeframe: '1d' },
      acceptance: 'interactive',
      window: { start: result.view.plan.baseStart, end: '2026-10-04', limit: 3650 },
    });
    expect(f.readCalendar).toHaveBeenCalledTimes(2);
    expect(f.readCalendar.mock.calls[1]![0].evaluationAsOf).toBe('2026-10-04T01:00:00Z');
  });
  it('跨交易日最多重新获取一次，持续变化明确降级', async () => {
    const f = fixture();
    const clock = vi
      .fn()
      .mockReturnValueOnce('2026-10-04T00:00:00Z')
      .mockReturnValueOnce('2026-10-05T00:00:00Z')
      .mockReturnValue('2026-10-06T00:00:00Z');
    expect(await f.reader.read(f.input, clock)).toEqual({
      status: 'unavailable',
      reason: 'window_changed',
    });
    expect(f.readBars).toHaveBeenCalledTimes(2);
    expect(f.readCalendar).toHaveBeenCalledTimes(3);
  });
  it('跨窗口重新获取后收敛，绝不使用第一次来源', async () => {
    const f = fixture();
    const clock = vi
      .fn()
      .mockReturnValueOnce('2026-10-03T00:00:00Z')
      .mockReturnValue('2026-10-04T00:00:00Z');
    const invalid = structuredClone(f.source);
    invalid.points[0]!.close += 0.5;
    f.readBars.mockResolvedValueOnce(invalid);
    expect((await f.reader.read(f.input, clock)).status).toBe('ready');
    expect(f.readBars).toHaveBeenCalledTimes(2);
  });
  it('来源传输失败不重试或伪装成缺数据', async () => {
    const f = fixture();
    f.readBars.mockRejectedValue(new Error('transport'));
    expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
      status: 'unavailable',
      reason: 'source_unavailable',
    });
    expect(f.readBars).toHaveBeenCalledTimes(1);
  });
  it.each(['calendar_unavailable', 'calendar_incomplete', 'calendar_future'] as const)(
    '日历 %s 不发起来源读取',
    async (reason) => {
      const f = fixture();
      f.readCalendar.mockResolvedValue({ status: 'unavailable', reason });
      expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
        status: 'unavailable',
        reason,
      });
      expect(f.readBars).not.toHaveBeenCalled();
    },
  );
  it('获取后日历失败不输出旧日历结论', async () => {
    const f = fixture();
    f.readCalendar
      .mockResolvedValueOnce({ status: 'ready', calendar: f.window.calendar })
      .mockResolvedValue({ status: 'unavailable', reason: 'calendar_unavailable' });
    expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
      status: 'unavailable',
      reason: 'calendar_unavailable',
    });
  });
  it('空来源与非法来源分别降级', async () => {
    const f = fixture();
    f.source.points = [];
    refreshSourceFingerprint(f.source);
    expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
      status: 'unavailable',
      reason: 'source_empty',
    });
    f.source.identity.symbol = '600519.SH';
    expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
      status: 'unavailable',
      reason: 'source_invalid',
    });
  });
  it('缺失实际日线保持 unknown，日历不能补造数据', async () => {
    const f = fixture();
    f.source.points.splice(-2, 1);
    refreshSourceFingerprint(f.source);
    const result = await f.reader.read(f.input, () => f.window.evaluationAsOf);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error(result.reason);
    expect(result.view.visible.series.points.at(-1)!.completionStatus).toBe('unknown');
  });
  it('不支持的身份在读取前拒绝', async () => {
    const f = fixture();
    f.input.identity.assetType = 'INDEX';
    expect(await f.reader.read(f.input)).toEqual({
      status: 'unavailable',
      reason: 'source_invalid',
    });
    expect(f.readCalendar).not.toHaveBeenCalled();
    expect(f.readBars).not.toHaveBeenCalled();
  });
  it('采集窗口必须与完整基础规划相同', async () => {
    const f = fixture();
    f.source.chartContextV3!.requestedStart = '2026-01-01';
    expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
      status: 'unavailable',
      reason: 'source_invalid',
    });
  });
  it('拒绝读取后时钟倒退与晚于最终评估的微秒依据', async () => {
    const f = fixture();
    const clock = vi
      .fn()
      .mockReturnValueOnce(f.window.evaluationAsOf)
      .mockReturnValue('2026-10-03T00:00:00Z');
    expect(await f.reader.read(f.input, clock)).toEqual({
      status: 'unavailable',
      reason: 'source_invalid',
    });
    f.source.chartContextV3!.sourcePriceBasis.observedAt = '2026-10-04T00:00:00.000001Z';
    expect(await f.reader.read(f.input, () => f.window.evaluationAsOf)).toEqual({
      status: 'unavailable',
      reason: 'source_invalid',
    });
  });
});
