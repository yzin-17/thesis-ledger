// @vitest-environment jsdom
import { act, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDisplayDetailResponse, MarketDetailRequest } from '@thesis-ledger/api-client';
import type { MarketSession, MarketTimeframe } from '@thesis-ledger/schemas';
import { useMarketDetailQuery, minuteSessionIsOpen } from './useMarketDetailQuery.js';
import { useMarketChartLatestRefresh } from './useMarketChartLatestRefresh.js';
import { buildChartPoints } from './market-chart-model.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./market-detail.api.js', () => ({ requestMarketDetail: request }));
const NOW = Date.parse('2026-11-09T02:00:00Z');
const params = { fast: 12, slow: 26, signal: 9, short: 6, mid: 12, long: 24 };
let sessionState: MarketSession['state'];
let sequence: number;
let failBars: boolean;
let failSession: boolean;
const session = (): MarketSession => ({
  state: sessionState,
  tradingDayState: sessionState,
  evaluatedAt: new Date().toISOString(),
  nextBoundaryAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  market: 'CN',
  timezone: 'Asia/Shanghai',
  calendarRevision: 'controlled',
  sessions: [],
});
const response = (input: MarketDetailRequest): MarketDisplayDetailResponse => {
  const at = new Date().toISOString();
  return {
    contractVersion: 3,
    symbol: input.symbol,
    assetType: 'STOCK',
    identity: { source: 'asset', status: 'confirmed' },
    requested: ['quote', 'bars'],
    capabilities: { supported: ['quote', 'bars'], unsupported: [] },
    limits: { bars: 90, nav: 90 },
    dependencies: {},
    requestId: `controlled-${sequence}`,
    generatedAt: at,
    sections: {
      quote: {
        capability: 'quote',
        status: 'ready',
        data: {
          version: 3,
          symbol: input.symbol,
          open: sequence,
          high: sequence + 1,
          low: sequence - 1,
          price: sequence,
          previousClose: 10,
          volume: 100,
          amount: 1000,
          provider: 'controlled',
          fetchedAt: at,
          marketTime: at,
          freshness: 'live',
          stale: false,
          sessionContext: {
            session: sessionState === 'open' ? 'trading' : 'unknown',
            evaluatedAt: at,
            marketSession: session(),
          },
        },
      },
    },
    barSeries: {
      contractVersion: 3,
      identity: {
        symbol: input.symbol,
        assetType: 'STOCK',
        timeframe: input.timeframe ?? '1m',
        adjustment: input.adjustment ?? 'none',
      },
      points: [
        {
          timestamp: at,
          open: sequence,
          high: sequence + 1,
          low: sequence - 1,
          close: sequence,
          volume: 100,
          amount: 1000,
          completionStatus: 'incomplete',
          availableAt: at,
        },
      ],
      coverage: {
        actualStart: at,
        actualEnd: at,
        hasMoreBefore: true,
        latestCompleteTradingDate: null,
      },
      provenance: {
        providerId: 'controlled',
        upstreamSource: 'controlled',
        routeIndex: 0,
        effectivePolicyRevision: 1,
        providerRevision: 'controlled',
        fetchedAt: at,
        freshUntil: at,
        servedFromCache: false,
        cacheStatus: 'miss',
      },
      inputFingerprint: `controlled-${sequence}`,
    },
  } as MarketDisplayDetailResponse;
};
const barRequests = () =>
  request.mock.calls
    .map(([input]) => input as MarketDetailRequest)
    .filter((input) => input.include?.join(',') !== 'quote');
type Selection = { symbol: string; timeframe: MarketTimeframe; calculationAnchor?: string };
let update: (next: Selection) => void;
let retryLatest: () => void;
let setAutomatic: (value: boolean) => void;
let root: Root;
let client: QueryClient;
let container: HTMLDivElement;
function Harness() {
  const [selection, select] = useState<Selection>({ symbol: '600036.SH', timeframe: '1m' });
  update = select;
  const [detail, setDetail] = useState<MarketDisplayDetailResponse | null>(null);
  const points = useRef(buildChartPoints(detail?.barSeries?.points ?? [], []));
  points.current = buildChartPoints(detail?.barSeries?.points ?? [], []);
  const generation = useRef({ signature: '', value: 0 });
  const signature = JSON.stringify(selection);
  if (generation.current.signature !== signature)
    generation.current = { signature, value: generation.current.value + 1 };
  const options = {
    queryClient: client,
    symbol: selection.symbol,
    refreshSequence: 0,
    indicatorParams: params,
    paramsKey: JSON.stringify(params),
    adjustment: 'none' as const,
    chartWindowV3: {
      barsLimit: 90,
      timeframe: selection.timeframe,
      ...(selection.calculationAnchor ? { calculationAnchor: selection.calculationAnchor } : {}),
    },
  };
  const latest = useMarketChartLatestRefresh({
    ...options,
    navFund: false,
    detail,
    chartPointsRef: points,
    requestGeneration: generation.current.value,
    onLatestDetail: setDetail,
    onSectionRetry: setDetail,
  });
  retryLatest = () => { void latest.retryLater(); };
  const query = useMarketDetailQuery({ ...options, enabled: true, latestRefresh: latest });
  setAutomatic = query.setAutoRefresh;
  useEffect(() => {
    if (query.data) setDetail(query.data);
  }, [query.data]);
  const page = latest.laterPages.at(-1)?.response ?? detail;
  const quote = detail?.sections.quote;
  const price = quote?.capability === 'quote' ? quote.data?.price : undefined;
  return (
    <output
      data-loading={query.isFetching || latest.latestLoading}
      data-error={query.isError || Boolean(latest.latestError)}
      data-price={price}
      data-change={price === undefined ? undefined : (price - 10) / 10}
      data-automatic={query.autoRefresh}
    >
      {page?.barSeries?.points.at(-1)?.close}
    </output>
  );
}
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
};
const commit = async (callback: () => void) => {
  await act(async () => {
    callback();
    await Promise.resolve();
  });
};
const tick = async (ms = 60_000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await settle();
};
const mount = async (automatic = true) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await commit(() => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  await settle();
  if (automatic) {
    await commit(() => setAutomatic(true));
    await settle();
  }
};

describe('分钟行情自动刷新', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    focusManager.setFocused(true);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    sequence = 10;
    sessionState = 'open';
    failBars = false;
    failSession = false;
    request.mockReset().mockImplementation((input: MarketDetailRequest) => {
      const quoteOnly = input.include?.join(',') === 'quote';
      if (quoteOnly && failSession) throw new Error('会话读取失败');
      if (!quoteOnly) {
        if (failBars) throw new Error('分钟行情读取失败');
        sequence += 1;
      }
      return Promise.resolve(response(input));
    });
  });
  afterEach(async () => {
    if (root) await commit(() => root.unmount());
    client.clear();
    container?.remove();
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('默认关闭且不检查会话；开启后同轮更新报价和涨跌幅，关闭后停更', async () => {
    await mount(false);
    const initial = request.mock.calls.length;
    const output = () => container.querySelector('output')!.dataset;
    expect(output().automatic).toBe('false');
    await tick(180_000);
    expect(request).toHaveBeenCalledTimes(initial);
    const oldPrice = output().price;
    const oldChange = output().change;
    await commit(() => setAutomatic(true));
    await settle();
    await tick();
    expect(Number(output().price)).toBeGreaterThan(Number(oldPrice));
    expect(Number(output().change)).toBeGreaterThan(Number(oldChange));
    expect(output().price).toBe(container.textContent);
    await commit(() => setAutomatic(false));
    const stopped = request.mock.calls.length;
    await tick(180_000);
    expect(request).toHaveBeenCalledTimes(stopped);
  });

  it('盘中每分钟强制更新所选窗口和指标，并清除旧的手动最新页', async () => {
    await mount();
    const initial = barRequests().length;
    await tick();
    expect(barRequests()).toHaveLength(initial + 1);
    expect(barRequests().at(-1)).toMatchObject({
      symbol: '600036.SH',
      timeframe: '1m',
      adjustment: 'none',
      barsLimit: 90,
      indicatorParams: params,
      refresh: true,
      include: ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'],
    });
    await commit(() => retryLatest());
    await settle();
    const manual = container.textContent;
    await tick();
    expect(Number(container.textContent)).toBeGreaterThan(Number(manual));
  });

  it.each(['closed', 'unknown'] as const)('%s 时仅检查会话，收到开盘事实后恢复', async (state) => {
    sessionState = state;
    await mount();
    const initial = barRequests().length;
    await tick(180_000);
    expect(barRequests()).toHaveLength(initial);
    sessionState = 'open';
    await tick();
    await tick();
    expect(barRequests().length).toBeGreaterThan(initial);
  });

  it('会话检查失败时停更；行情失败保留原值并在下个周期恢复', async () => {
    await mount();
    const saved = container.textContent;
    const savedPrice = container.querySelector('output')!.dataset.price;
    const savedChange = container.querySelector('output')!.dataset.change;
    failBars = true;
    await tick();
    expect(container.textContent).toBe(saved);
    expect(container.querySelector('output')!.dataset.price).toBe(savedPrice);
    expect(container.querySelector('output')!.dataset.change).toBe(savedChange);
    expect(container.querySelector('output')?.dataset.error).toBe('true');
    failBars = false;
    await tick();
    expect(Number(container.textContent)).toBeGreaterThan(Number(saved));
    failSession = true;
    await tick();
    const count = barRequests().length;
    await tick(120_000);
    expect(barRequests()).toHaveLength(count);
  });

  it('历史扩窗使用最新请求，日线、后台和关闭暂停；切回分钟周期恢复', async () => {
    await mount();
    await commit(() =>
      update({
        symbol: '600036.SH',
        timeframe: '1m',
        calculationAnchor: new Date(NOW).toISOString(),
      }),
    );
    await settle();
    let count = barRequests().length;
    await tick(120_000);
    expect(barRequests().length).toBeGreaterThan(count);
    expect(barRequests().at(-1)?.calculationAnchor).toBeUndefined();
    await commit(() => update({ symbol: '600036.SH', timeframe: '1d' }));
    await settle();
    count = barRequests().length;
    await tick(120_000);
    expect(barRequests()).toHaveLength(count);
    await commit(() => update({ symbol: '600036.SH', timeframe: '5m' }));
    await settle();
    await tick();
    expect(barRequests().at(-1)?.timeframe).toBe('5m');
    await commit(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    count = barRequests().length;
    await tick(120_000);
    expect(barRequests()).toHaveLength(count);
    await commit(() => root.unmount());
    await tick(120_000);
    expect(barRequests()).toHaveLength(count);
  });

  it('自动请求未结束时保留曲线及加载状态，切换标的后丢弃旧响应', async () => {
    await mount();
    const saved = container.textContent;
    const savedPrice = container.querySelector('output')!.dataset.price;
    const savedChange = container.querySelector('output')!.dataset.change;
    let resolve!: (value: MarketDisplayDetailResponse) => void;
    const delayed = new Promise<MarketDisplayDetailResponse>((done) => {
      resolve = done;
    });
    request.mockImplementationOnce((input: MarketDetailRequest) =>
      Promise.resolve(response(input)),
    );
    request.mockImplementationOnce(() => delayed);
    await tick();
    expect(container.textContent).toBe(saved);
    expect(container.querySelector('output')!.dataset.price).toBe(savedPrice);
    expect(container.querySelector('output')!.dataset.change).toBe(savedChange);
    expect(container.querySelector('output')?.dataset.loading).toBe('true');
    await commit(() => update({ symbol: 'AAPL.US', timeframe: '1m' }));
    await settle();
    const current = container.textContent;
    await commit(() => resolve(response({ symbol: '600036.SH', timeframe: '1m' })));
    await settle();
    expect(container.textContent).toBe(current);
  });
});

describe('服务端交易会话有效期', () => {
  it('到达实际会话边界或状态过期后不沿用 open；未知及缺失均保守停更', () => {
    sessionState = 'open';
    const value = {
      ...session(),
      evaluatedAt: new Date(NOW).toISOString(),
      nextBoundaryAt: new Date(NOW + 30_000).toISOString(),
    };
    expect(minuteSessionIsOpen(value, NOW, NOW + 29_999)).toBe(true);
    expect(minuteSessionIsOpen(value, NOW, NOW + 30_000)).toBe(false);
    expect(
      minuteSessionIsOpen(
        { ...value, nextBoundaryAt: new Date(NOW + 3600_000).toISOString() },
        NOW,
        NOW + 90_000,
      ),
    ).toBe(false);
    expect(minuteSessionIsOpen({ ...value, state: 'unknown' }, NOW, NOW)).toBe(false);
    expect(minuteSessionIsOpen({ ...value, tradingDayState: 'closed' }, NOW, NOW)).toBe(false);
    expect(minuteSessionIsOpen(null, NOW, NOW)).toBe(false);
  });
});
