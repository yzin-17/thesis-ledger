// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketPeriodSelection, marketPeriodPreferenceKey, useMarketPeriodNotice, type ChartPeriod } from './MarketPeriodSelection.js';
import { MarketPriceChart } from './MarketDetailCharts.js';
import { defaultPreference, preferenceKey, readPreference } from './market-chart-preferences.js';
import type { MarketChartBar } from './market-chart-types.js';
import type * as LightweightChartModule from './MarketPriceLightweightChart.js';

const api = vi.hoisted(() => ({
  getPeriodOptions:
    vi.fn<
      (
        symbol: string,
        request: { barsLimit: number },
      ) => Promise<{ options: Array<{ timeframe: string; available: boolean }> }>
    >(),
}));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: api }) }));
vi.mock('./MarketPriceLightweightChart.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LightweightChartModule>();
  return { ...actual, LightweightMarketChart: () => <div data-controlled-chart /> };
});

const interact = async (action: () => void) => {
  await act(async () => {
    action();
    await Promise.resolve();
  });
};
const symbol = '159516.SZ';
function SelectionNotice() { return <>{useMarketPeriodNotice()}</>; }
const key = () => marketPeriodPreferenceKey;
const queryKey = (barsLimit: number, currentSymbol = symbol) => [
  'desktop',
  'market-period-options',
  currentSymbol,
  'qfq',
  barsLimit,
];
const options = (available: string[]) => ({
  options: ['5d', '1w', '1mo', '1y'].map((timeframe) => ({
    timeframe,
    available: available.includes(timeframe),
  })),
});
const bars = (period: ChartPeriod): MarketChartBar[] =>
  ['2024-01-02', '2026-09-30'].map((date) => ({
    timestamp: `${date}T07:00:00Z`,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 100,
    amount: 1100,
    completionStatus: 'complete',
    availableAt: `${date}T07:00:00Z`,
    symbol,
    timeframe: period,
    timeframeKind: period === '1d' ? 'base' : 'derived',
    provider: 'tencent',
    upstreamSource: '腾讯',
    adjustment: 'qfq',
  }));

describe('周期选择的实际组件交互', () => {
  let root: Root;
  let host: HTMLDivElement;
  let client: QueryClient;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    api.getPeriodOptions.mockReset();
    api.getPeriodOptions.mockResolvedValue(options(['5d', '1w', '1mo', '1y']));
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await interact(() => root.unmount());
    client.clear();
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const wait = async (assertion: () => void) =>
    vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assertion();
    });
  const render = async (currentSymbol = symbol, enabled = true) => {
    await interact(() =>
      root.render(
        <QueryClientProvider client={client}>
          <MarketPeriodSelection symbol={currentSymbol} enabled={enabled}>
            {(period) => (
              <div>
                <output data-period>{period}</output>
                <SelectionNotice />
                <MarketPriceChart key={`${currentSymbol}:${period}`} bars={bars(period)} />
              </div>
            )}
          </MarketPeriodSelection>
        </QueryClientProvider>,
      ),
    );
  };
  const click = async (label: string) => {
    const button = Array.from(host.querySelectorAll('button')).find(
      (item) => item.textContent === label,
    );
    expect(button, label).toBeDefined();
    await interact(() => button!.click());
  };
  const period = () => host.querySelector('[data-period]')?.textContent;
  const buttons = () => host.querySelector('[data-market-chart-toolbar-group="周期"]')?.textContent;

  it('按非年度 90 点与年度 2 点的实际窗口声明选项', async () => {
    api.getPeriodOptions.mockImplementation((_symbol, request: { barsLimit: number }) =>
      Promise.resolve(options(request.barsLimit === 90 ? ['1w'] : ['1mo', '1y'])),
    );
    await render();
    await wait(() => expect(buttons()).toContain('年线'));
    expect(buttons()).toContain('周线');
    expect(buttons()).not.toContain('月线');
    expect(api.getPeriodOptions.mock.calls.map((call) => call[1].barsLimit).sort()).toEqual([
      2, 90,
    ]);
  });

  it('周期和区间实际点击互不覆盖，重开恢复周期及区间偏好', async () => {
    localStorage.setItem(preferenceKey, JSON.stringify({ ...defaultPreference, visibleRange: 30 }));
    await render();
    await wait(() => expect(buttons()).toContain('周线'));
    await click('周线');
    expect(period()).toBe('1w');
    expect(readPreference().visibleRange).toBe(30);
    await click('1年');
    expect(readPreference().visibleRange).toBe(365);
    expect(localStorage.getItem(key())).toBe('1w');
    await click('月线');
    expect(readPreference().visibleRange).toBe(365);
    expect(localStorage.getItem(key())).toBe('1mo');
    await interact(() => root.unmount());
    root = createRoot(host);
    await render();
    expect(period()).toBe('1mo');
    expect(host.querySelector('[aria-label="行情区间"] [data-pressed]')?.textContent).toBe('1年');
    expect(host.textContent).toContain('派生');
    expect(host.textContent).toContain('腾讯');
  });

  it('能力失效立即回退并持久化中文提示，提示不泄漏到另一标的', async () => {
    localStorage.setItem(key(), '1w');
    localStorage.setItem('thesis-ledger:market-period:600519.SH', '1mo');
    await render();
    await wait(() => expect(buttons()).toContain('周线'));
    await interact(() => {
      client.setQueryData(queryKey(90), options([]));
    });
    await wait(() => expect(period()).toBe('1d'));
    expect(localStorage.getItem(key())).toBe('1d');
    expect(host.textContent).toContain('周线当前不可用，已切换为日线。');
    await render('600519.SH');
    await wait(() => expect(buttons()).toContain('月线'));
    expect(period()).toBe('1d');
    expect(host.textContent).not.toContain('已切换为日线');
    expect(localStorage.getItem(key())).toBe('1d');
    expect(localStorage.getItem('thesis-ledger:market-period:600519.SH')).toBe('1mo');
  });

  it('实际切换标的复用周期，基金不覆盖共享偏好，区间保持独立', async () => {
    localStorage.setItem(preferenceKey, JSON.stringify({ ...defaultPreference, visibleRange: 30 }));
    await render();
    await wait(() => expect(buttons()).toContain('周线'));
    await click('周线');
    await render('600519.SH');
    await wait(() => expect(buttons()).toContain('周线'));
    expect(period()).toBe('1w');
    expect(readPreference().visibleRange).toBe(30);
    await render('159516.OF', false);
    expect(period()).toBe('1d');
    expect(localStorage.getItem(key())).toBe('1w');
    await render('159001.SZ');
    await wait(() => expect(buttons()).toContain('周线'));
    expect(period()).toBe('1w');
    expect(readPreference().visibleRange).toBe(30);
  });

  it('年度只由两点能力决定回退，不受 90 点年度拒绝影响', async () => {
    localStorage.setItem(key(), '1y');
    await render();
    await wait(() => expect(buttons()).toContain('年线'));
    await interact(() => {
      client.setQueryData(queryKey(90), options([]));
    });
    expect(period()).toBe('1y');
    await interact(() => {
      client.setQueryData(queryKey(2), options([]));
    });
    await wait(() => expect(period()).toBe('1d'));
    expect(host.textContent).toContain('年线当前不可用');
  });

  it('基金无周期组、不读取能力、不覆盖已保存周期', async () => {
    localStorage.setItem(key(), '1w');
    await render(symbol, false);
    expect(period()).toBe('1d');
    expect(buttons()).toBeUndefined();
    expect(api.getPeriodOptions).not.toHaveBeenCalled();
    expect(localStorage.getItem(key())).toBe('1w');
  });

  it('能力读取失败不冒充成功确认不可用，也不删除偏好', async () => {
    localStorage.setItem(key(), '1w');
    api.getPeriodOptions.mockRejectedValue(new Error('受控连接失败'));
    await render();
    await wait(() => expect(client.getQueryState(queryKey(90))?.status).toBe('error'));
    expect(period()).toBe('1w');
    expect(localStorage.getItem(key())).toBe('1w');
    expect(host.textContent).not.toContain('已切换为日线');
  });
});
