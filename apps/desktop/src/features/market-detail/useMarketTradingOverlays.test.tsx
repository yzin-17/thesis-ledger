// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tradeChartResponseSchema, type TradeChartResponse } from '@thesis-ledger/schemas';
import { MarketTradingOverlayControls } from './MarketTradingOverlayControls.js';
import { useMarketTradingOverlays } from './useMarketTradingOverlays.js';
import type { MarketDetailPosition } from './market-detail.types.js';
import type { MarketChartBar } from './market-chart-types.js';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import type { TradingOverlayModel, measureChartRange } from './market-trading-overlay-model.js';

const api = vi.hoisted(() => ({
  getTradeChart: vi.fn<ThesisLedgerApiClient['portfolio']['getTradeChart']>(),
}));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ portfolio: api }) }));
const position: MarketDetailPosition = {
  symbol: '600519.SH',
  accountId: '00000000-0000-4000-8000-000000000001',
  mode: 'actual',
  currency: 'CNY',
  costPrice: 10,
  asset: { name: '受控股票', assetType: 'stock' },
};
const bars: MarketChartBar[] = [2, 3, 4].map((day) => ({
  symbol: position.symbol,
  timeframe: '1d',
  adjustment: 'none',
  timestamp: `2026-11-0${day}T00:00:00+08:00`,
  observedAt: '2026-11-04T08:00:00Z',
  open: 10,
  high: 15,
  low: 8,
  close: day + 8,
  volume: 100,
  amount: 1000,
}));
const response = (mode = 'actual'): TradeChartResponse =>
  tradeChartResponseSchema.parse({
    version: 'trade-chart-v1',
    status: 'ready',
    accountId: position.accountId!,
    mode,
    symbol: position.symbol,
    start: '2026-11-02',
    end: '2026-11-04',
    ledgerRevision: '1',
    projectionGeneration: '1',
    generatedAt: '2026-11-04T08:00:00Z',
    omittedCount: 0,
    unplacedCount: 0,
    unplacedCountScope: 'symbol-all-dates',
    markers: [
      {
        id: 'buy-1',
        eventId: 'event-1',
        factId: 'fact-1',
        side: 'buy',
        price: '10',
        quantity: '100',
        currency: 'CNY',
        tradingDate: '2026-11-03',
        occurredAt: '2026-11-03T02:00:00Z',
        timePrecision: 'INSTANT',
      },
    ],
  });
function Harness({
  current = position,
  points = bars,
}: {
  current?: MarketDetailPosition;
  points?: MarketChartBar[];
}) {
  const overlay = useMarketTradingOverlays(points, current);
  return (
    <>
      <MarketTradingOverlayControls overlay={overlay} />
      {points.map((bar) => (
        <button
          key={bar.timestamp}
          onClick={() => overlay.consumeClick(bar.timestamp.slice(0, 10))}
        >
          {bar.timestamp.slice(0, 10)}
        </button>
      ))}
      <output>{JSON.stringify(overlay.model)}</output>
    </>
  );
}
const interact = async (work: () => void) =>
  act(async () => {
    work();
    await Promise.resolve();
  });

describe('交易叠加的账户隔离与交互', () => {
  let root: Root;
  let host: HTMLDivElement;
  let client: QueryClient;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    api.getTradeChart.mockReset().mockResolvedValue(response());
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await interact(() => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  });
  const render = (current = position, points = bars) =>
    interact(() =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness current={current} points={points} />
        </QueryClientProvider>,
      ),
    );
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (value) => value.textContent === label,
    );
    expect(button).toBeDefined();
    await interact(() => button!.click());
  };
  const model = () =>
    JSON.parse(host.querySelector('output')!.textContent) as TradingOverlayModel & {
      measurement?: NonNullable<ReturnType<typeof measureChartRange>>;
    };
  const settled = () =>
    vi.waitFor(async () => {
      await interact(() => {});
      expect(host.textContent).toContain('当前绘制1条成交');
    });

  it('默认关闭时零读取，开启后消费明确账户与模式，关闭即移除标记', async () => {
    await render();
    expect(api.getTradeChart).not.toHaveBeenCalled();
    await click('成交');
    await settled();
    expect(api.getTradeChart.mock.calls[0]![0]).toEqual({
      accountId: position.accountId,
      mode: 'actual',
      symbol: position.symbol,
      start: '2026-11-02',
      end: '2026-11-04',
    });
    expect(model().markers).toHaveLength(1);
    await click('成交');
    expect(model().markers).toEqual([]);
    await click('成本参考');
    expect(model().lines).toEqual([{ price: 10, title: '当前持仓成本参考', kind: 'cost' }]);
  });
  it('模式切换清理所有参考，晚到旧响应不串入；新模式明确开启后才读取', async () => {
    let resolve!: (value: TradeChartResponse) => void;
    api.getTradeChart.mockReturnValueOnce(
      new Promise<TradeChartResponse>((done) => {
        resolve = done;
      }),
    );
    await render();
    await click('成交');
    await click('成本参考');
    await render({ ...position, mode: 'shadow' });
    await interact(() => resolve(response()));
    expect(model()).toMatchObject({ markers: [], lines: [] });
    expect(api.getTradeChart).toHaveBeenCalledTimes(1);
    api.getTradeChart.mockResolvedValue(response('shadow'));
    await click('成交');
    await settled();
    expect(api.getTradeChart.mock.calls[1]![0].mode).toBe('shadow');
  });
  it('测量只使用实际价格点，完成后显示结果，Esc取消中的测量且不冒泡关闭', async () => {
    await render();
    await click('区间测量');
    await click('2026-11-02');
    await click('2026-11-04');
    expect(host.querySelector('[aria-label="价格区间测量结果"]')?.textContent).toContain('20%');
    expect(model().measurement).toMatchObject({ bars: 3, difference: 2 });
    await click('区间测量');
    await click('2026-11-03');
    const parent = vi.fn();
    window.addEventListener('keydown', parent);
    await interact(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(model().measurement).toBeUndefined();
    expect(parent).not.toHaveBeenCalled();
    window.removeEventListener('keydown', parent);
  });
  it('复权行情禁用交易和成本，仍可测量，身份切换后不保留参考', async () => {
    await render();
    await click('成本参考');
    await render(
      position,
      bars.map((bar) => ({ ...bar, adjustment: 'qfq' })),
    );
    expect(model().lines).toEqual([]);
    expect(
      [...host.querySelectorAll('button')].find((button) => button.textContent === '成交')!
        .disabled,
    ).toBe(true);
    expect(
      [...host.querySelectorAll('button')].find((button) => button.textContent === '成本参考')!
        .disabled,
    ).toBe(true);
    await click('区间测量');
    await click('2026-11-02');
    await click('2026-11-04');
    expect(model().measurement!.bars).toBe(3);
    expect(api.getTradeChart).not.toHaveBeenCalled();
  });
});
