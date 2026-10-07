import { beforeEach, describe, expect, it, vi } from 'vitest';
const getDetail = vi.hoisted(() => vi.fn());
const getPlannedChartOptions = vi.hoisted(() => vi.fn());
vi.mock('../../shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ market: { getDetail, getPlannedChartOptions } }),
}));
import { requestMarketDetail } from './market-detail.api.js';

describe('图表请求到共享客户端的实际适配', () => {
  beforeEach(() => {
    getDetail.mockReset();
    getPlannedChartOptions
      .mockReset()
      .mockResolvedValue({
        mode: 'v3',
        window: { start: '2025-01-01', end: '2026-05-20' },
        options: ['none', 'qfq', 'hfq'].map((adjustment) => ({
          adjustment,
          available: true,
          reason: null,
        })),
      });
  });
  it.each(['none', 'qfq', 'hfq'] as const)(
    '传递 %s、V3 版本及整窗参数，不在适配层丢弃',
    async (adjustment) => {
      getDetail.mockResolvedValue({ requestId: adjustment });
      await requestMarketDetail({
        symbol: '159516.SZ',
        adjustment,
        chartContractVersion: 3,
        barsLimit: 180,
        indicatorParams: { period: 60 },
        refresh: true,
      });
      expect(getDetail).toHaveBeenCalledWith(
        '159516.SZ',
        expect.objectContaining({
          adjustment,
          chartContractVersion: 3,
          barsLimit: 180,
          indicatorParams: { period: 60 },
          refresh: true,
          signal: expect.any(AbortSignal) as unknown,
          end: '2026-05-20',
        }),
      );
      expect(getPlannedChartOptions).toHaveBeenCalledWith(
        '159516.SZ',
        { barsLimit: 180, indicatorParams: { period: 60 } },
        expect.any(AbortSignal),
      );
    },
  );
  it('净值条数保持独立，并使用当前详情合同', async () => {
    getDetail.mockResolvedValue({ requestId: 'nav' });
    await requestMarketDetail({ symbol: '000001.OF', include: ['fund-nav-history'], navLimit: 20 });
    const params = getDetail.mock.calls[0]![1] as Record<string, unknown>;
    expect(params.navLimit).toBe(20);
    expect(params.adjustment).toBeUndefined();
    expect(params.chartContractVersion).toBe(3);
    expect(getPlannedChartOptions).not.toHaveBeenCalled();
  });
  it('规划失败不发起行情请求，也不按旧口径回退', async () => {
    getPlannedChartOptions.mockRejectedValue(new Error('plan unavailable'));
    await expect(
      requestMarketDetail({ symbol: '159516.SZ', chartContractVersion: 3 }),
    ).rejects.toThrow('plan unavailable');
    expect(getDetail).not.toHaveBeenCalled();
  });
  it('无兼容来源时不消耗行情请求', async () => {
    getPlannedChartOptions.mockResolvedValue({
      mode: 'v3',
      window: { start: '2025-01-01', end: '2026-05-20' },
      options: [],
    });
    await expect(
      requestMarketDetail({ symbol: '159516.SZ', chartContractVersion: 3 }),
    ).rejects.toThrow('价格口径不可用');
    expect(getDetail).not.toHaveBeenCalled();
  });
  it('分段重试取得全部指标的同一预热窗口，拒绝实际窗口漂移', async () => {
    getDetail.mockResolvedValue({
      barSeries: { chartContextV3: { requestedStart: '2026-01-01', requestedEnd: '2026-05-20' } },
    });
    await expect(
      requestMarketDetail({
        symbol: '159516.SZ',
        chartContractVersion: 3,
        include: ['bars'],
        end: '2026-05-20',
      }),
    ).rejects.toThrow('窗口与已校验计划不一致');
    expect(getDetail).toHaveBeenCalledWith(
      '159516.SZ',
      expect.objectContaining({
        include: ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'],
      }),
    );
  });
});
