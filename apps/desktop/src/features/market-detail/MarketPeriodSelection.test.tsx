import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MarketPeriodSelection, useMarketPeriodControls } from './MarketPeriodSelection.js';

const { useQueryMock, getPeriodOptions } = vi.hoisted(() => ({ useQueryMock: vi.fn(), getPeriodOptions: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown): unknown => useQueryMock(options) }));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ market: { getPeriodOptions } }) }));
vi.mock('@/components/ui/toggle-group', () => ({
  ToggleGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ToggleGroupItem: ({ children, value }: { children: ReactNode; value: string }) => <button data-period={value}>{children}</button>,
}));
function Controls() { return <>{useMarketPeriodControls()}</>; }
const render = (enabled = true, adjustment: 'none' | 'qfq' | 'hfq' = 'qfq') => renderToStaticMarkup(
  <MarketPeriodSelection symbol="159516.SZ" enabled={enabled} adjustment={adjustment}>
    {(period) => <><output>{period}</output><Controls /></>}
  </MarketPeriodSelection>,
);

describe('周期能力与偏好消费', () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) } });
    useQueryMock.mockReset();
    getPeriodOptions.mockReset();
    useQueryMock.mockReturnValue({ isSuccess: true, data: { options: [
      { timeframe: '1w', available: true }, { timeframe: '1mo', available: false },
    ] } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('只呈现可用周期，区间偏好不影响周期选择', () => {
    storage.set('thesis-ledger:market-period:159516.SZ', '1w');
    storage.set('thesis-ledger:market-chart:159516.SZ', JSON.stringify({ visibleRange: 365 }));
    const html = render();
    expect(html).toContain('<output>1w</output>');
    expect(html).toContain('周线');
    expect(html).toContain('日线');
    expect(html).not.toContain('月线');
  });
  it('偏好周期不可用时本次渲染立即回退日线', () => {
    storage.set('thesis-ledger:market-period:159516.SZ', '1mo');
    expect(render()).toContain('<output>1d</output>');
  });
  it('基金不渲染周期并关闭能力查询', () => {
    storage.set('thesis-ledger:market-period:159516.SZ', '1w');
    const html = render(false);
    expect(html).toBe('<output>1d</output>');
    expect(useQueryMock.mock.calls[0]?.[0]).toMatchObject({ enabled: false });
  });
  it.each(['none', 'qfq', 'hfq'] as const)('能力查询与当前 %s 口径同键同请求', async (adjustment) => {
    render(true, adjustment);
    const options = useQueryMock.mock.calls[0]![0] as {
      queryKey: unknown[]; queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
    };
    expect(options.queryKey).toEqual(['desktop', 'market-period-options', '159516.SZ', adjustment, 90]);
    const signal = new AbortController().signal;
    await options.queryFn({ signal });
    expect(getPeriodOptions).toHaveBeenCalledWith('159516.SZ', { adjustment, barsLimit: 90, signal });
    const annualOptions = useQueryMock.mock.calls[1]![0] as typeof options;
    expect(annualOptions.queryKey).toEqual(['desktop', 'market-period-options', '159516.SZ', adjustment, 2]);
    await annualOptions.queryFn({ signal });
    expect(getPeriodOptions).toHaveBeenCalledWith('159516.SZ', { adjustment, barsLimit: 2, signal });
  });
});
