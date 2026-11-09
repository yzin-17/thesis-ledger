// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FundNavHistory, TradeChartQuery, TradeChartResponse } from '@thesis-ledger/schemas';
import { useFundNavTrades, type FundNavTrades } from './useFundNavTrades.js';
import type { MarketDetailPosition } from './market-detail.types.js';

const { read } = vi.hoisted(() => ({
  read: vi.fn<(input: TradeChartQuery, signal?: AbortSignal) => Promise<TradeChartResponse>>(),
}));
vi.mock('../../shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ portfolio: { getTradeChart: read } }),
}));
const history = [
  { symbol: '000001.OF', navDate: '2026-11-02T00:00:00Z' },
  { symbol: '000001.OF', navDate: '2026-11-04T00:00:00Z' },
] as FundNavHistory;
const position: MarketDetailPosition = {
  accountId: 'a',
  mode: 'actual',
  symbol: '000001.OF',
  asset: { name: '基金' },
};
const response = (input: TradeChartQuery): Extract<TradeChartResponse, { status: 'ready' }> => ({
  ...input,
  version: 'trade-chart-v1',
  status: 'ready',
  ledgerRevision: '1',
  projectionGeneration: '1',
  generatedAt: '2026-11-07T00:00:00Z',
  omittedCount: 0,
  unplacedCount: 0,
  unplacedCountScope: 'symbol-all-dates',
  markers: [
    {
      id: 'buy:1',
      eventId: 'e1',
      factId: 'f1',
      tradingDate: '2026-11-02',
      occurredAt: '2026-11-02T00:00:00Z',
      timePrecision: 'DATE',
      side: 'buy',
      price: '1.2',
      quantity: '10',
      currency: 'CNY',
    },
  ],
});
const update = (callback: () => void) =>
  act(async () => {
    callback();
    await Promise.resolve();
  });

let root: Root, host: HTMLDivElement, client: QueryClient, model: FundNavTrades;
function Probe({ value }: { value: MarketDetailPosition | undefined }) {
  model = useFundNavTrades(history, value);
  return null;
}
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
async function mount(value: MarketDetailPosition | undefined) {
  await update(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe value={value} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  read.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await update(() => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

it('只读取当前账户、模式、完整基金代码及已加载净值范围', async () => {
  read.mockImplementation((input) => Promise.resolve(response(input)));
  await mount(position);
  expect(read).toHaveBeenCalledWith(
    { accountId: 'a', mode: 'actual', symbol: '000001.OF', start: '2026-11-02', end: '2026-11-04' },
    expect.any(AbortSignal),
  );
  expect(model.groups).toHaveLength(1);
  await mount({ ...position, mode: 'shadow' });
  expect(read.mock.calls.at(-1)![0]).toMatchObject({ mode: 'shadow' });
});
it('目录或聚合入口没有明确账户时不查询，标的不匹配不沿用旧标记', async () => {
  await mount(undefined);
  expect(read).not.toHaveBeenCalled();
  expect(model.enabled).toBe(false);
  await mount({ ...position, symbol: '000002.OF' });
  expect(read).not.toHaveBeenCalled();
  expect(model.groups).toEqual([]);
});
it('切换账户取消前次请求，迟到结果不能进入新账户；失败可重试', async () => {
  let resolveOld!: (value: TradeChartResponse) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await mount(position);
  const signal = read.mock.calls[0]![1] as AbortSignal;
  read.mockRejectedValueOnce(new Error('failed'));
  await mount({ ...position, accountId: 'b' });
  expect(signal.aborted).toBe(true);
  expect(model.groups).toEqual([]);
  expect(model.error).toBe(true);
  await update(() => resolveOld(response(read.mock.calls[0]![0])));
  await flush();
  expect(model.groups).toEqual([]);
  read.mockImplementationOnce((input) => Promise.resolve(response(input)));
  await update(() => model.retry());
  await flush();
  expect(model.groups).toHaveLength(1);
});
it('同范围刷新保留标记直到最后请求完成，失败保留同范围数据', async () => {
  read.mockImplementationOnce((input) => Promise.resolve(response(input)));
  await mount(position);
  let reject!: (error: Error) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await update(() => model.retry());
  await flush();
  expect(model.loading).toBe(true);
  expect(model.groups).toHaveLength(1);
  await update(() => reject(new Error('failed')));
  await flush();
  expect(model.error).toBe(true);
  expect(model.groups).toHaveLength(1);
});
it('空成交、缺净值日期及来源不可用分别说明；响应账户不匹配时拒绝显示', async () => {
  read.mockImplementationOnce((input) =>
    Promise.resolve({
      ...response(input),
      markers: [],
      unplacedCount: 1,
    }),
  );
  await mount(position);
  expect(model.notice).toContain('暂无可显示');
  expect(model.notice).toContain('缺少日期');
  read.mockImplementationOnce((input) =>
    Promise.resolve({
      ...response(input),
      markers: [{ ...response(input).markers[0]!, tradingDate: '2026-11-03' }],
    }),
  );
  await update(() => model.retry());
  await flush();
  expect(model.notice).toContain('当天无净值');
  read.mockImplementationOnce((input) =>
    Promise.resolve({
      ...response(input),
      status: 'unavailable',
      reason: 'projection_inconsistent',
    }),
  );
  await update(() => model.retry());
  await flush();
  expect(model.notice).toContain('正在更新');
  expect(model.unavailable).toBe(true);
  read.mockImplementationOnce((input) =>
    Promise.resolve(response({ ...input, accountId: 'other' })),
  );
  await update(() => model.retry());
  await flush();
  expect(model.groups).toEqual([]);
  expect(model.error).toBe(true);
});
