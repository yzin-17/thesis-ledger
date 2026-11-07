// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformancePnlResponse } from '@thesis-ledger/schemas';
import { PerformanceAnalysisTrend } from '../src/features/performance/PerformanceAnalysisTrend.js';
import { getDesktopApiClient } from '../src/shared/api/client.js';
import type { Portfolio } from '../src/features/portfolio/portfolio.types.js';

vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const getPnlSeries = vi.fn();
const history: PerformancePnlResponse = {
  mode: 'actual',
  accountId: null,
  currency: 'CNY',
  range: '1M',
  basis: 'REALIZED_PLUS_UNREALIZED',
  historyStart: '2026-11-01T08:00:00Z',
  truncated: false,
  points: [
    {
      at: '2026-11-01T08:00:00Z',
      value: -20,
      realizedPnl: 0,
      unrealizedPnl: -20,
      sourceSnapshotId: 's1',
      reason: null,
    },
    {
      at: '2026-11-02T08:00:00Z',
      value: null,
      realizedPnl: null,
      unrealizedPnl: null,
      sourceSnapshotId: 's2',
      reason: 'price_unavailable',
    },
    {
      at: '2026-11-03T08:00:00Z',
      value: 10,
      realizedPnl: 5,
      unrealizedPnl: 5,
      sourceSnapshotId: 's3',
      reason: null,
    },
  ],
};
const trend = {
  baseCurrency: 'CNY',
  loadState: 'ready',
  snapshots: [],
  range: '1M',
  interval: '1d',
  onRangeChange: vi.fn(),
  onIntervalChange: vi.fn(),
  series: {
    range: '1M',
    interval: '1d',
    currency: 'CNY',
    availableIntervals: ['1d'],
    defaultInterval: '1d',
    dataQuality: 'COMPLETE',
    points: [],
  },
} satisfies Omit<
  ComponentProps<typeof PerformanceAnalysisTrend>,
  'portfolio' | 'mode' | 'accountId'
>;
const portfolio = {
  valuedAt: '2026-11-04T10:00:00Z',
  cumulativePnl: -58.9,
  realizedPnl: 0,
  unrealizedPnl: -58.9,
  baseCurrency: 'CNY',
} as Portfolio;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function render(accountId = '', mode: 'actual' | 'shadow' = 'actual', refreshing = false) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PerformanceAnalysisTrend
          {...trend}
          refreshing={refreshing}
          portfolio={portfolio}
          accountId={accountId}
          mode={mode}
        />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === text,
  )!;
  await act(async () => button.click());
  await settle();
}
beforeEach(() => {
  getPnlSeries.mockReset().mockResolvedValue(history);
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  vi.mocked(getDesktopApiClient).mockReturnValue({
    performance: { getPnlSeries },
  } as unknown as ReturnType<typeof getDesktopApiClient>);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
});

describe('累计盈亏图表', () => {
  it('两条曲线首次读取时在图表区域只显示一个加载圈', async () => {
    getPnlSeries.mockImplementation(() => new Promise(() => {}));
    await act(() => root.render(
      <QueryClientProvider client={client}>
        <PerformanceAnalysisTrend {...trend} loadState="loading" refreshing series={undefined}
          portfolio={null} accountId="" mode="actual" />
      </QueryClientProvider>,
    ));
    await settle();
    expect(host.querySelectorAll('[data-slot="spinner"]')).toHaveLength(1);
    expect(host.querySelector('[data-slot="list-refresh-region"] [data-slot="spinner"]')).not.toBeNull();
    expect(host.textContent).not.toContain('完成数据配置');
  });

  it('两项读取共用图内的一个圈，保留原图直到较慢的刷新完成', async () => {
    await render();
    const chart = host.querySelector('svg[role="application"]')!;
    expect(chart).not.toBeNull();
    const lines = [...chart.querySelectorAll('polyline')].map(line => line.getAttribute('points'));
    let finish!: (data: PerformancePnlResponse) => void;
    getPnlSeries.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = client.refetchQueries();
    await render('', 'actual', true);
    const region = chart.closest('[data-slot="list-refresh-region"]')!;
    expect(region.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-slot="spinner"]')).toHaveLength(1);
    await render();
    expect(host.querySelector('svg[role="application"]')).toBe(chart);
    expect([...chart.querySelectorAll('polyline')].map(line => line.getAttribute('points'))).toEqual(lines);
    expect(region.getAttribute('aria-busy')).toBe('true');
    await act(async () => { finish(history); await pending; });
    await settle();
    expect(region.querySelector('[data-slot="spinner"]')).toBeNull();
  });
  it('当前金额与卡片一致，区间使用中文，并支持键盘读取历史和空点', async () => {
    await render();
    expect(host.textContent).toContain('-¥58.90');
    expect(host.textContent).toContain('1 个盈亏时点行情数据不完整，已留空');
    const svg = host.querySelector('svg[role="application"]')!;
    await act(async () => svg.focus());
    expect(host.querySelector('[role="status"]')?.textContent).toContain('当前估值');
    await act(async () =>
      svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain('¥10.00');
    await act(async () =>
      svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })),
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain('行情数据不完整');
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PerformanceAnalysisTrend
            {...trend}
            range="3M"
            portfolio={portfolio}
            accountId=""
            mode="actual"
          />
        </QueryClientProvider>,
      ),
    );
    await settle();
    expect(getPnlSeries).toHaveBeenLastCalledWith(
      expect.objectContaining({ range: '3M', mode: 'actual' }),
      expect.any(AbortSignal),
    );
  });
  it('无历史时展示当前单点，零盈亏不当作空数据', async () => {
    getPnlSeries.mockResolvedValue({ ...history, points: [] });
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PerformanceAnalysisTrend
            {...trend}
            portfolio={{ ...portfolio, cumulativePnl: 0 }}
            accountId=""
            mode="actual"
          />
        </QueryClientProvider>,
      ),
    );
    await settle();
    expect(host.textContent).toContain('¥0.00');
    expect(host.textContent).toContain('当前仅有一个可用盈亏点');
    expect(host.querySelectorAll('circle')).toHaveLength(1);
  });
  it('历史失败仍展示当前盈亏并可重试', async () => {
    getPnlSeries.mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(host.textContent).toContain('历史盈亏读取失败');
    expect(host.textContent).toContain('-¥58.90');
    await click('重新加载');
    expect(host.textContent).not.toContain('历史盈亏读取失败');
    expect(host.querySelector('svg[role="application"]')).not.toBeNull();
  });
  it('资产读取失败仍展示盈亏；盈亏失败不隐藏已有资产', async () => {
    const seriesPoint = {
      at: '2026-11-03T08:00:00Z',
      value: 100000,
      currency: 'CNY',
      valuationBasis: 'OFFICIAL',
      disclosureCoverage: 1,
      pricedCoverage: 1,
      dataQuality: 'COMPLETE',
      sourceSnapshotId: 'asset-1',
    } as const;
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PerformanceAnalysisTrend
            {...trend}
            loadState="error"
            portfolio={portfolio}
            accountId=""
            mode="actual"
          />
        </QueryClientProvider>,
      ),
    );
    await settle();
    expect(host.querySelector('svg[role="application"]')).not.toBeNull();
    expect(host.textContent).toContain('-¥58.90');
    getPnlSeries.mockRejectedValue(new Error('offline'));
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PerformanceAnalysisTrend
            {...trend}
            series={{ ...trend.series, points: [seriesPoint] }}
            portfolio={portfolio}
            accountId="b"
            mode="actual"
          />
        </QueryClientProvider>,
      ),
    );
    await settle();
    expect(host.textContent).toContain('历史盈亏读取失败');
    expect(host.querySelector('polyline.stroke-chart-1')?.getAttribute('points')).not.toBe('');
    expect(host.querySelector('svg[role="application"]')).not.toBeNull();
  });
  it('未合并多币种各自保留资产尺度，盈亏只进入原本位币图', async () => {
    const snapshots = ['CNY', 'USD'].map((currency, index) => ({
      id: `asset-${index}`,
      capturedAt: '2026-11-03T08:00:00Z',
      marketValue: 100,
      cashValue: 0,
      costValue: 80,
      partial: false,
      missingSymbols: [],
      currency,
    })) as ComponentProps<typeof PerformanceAnalysisTrend>['snapshots'];
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PerformanceAnalysisTrend
            {...trend}
            groupedByCurrency
            snapshots={snapshots}
            portfolio={portfolio}
            accountId=""
            mode="actual"
          />
        </QueryClientProvider>,
      ),
    );
    await settle();
    expect(host.querySelectorAll('svg[role="application"]')).toHaveLength(2);
    expect(host.querySelectorAll('[aria-label="资产总值与累计盈亏走势"]')).toHaveLength(1);
    expect(host.textContent).toContain('USD 资产走势');
    expect(host.textContent).toContain('累计盈亏 · CNY');
  });
  it('账户与模式切换不展示迟到的旧范围曲线', async () => {
    const resolves: Array<(value: PerformancePnlResponse) => void> = [];
    getPnlSeries.mockImplementation(() => new Promise((resolve) => resolves.push(resolve)));
    await render('a');
    await render('b', 'shadow');
    expect(getPnlSeries.mock.calls[1]![0]).toMatchObject({ mode: 'shadow', accountId: 'b' });
    await act(async () => resolves[0]!(history));
    await settle();
    expect(host.querySelector('[aria-label="正在读取盈亏历史"]')).not.toBeNull();
    await act(async () => resolves[1]!({ ...history, points: [], mode: 'shadow' }));
    await settle();
    expect(host.textContent).toContain('当前仅有一个可用盈亏点');
    expect(host.textContent).not.toContain('1 个盈亏时点');
  });
});
