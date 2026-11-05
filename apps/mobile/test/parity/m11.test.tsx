// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, mount, setApi, view } from './mobile-view-harness';
import { PerformanceScreen } from '../../src/features/performance-read/PerformanceScreen';
import {
  performanceAllocationInput,
  performanceChartData,
  displayRatio,
} from '../../src/features/performance-read/performance-projection';
import { ledgerAccount, ledgerAccountId } from './ledger-fixture';
import type { PerformanceLayersWire } from '@thesis-ledger/schemas';
vi.mock('../../src/platform/charts/MobileChart', () => ({ MobileChart: () => null }));
const total = {
  marketValue: 100,
  costValue: 90,
  cashValue: 50,
  partial: true,
  missingSymbols: ['缺失标的'],
  currency: 'CNY' as const,
};
const layers: PerformanceLayersWire = {
  security: [
    {
      accountId: ledgerAccountId,
      symbol: '510300.SH',
      assetType: 'etf',
      costValue: 90,
      marketValue: null,
      unrealizedPnl: null,
    },
  ],
  account: [{ ...total, accountId: ledgerAccountId }],
  portfolio: total,
  valuedAt: '2026-10-23T01:00:00Z',
  dataQuality: { partial: true, missingSymbols: ['缺失标的'] },
};
describe('M11 收益读取与图表输入', () => {
  it('缺失市值保持 partial，不能算成零权重；未知类别同样阻断建议', () => {
    const targets = {
      scope: 'account' as const,
      accountId: ledgerAccountId,
      targets: { etf: 0.5, cash: 0.5 },
    };
    const input = performanceAllocationInput(layers, targets, ledgerAccountId)!;
    expect(input.positions).toEqual([{ category: 'cash', marketValue: 50 }]);
    expect(input.dataQuality.partial).toBe(true);
    expect(input.dataQuality.missingSymbols).toContain('510300.SH');
    expect(displayRatio(null)).toBe('—');
    expect(displayRatio(0)).toBe('0.00%');
  });
  it('分时收益点按真实时刻转换折线，保留零值和负值', () => {
    const data = performanceChartData({
      range: '1D',
      interval: '1h',
      currency: 'CNY',
      availableIntervals: ['1h'],
      defaultInterval: '1h',
      dataQuality: 'COMPLETE',
      historyStart: null,
      points: ['2026-10-23T01:00:00Z', '2026-10-23T02:00:00Z'].map((at, index) => ({
        at,
        value: index ? -1 : 0,
        currency: 'CNY',
        valuationBasis: 'ESTIMATED',
        disclosureCoverage: 1,
        pricedCoverage: 1,
        dataQuality: 'COMPLETE',
        sourceSnapshotId: null,
      })),
    });
    expect(data.main).toBe('line');
    expect(data.candles.map((point) => point.close)).toEqual([0, -1]);
    expect(Number(data.candles[1]!.time) - Number(data.candles[0]!.time)).toBe(3600);
  });
  it('相同查询下保留 FX 参数，历史失败与快照不足分别呈现', async () => {
    view.params = undefined as unknown as Record<string, unknown>;
    const urls: URL[] = [];
    setApi(
      vi.fn(async (url: RequestInfo | URL) => {
        const parsed = new URL(String(url));
        urls.push(parsed);
        if (parsed.pathname.endsWith('/accounts')) return Response.json([ledgerAccount]);
        if (parsed.pathname.endsWith('/summary'))
          return Response.json({
            accountId: null,
            snapshots: [],
            ttwror: null,
            xirr: null,
            ttwrorReason: '快照不足',
            xirrReason: '快照不足',
          });
        if (parsed.pathname.endsWith('/history'))
          return Response.json({ error: 'Unavailable', message: '历史读取失败' }, { status: 503 });
        if (parsed.pathname.endsWith('/layers')) return Response.json(layers);
        if (parsed.pathname.endsWith('/targets'))
          return Response.json({ scope: 'portfolio', accountId: null, targets: {} });
        if (parsed.pathname.endsWith('/allocation'))
          return Response.json({
            allocation: [],
            rebalance: [],
            partial: true,
            missingSymbols: [],
          });
        return Response.json({
          range: '1Y',
          interval: '1d',
          currency: parsed.searchParams.get('baseCurrency'),
          availableIntervals: ['1d'],
          defaultInterval: '1d',
          dataQuality: 'UNAVAILABLE',
          historyStart: null,
          points: [],
        });
      }),
    );
    await mount(<PerformanceScreen />);
    await click(button('港币'));
    await click(button('使用汇率合并'));
    await click(button('应用收益筛选'));
    const latestSummary = urls.filter((url) => url.pathname.endsWith('/summary')).at(-1)!;
    expect(latestSummary.searchParams.get('baseCurrency')).toBe('HKD');
    expect(latestSummary.searchParams.get('fxMerge')).toBe('true');
    expect(latestSummary.searchParams.get('mode')).toBe('shadow');
    expect(document.body.textContent).toContain('历史读取失败');
    expect(document.body.textContent).toContain('快照不足');
  });
});
