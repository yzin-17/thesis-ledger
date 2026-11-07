// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceTrendControls } from '../src/features/performance/PerformanceTrendControls.js';
import { performanceSeriesSelection } from '../src/features/performance/performance-series-selection.js';
import { PerformanceSnapshotTable } from '../src/features/performance/PerformanceTrendSection.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});
const defaults = {
  range: '1Y',
  interval: '1d',
  onRangeChange: vi.fn(),
  onIntervalChange: vi.fn(),
} as const;
async function render(props: Partial<ComponentProps<typeof PerformanceTrendControls>> = {}) {
  await act(() => root.render(<PerformanceTrendControls {...defaults} {...props} />));
}
async function open(label = '走势粒度') {
  await act(() => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
}
function option(label: string) {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (el) => el.textContent === label,
  )!;
}

describe('收益趋势选择约束', () => {
  it('无成功响应时仍禁止年度分线和时线，并提供可访问说明', async () => {
    await render();
    await open();
    expect(option('分线').getAttribute('aria-disabled')).toBe('true');
    expect(option('时线').getAttribute('aria-disabled')).toBe('true');
    expect(option('日线').getAttribute('aria-disabled')).not.toBe('true');
    const hint = host.querySelector('[aria-label="走势粒度"]')!.getAttribute('aria-describedby')!;
    expect(document.getElementById(hint)!.textContent).toContain('分线支持 1日、5日');
  });
  it('不同区间的旧响应不禁用新范围的分线和时线', async () => {
    const series = { range: '1Y', availableIntervals: ['1d'] } as ComponentProps<
      typeof PerformanceTrendControls
    >['series'];
    await render({ range: '1D', interval: '1min', series });
    await open();
    expect(option('分线').getAttribute('aria-disabled')).not.toBe('true');
    expect(option('时线').getAttribute('aria-disabled')).not.toBe('true');
    expect(option('日线').getAttribute('aria-disabled')).toBe('true');
  });
  it('同区间服务端能力进一步约束选项', async () => {
    const series = { range: '1Y', availableIntervals: ['1d'] } as ComponentProps<
      typeof PerformanceTrendControls
    >['series'];
    await render({ series });
    await open();
    expect(option('周线').getAttribute('aria-disabled')).toBe('true');
  });
  it('从近1年切换1日会提交合法分钟粒度', async () => {
    const change = vi.fn();
    await render({ onRangeChange: change });
    await open('走势区间');
    await act(() => {
      option('1日').focus();
      option('1日').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith('1D', '1min');
  });
  it('模拟账户首载禁用盘中粒度和1日区间', async () => {
    await render({ range: '5D', mode: 'shadow' });
    await open();
    expect(option('分线').getAttribute('aria-disabled')).toBe('true');
    expect(option('时线').getAttribute('aria-disabled')).toBe('true');
    await act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    await open('走势区间');
    expect(option('1日').getAttribute('aria-disabled')).toBe('true');
  });
  it.each([
    ['1D', '1min', 'shadow', '5D', '1d'],
    ['1M', '1h', 'shadow', '1M', '1d'],
    ['1D', '1d', 'actual', '1D', '1min'],
    ['1Y', '1min', 'actual', '1Y', '1d'],
    ['5D', '1h', 'actual', '5D', '1h'],
    ['ALL', '1y', 'shadow', 'ALL', '1y'],
  ] as const)('请求前规范化 %s/%s/%s', (range, interval, mode, nextRange, nextInterval) => {
    expect(performanceSeriesSelection(range, interval, mode)).toEqual({
      range: nextRange,
      interval: nextInterval,
    });
  });
});

describe('收益趋势读取反馈', () => {
  it('两路失败采用相同提示结构，分别重试且不清空可用图表', async () => {
    const retryAsset = vi.fn();
    const retryPnl = vi.fn();
    await act(() =>
      root.render(
        <PerformanceSnapshotTable
          {...defaults}
          loadState="stale"
          snapshots={[]}
          onRetry={retryAsset}
          pnl={{
            points: [
              {
                at: '2026-11-06T08:00:00Z',
                value: 12,
                current: true,
                realizedPnl: 0,
                unrealizedPnl: 12,
                sourceSnapshotId: null,
                reason: null,
              },
            ],
            currency: 'CNY',
            loading: false,
            error: true,
            historyEmpty: false,
            truncated: false,
            currentUnavailable: false,
            onRetry: retryPnl,
          }}
        />,
      ),
    );
    const banners = [...host.querySelectorAll('[data-slot="alert"]')];
    expect(banners).toHaveLength(2);
    expect(banners[0]!.className).toBe(banners[1]!.className);
    expect(banners.map((el) => el.querySelector('[data-slot="alert-title"]')!.textContent)).toEqual(
      ['资产走势读取失败', '历史盈亏读取失败'],
    );
    expect(host.textContent).not.toContain('数据可能陈旧');
    expect(host.querySelector('svg[role="application"]')).not.toBeNull();
    await act(() => banners[0]!.querySelector('button')!.click());
    expect(retryAsset).toHaveBeenCalledTimes(1);
    expect(retryPnl).not.toHaveBeenCalled();
    await act(() => banners[1]!.querySelector('button')!.click());
    expect(retryPnl).toHaveBeenCalledTimes(1);
    expect(banners.every((el) => el.querySelector('button')!.textContent === '重新加载')).toBe(
      true,
    );
  });
});
