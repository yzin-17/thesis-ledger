// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundCurrentValuation } from './FundCurrentValuation.js';

const { getFundValuation } = vi.hoisted(() => ({ getFundValuation: vi.fn() }));
vi.mock('../../shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ market: { getFundValuation } }),
}));
const result = {
  version: 1, symbol: '000001.OF', marketState: 'open', quality: 'low_coverage',
  estimatedNav: 1.025, changePercent: 2.5,
  anchor: { unitNav: 1, navDate: '2026-11-03T00:00:00Z' },
  estimatedAt: '2026-11-04T06:00:00Z', oldestPriceAt: '2026-11-04T05:59:00Z',
  disclosureCoverage: 0.25, pricedCoverage: 0.25, reasons: ['low_coverage'],
  method: 'disclosed-holdings-qfq-v1',
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const interact = async (work: () => void) => act(async () => { work(); await Promise.resolve(); });
const mount = async (symbol: string) => {
  await interact(() => root.render(<QueryClientProvider client={client}><FundCurrentValuation symbol={symbol} /></QueryClientProvider>));
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  getFundValuation.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await interact(() => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
});

describe('详情页盘中估值', () => {
  it('日历未知不显示已休市，也不伪造估值，允许重试', async () => {
    getFundValuation.mockResolvedValue({ ...result, marketState: 'unknown', quality: 'unavailable', estimatedNav: null, estimatedAt: null, changePercent: null, reasons: ['calendar_unavailable'] });
    await mount(result.symbol);
    expect(host.textContent).toContain('交易时段未知');
    expect(host.textContent).toContain('重试估值');
    expect(host.textContent).not.toContain('已休市');
    expect(host.textContent).not.toContain('1.0250');
  });
  it('休市保留最后有效值的日期与低覆盖状态', async () => {
    getFundValuation.mockResolvedValue({ ...result, marketState: 'closed', reasons: ['market_closed', 'low_coverage'] });
    await mount(result.symbol);
    expect(host.textContent).toContain('1.0250');
    expect(host.textContent).toMatch(/已休市 · 低覆盖 · .*14:00/);
  });
  it('展示估值、涨跌幅、真实估值时间和低覆盖状态', async () => {
    getFundValuation.mockResolvedValue(result);
    await mount(result.symbol);
    expect(getFundValuation).toHaveBeenCalledWith(result.symbol, expect.any(AbortSignal));
    expect(host.textContent).toContain('1.0250');
    expect(host.textContent).toContain('+2.50%');
    expect(host.textContent).toMatch(/低覆盖 · .*14:00/);
  });
  it('休市未提供估值时显示缺失，失败允许重试', async () => {
    getFundValuation.mockResolvedValueOnce({ ...result, marketState: 'closed', quality: 'unavailable', estimatedNav: null, changePercent: null, estimatedAt: null, reasons: ['market_closed'] });
    await mount(result.symbol);
    expect(host.textContent).toContain('已休市'); expect(host.textContent).not.toContain('0.0000');
    getFundValuation.mockRejectedValueOnce(new Error('failed'));
    await mount('161725.OF');
    expect(host.textContent).toContain('读取失败');
    getFundValuation.mockResolvedValueOnce({ ...result, symbol: '161725.OF' });
    await interact(() => [...host.querySelectorAll('button')].find((button) => button.textContent === '重试估值')!.click());
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(host.textContent).toContain('1.0250');
  });
  it('切换基金后不展示旧基金的延迟响应', async () => {
    let finish: ((value: typeof result) => void) | undefined;
    getFundValuation.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await mount(result.symbol);
    getFundValuation.mockResolvedValueOnce({ ...result, symbol: '161725.OF', estimatedNav: 2 });
    await mount('161725.OF');
    await interact(() => finish?.(result));
    expect(host.textContent).toContain('2.0000'); expect(host.textContent).not.toContain('1.0250');
  });
});
