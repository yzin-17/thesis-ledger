import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  marketDataBarSeriesResponseV3Schema,
  type BarSeries,
  type IndicatorCalculateRequest,
} from '@thesis-ledger/schemas';
import { MarketController } from '../../src/market/market.controller.js';

const setup = () => {
  const response = marketDataBarSeriesResponseV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const series: BarSeries = {
    contractVersion: 3,
    identity: { symbol: response.symbol, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
    points: response.bars,
    coverage: response.coverage,
    inputFingerprint: response.inputFingerprint,
    provenance: {
      ...response.provenance,
      providerRevision: 'observation',
      fetchedAt: response.sourcePriceBasis.observedAt,
      freshUntil: response.sourcePriceBasis.observedAt,
      servedFromCache: false,
      cacheStatus: 'miss',
    },
    chartContextV3: {
      purpose: 'interactive-chart',
      requestedStart: '2026-05-18',
      requestedEnd: '2026-05-20',
      acquisitionFingerprint: 'acquisition',
      sourcePriceBasis: response.sourcePriceBasis,
    },
  };
  const reader = { read: vi.fn(async () => series), readChartV3: vi.fn(async () => series) };
  const calculate = vi.fn(async (input: Omit<IndicatorCalculateRequest, 'contractVersion'>) => ({
    contractVersion: 3,
    engineVersion: 'dsa-indicator-v3',
    inputFingerprint: input.inputFingerprint,
    results: input.requests.map((request) => ({
      ...request,
      inputFingerprint: input.inputFingerprint,
      points: input.points.map((point) => ({
        timestamp: point.timestamp,
        values: { value: null },
      })),
    })),
  }));
  const detail = {
    resolveIdentity: vi.fn(async () => ({
      symbol: response.symbol,
      assetType: 'ETF',
      source: 'asset',
      status: 'confirmed',
    })),
    getDetail: vi.fn(async () => ({
      sections: {
        'fund-nav-history': { capability: 'fund-nav-history', status: 'empty', data: null },
      },
      dependencies: {},
    })),
  };
  const controller = new MarketController(
    reader as never,
    { calculateIndicators: calculate } as never,
    undefined,
    detail as never,
  );
  return { controller, reader, calculate, detail };
};

describe('行情详情显式图表 V3 接入', () => {
  it('首次打开按指标预热规划窗口，历史结束日固定且与显式窗口互斥', async () => {
    const { reader, detail } = setup();
    const chartReader = { options: vi.fn(async (_identity, window) => ({ window })) };
    const controller = new MarketController(reader as never, {} as never, undefined, detail as never, undefined, chartReader as never);
    const result = await controller.chartOptions('159516.SZ', undefined, undefined, '90', '{}', '2026-05-20');
    expect(result).toMatchObject({ plan: { barsLimit: 90, indicatorParams: {}, end: '2026-05-20' },
      window: { start: '2025-02-27', end: '2026-05-20' } });
    expect(reader.readChartV3).not.toHaveBeenCalled();
    await controller.chartOptions('159516.SZ', undefined, undefined, '90', '{}', '2026-05-19T17:00:00Z');
    expect(chartReader.options).toHaveBeenLastCalledWith(expect.anything(), { start: '2025-02-27', end: '2026-05-20' });
    await expect(controller.chartOptions('159516.SZ', '2026-05-01', '2026-05-20', '90')).rejects.toThrow('不能同时');
    await expect(controller.chartOptions('159516.SZ', undefined, undefined, '3001')).rejects.toThrow('参数无效');
  });
  it('能力窗口成对验证并传递到 Reader，非法日期不访问身份服务', async () => {
    const { reader, detail } = setup();
    const chartReader = { options: vi.fn().mockResolvedValue({}) };
    const controller = new MarketController(
      reader as never,
      {} as never,
      undefined,
      detail as never,
      undefined,
      chartReader as never,
    );
    for (const [start, end] of [
      ['2026-05-01', undefined],
      ['2026-02-30', '2026-05-20'],
      ['2026-05-21', '2026-05-20'],
    ]) {
      await expect(controller.chartOptions('159516.SZ', start, end)).rejects.toThrow('start/end');
    }
    expect(detail.resolveIdentity).not.toHaveBeenCalled();
    await controller.chartOptions('159516.SZ', '2026-05-01', '2026-05-20');
    expect(chartReader.options).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: '159516.SZ' }),
      { start: '2026-05-01', end: '2026-05-20' },
    );
  });
  it('整窗扩展包含同次预热，省略版本也使用当前上限', async () => {
    const { controller, reader } = setup();
    await controller.detail(
      '159516.SZ',
      'bars,indicator:MA',
      '3000',
      undefined,
      'qfq',
      undefined,
      '2026-05-20',
      'interactive',
      JSON.stringify({ period: 200 }),
      undefined,
      '3',
    );
    expect(reader.readChartV3).toHaveBeenCalledWith(
      expect.objectContaining({
        window: { end: '2026-05-20', limit: 3199 },
      }),
    );
    await controller.detail('159516.SZ', 'bars', '91');
    expect(reader.readChartV3).toHaveBeenLastCalledWith(
      expect.objectContaining({ window: { limit: 91 } }),
    );
    await expect(
      controller.detail(
        '159516.SZ',
        'bars',
        '3001',
        undefined,
        'qfq',
        undefined,
        undefined,
        'interactive',
        undefined,
        undefined,
        '3',
      ),
    ).rejects.toThrow('3000');
    expect(reader.read).not.toHaveBeenCalled();
    expect(reader.readChartV3).toHaveBeenCalledTimes(2);
  });
  it('从统一 Reader 的 V3 获取计算指标，保留获取身份和刷新参数', async () => {
    const { controller, reader, calculate } = setup();
    const result = await controller.detail(
      '159516.SZ',
      'bars,indicator:MA',
      '30',
      undefined,
      'qfq',
      undefined,
      undefined,
      'interactive',
      undefined,
      '1',
      '3',
    );
    expect(reader.read).not.toHaveBeenCalled();
    expect(reader.readChartV3).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: true, acceptance: 'interactive' }),
    );
    expect(calculate).toHaveBeenCalledOnce();
    expect(result.barSeries?.chartContextV3?.acquisitionFingerprint).toBe('acquisition');
    expect(result.sections['indicator:MA']?.status).toBe('ready');
  });
  it('新入口失败不回退旧 Reader', async () => {
    const { controller, reader } = setup();
    reader.readChartV3.mockRejectedValueOnce(new Error('not ready'));
    const result = await controller.detail(
      '159516.SZ',
      'bars',
      '30',
      undefined,
      'hfq',
      undefined,
      undefined,
      'interactive',
      undefined,
      undefined,
      '3',
    );
    expect(result.sections.bars?.status).toBe('unavailable');
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('版本与验收参数非法时在读取前拒绝', async () => {
    const { controller, reader } = setup();
    await expect(
      controller.detail(
        '159516.SZ',
        'bars',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '4',
      ),
    ).rejects.toThrow('仅支持 3');
    await expect(
      controller.detail(
        '159516.SZ',
        'bars',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'complete',
        undefined,
        undefined,
        '3',
      ),
    ).rejects.toThrow('interactive');
    expect(reader.readChartV3).not.toHaveBeenCalled();
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('省略版本仍走当前 Reader', async () => {
    const { controller, reader } = setup();
    await controller.detail('159516.SZ', 'bars');
    expect(reader.readChartV3).toHaveBeenCalledOnce();
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('独立日线端点也使用当前图表 Reader，拒绝历史可见性参数', async () => {
    const { controller, reader } = setup();
    await controller.bars('159516.SZ');
    expect(reader.readChartV3).toHaveBeenCalledOnce();
    expect(reader.read).not.toHaveBeenCalled();
    expect(() => controller.bars('159516.SZ', undefined, undefined, undefined,
      undefined, undefined, undefined, 'complete')).toThrow('interactive');
    expect(() => controller.bars('159516.SZ', undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, '2026-05-20T00:00:00.000Z')).toThrow('asOf');
  });
  it('基金净值继续走既有非日线消费者', async () => {
    const { controller, reader, detail } = setup();
    detail.resolveIdentity.mockResolvedValueOnce({
      symbol: '000001.OF',
      assetType: 'MUTUAL_FUND',
      source: 'asset',
      status: 'confirmed',
    });
    await controller.detail(
      '000001.OF',
      'fund-nav-history',
      undefined,
      '20',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '3',
    );
    expect(detail.getDetail).toHaveBeenCalledWith(
      '000001.OF',
      expect.objectContaining({ navLimit: 20 }),
    );
    expect(reader.readChartV3).not.toHaveBeenCalled();
    expect(reader.read).not.toHaveBeenCalled();
  });
});
