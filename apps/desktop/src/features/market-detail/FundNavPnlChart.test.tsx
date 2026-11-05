// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';
import { FundNavPnlChart } from './FundNavPnlChart.js';
import { instrumentPnlPoints } from './instrument-pnl-model.js';
import type { MarketDetailPosition } from './market-detail.types.js';

const { getPnlSeries } = vi.hoisted(() => ({ getPnlSeries: vi.fn() }));
vi.mock('../../shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ performance: { getPnlSeries } }),
}));
vi.mock('./MarketNavChart.js', () => ({
  FundNavHistoryChart: ({
    pnl,
  }: {
    pnl?: { points: PnlChartPoint[]; notice?: ReactNode };
  }) => (
    <div data-market-nav-chart data-points={JSON.stringify(pnl?.points)}>
      <span>单位净值</span>
      <span>
        {pnl?.points.at(-1)?.value == null
          ? '—'
          : new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(
              pnl.points.at(-1)!.value!,
            )}
      </span>
      {pnl?.notice}
    </div>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const accountId = '11111111-1111-4111-8111-111111111111';
const position: MarketDetailPosition = {
  symbol: '000001.OF',
  accountId,
  accountName: '基金账户',
  mode: 'actual',
  currency: 'CNY',
  valuedAt: '2026-11-04T01:00:00Z',
  pnl: -29.45,
  asset: { name: '华夏成长混合', assetType: 'fund' },
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const interact = async (work: () => void) => act(async () => { work(); await Promise.resolve(); });
const mount = async (value: MarketDetailPosition) => {
  await interact(() =>
    root.render(
      <QueryClientProvider client={client}>
        <FundNavPnlChart history={[]} position={value} />
      </QueryClientProvider>,
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
};
beforeEach(() => {
  getPnlSeries.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await interact(() => root.unmount());
  client.clear();
  host.remove();
});

describe('持仓标的累计盈亏图', () => {
  it('传递账户、模式、完整代码与截止时点，累计值包含已实现收益', async () => {
    getPnlSeries.mockResolvedValue({ points: [], currentRealizedPnl: 10 });
    await mount(position);
    expect(getPnlSeries).toHaveBeenCalledWith(
      {
        accountId,
        mode: 'actual',
        symbol: '000001.OF',
        baseCurrency: 'CNY',
        range: 'ALL',
        asOf: position.valuedAt,
      },
      expect.any(AbortSignal),
    );
    expect(host.querySelectorAll('[data-market-nav-chart]')).toHaveLength(1);
    expect(host.textContent).toContain('单位净值');
    expect(host.textContent).toContain('-¥19.45');
    expect(JSON.parse(host.querySelector('[data-points]')!.getAttribute('data-points')!)).toHaveLength(1);
    expect(
      (JSON.parse(host.querySelector('[data-points]')!.getAttribute('data-points')!) as PnlChartPoint[]).at(-1),
    ).toMatchObject({ value: -19.45, unrealizedPnl: -29.45, realizedPnl: 10 });
  });
  it('切换账户或模式不显示旧账户收益，失败可重试', async () => {
    getPnlSeries.mockResolvedValueOnce({ points: [], currentRealizedPnl: 10 });
    await mount(position);
    getPnlSeries.mockRejectedValueOnce(new Error('failed'));
    await mount({ ...position, accountId: '22222222-2222-4222-8222-222222222222', mode: 'shadow' });
    expect(host.textContent).not.toContain('-¥19.45');
    expect(host.textContent).toContain('读取失败');
    getPnlSeries.mockResolvedValueOnce({ points: [], currentRealizedPnl: 0 });
    await interact(() =>
      [...host.querySelectorAll('button')]
        .find((button) => button.textContent === '重试标的盈亏')!
        .click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(host.textContent).toContain('-¥29.45');
  });
  it('目录入口没有个人持仓上下文时不请求收益', async () => {
    await mount({ symbol: '000001.OF', asset: position.asset });
    expect(getPnlSeries).not.toHaveBeenCalled();
    expect(host.textContent).toContain('单位净值');
  });
  it('已实现未知不把持仓盈亏当累计值；缺行情与零值保持不同语义', () => {
    expect(instrumentPnlPoints([], position.valuedAt!, -29.45, null).at(-1)).toMatchObject({
      value: null,
      reason: 'realized_unavailable',
    });
    expect(instrumentPnlPoints([], position.valuedAt!, null, 0).at(-1)).toMatchObject({
      value: null,
      reason: 'current_unavailable',
    });
    expect(instrumentPnlPoints([], position.valuedAt!, 0, 0).at(-1)).toMatchObject({
      value: 0,
      reason: null,
    });
  });
});
