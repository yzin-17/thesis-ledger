import { describe, expect, it, vi } from 'vitest';
import type { BarSeriesV2, IndicatorCalculateRequestV2 } from '@thesis-ledger/schemas';
import { MarketV2Controller } from '../../src/market/market-v2.controller.js';
import { barSeriesInputFingerprint, sliceBarSeries, type BarReadInput } from '../../src/market/market-bar-reader.js';

const fixture = () => {
  const identity = { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' } as const;
  const points = Array.from({ length: 400 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, index + 1, 7));
    return { date, point: {
      timestamp: date.toISOString(), availableAt: new Date(date.getTime() + 3_600_000).toISOString(),
      open: 1, high: 2, low: 1, close: 2, volume: 100, amount: 200, completionStatus: 'complete' as const,
    } };
  }).filter(({ date }) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6).map(({ point }) => point);
  const series: BarSeriesV2 = {
    contractVersion: 2, identity, points, inputFingerprint: barSeriesInputFingerprint(identity, points),
    coverage: { actualStart: points[0]!.timestamp, actualEnd: points.at(-1)!.timestamp, hasMoreBefore: false,
      latestCompleteTradingDate: points.at(-1)!.timestamp.slice(0, 10) },
    provenance: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0, effectivePolicyRevision: 7,
      providerRevision: 'tencent-1', fetchedAt: '2025-02-10T08:00:00.000Z', freshUntil: '2099-01-01T00:00:00.000Z',
      servedFromCache: false, cacheStatus: 'miss' },
  };
  const read = vi.fn(async (input: BarReadInput) => sliceBarSeries(series, input.window));
  const calculate = vi.fn(async (request: Omit<IndicatorCalculateRequestV2, 'contractVersion'>) => ({
    contractVersion: 2 as const, engineVersion: 'dsa-indicator-v2', inputFingerprint: request.inputFingerprint,
    // fixture 仅证明输入、投影及来源对应，不替代 DSA 指标公式测试。
    results: request.requests.map((item) => ({ ...item, inputFingerprint: request.inputFingerprint,
      points: request.points.map((point) => ({ timestamp: point.timestamp, values: { value: 123 } })) })),
  }));
  const controller = new MarketV2Controller({ read } as never, { calculateIndicatorsV2: calculate } as never,
    undefined, { resolveIdentity: vi.fn(async () => ({ symbol: identity.symbol, assetType: 'ETF', source: 'asset', status: 'confirmed' })) } as never);
  return { controller, read, calculate, series };
};

describe('指标预热和部分成功回归', () => {
  it('30 根显示窗口计算 MA60 时包含 59 根预热，并公开两种指纹的对应关系', async () => {
    const { controller, read, calculate } = fixture();
    const result = await controller.detail('510300.SH', 'bars,indicator:MA', '30', undefined, 'qfq',
      undefined, undefined, undefined, JSON.stringify({ period: 60 }));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0].window.limit).toBe(89);
    const calculation = calculate.mock.calls[0]![0];
    expect(calculation.points).toHaveLength(89);
    expect(result.barSeries?.points).toHaveLength(30);
    const section = result.sections['indicator:MA'];
    if (section?.capability !== 'indicator:MA' || !section.data) throw new Error('缺少 MA 结果');
    expect(section.status).toBe('ready');
    expect(section.data.points).toHaveLength(30);
    expect(section.data.inputFingerprint).toBe(result.barSeries?.inputFingerprint);
    expect(section.data.calculationInput).toMatchObject({ inputFingerprint: calculation.inputFingerprint, pointCount: 89 });
    expect(calculation.inputFingerprint).not.toBe(result.barSeries?.inputFingerprint);
    expect(section.data.points[0]?.timestamp).toBe(result.barSeries?.points[0]?.timestamp);
  });

  it('显式 start 仅限制显示，不截掉该起点之前的预热事实', async () => {
    const { controller, series, calculate, read } = fixture();
    const start = series.points.at(-10)!.timestamp.slice(0, 10);
    const end = series.points.at(-1)!.timestamp.slice(0, 10);
    const result = await controller.detail('510300.SH', 'bars,indicator:MA', '30', undefined, 'qfq',
      start, end, undefined, JSON.stringify({ period: 60 }));
    expect(read.mock.calls[0]![0].window.start).toBeUndefined();
    expect(result.barSeries?.points).toHaveLength(10);
    expect(calculate.mock.calls[0]![0].points).toHaveLength(69);
    expect(calculate.mock.calls[0]![0].points[0]!.timestamp < `${start}T00:00:00.000Z`).toBe(true);
  });

  it('独立指标端点同样预热 MA200，最终只返回所请求的 30 点', async () => {
    const { controller, calculate } = fixture();
    const result = await controller.indicator('510300.SH', 'MA', 'ETF', '1d', 'qfq',
      undefined, undefined, '30', 'interactive', JSON.stringify({ period: 200 }));
    expect(calculate.mock.calls[0]![0].points).toHaveLength(229);
    expect(result.results[0]?.points).toHaveLength(30);
    expect(result.results[0]?.calculationInput?.pointCount).toBe(229);
  });

  it('显示加预热超上限时返回参数错误，不静默截断或请求上游', async () => {
    const { controller, read, calculate } = fixture();
    await expect(controller.detail('510300.SH', 'bars,indicator:MACD', '90', undefined, 'qfq',
      undefined, undefined, undefined, JSON.stringify({ fast: 12, slow: 200, signal: 200 })))
      .rejects.toThrow('可见窗口加预热窗口不能超过 365');
    expect(read).not.toHaveBeenCalled();
    expect(calculate).not.toHaveBeenCalled();
  });

  it('指标失败只降级指标，保留成功的日线、顶层 BarSeries 和 DAILY_BAR', async () => {
    const { controller, calculate } = fixture();
    calculate.mockRejectedValueOnce(new Error('DSA calculation timeout'));
    const result = await controller.detail('510300.SH', 'bars,indicator:MA,indicator:MACD', '30');
    expect(result.barSeries?.points).toHaveLength(30);
    expect(result.sections.bars?.status).toBe('ready');
    expect(result.dependencies.DAILY_BAR?.status).toBe('ready');
    expect(result.sections['indicator:MA']).toMatchObject({ status: 'unavailable', error: { code: 'indicator_calculation_unavailable' } });
    expect(result.sections['indicator:MACD']?.status).toBe('unavailable');
  });

  it('日线读取失败才会同时降级日线依赖和指标', async () => {
    const { controller, read, calculate } = fixture();
    read.mockRejectedValueOnce(new Error('bars unavailable'));
    const result = await controller.detail('510300.SH', 'bars,indicator:MA', '30');
    expect(result.barSeries).toBeUndefined();
    expect(result.sections.bars?.status).toBe('unavailable');
    expect(result.dependencies.DAILY_BAR?.status).toBe('unavailable');
    expect(result.sections['indicator:MA']?.error?.code).toBe('daily_bar_unavailable');
    expect(calculate).not.toHaveBeenCalled();
  });

  it('非法指标参数保留 HTTP 参数错误语义', async () => {
    const { controller, read } = fixture();
    await expect(controller.detail('510300.SH', 'bars,indicator:MA', '30', undefined, 'qfq',
      undefined, undefined, undefined, JSON.stringify({ period: -1 }))).rejects.toThrow('2 到 200');
    expect(read).not.toHaveBeenCalled();
  });
});
