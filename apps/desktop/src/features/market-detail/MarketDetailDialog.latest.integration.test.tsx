import { act, useEffect, useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';
import type { MarketDetailFetcher } from './market-detail.coordinator.js';
import type * as MarketDetailTypes from './market-detail.types.js';
vi.mock('./MarketChartAdjustment.js', () => ({ MarketChartAdjustment: () => null }));

type Listener = (event: { type: string; target?: FakeNode; cancelBubble?: boolean }) => void;

class FakeNode {
  nodeType = 1;
  nodeName = 'DIV';
  ownerDocument: FakeDocument;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  listeners = new Map<string, Listener[]>();
  attributes = new Map<string, string>();
  style = { cssText: '' };
  private ownTextContent = '';
  nodeValue: string | null = null;

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get textContent() {
    return this.childNodes.length > 0
      ? this.childNodes.map((child) => child.textContent).join('')
      : this.ownTextContent;
  }

  set textContent(value: string) {
    this.ownTextContent = value;
    this.nodeValue = value;
    this.childNodes = [];
  }

  appendChild(child: FakeNode) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child: FakeNode, before: FakeNode | null) {
    child.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child: FakeNode) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }

  dispatchEvent(event: { type: string; target?: FakeNode; cancelBubble?: boolean }) {
    event.target ??= this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (!event.cancelBubble && this.parentNode) this.parentNode.dispatchEvent(event);
    return true;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  contains(node: FakeNode): boolean {
    return node === this || this.childNodes.some((child) => child.contains(node));
  }

  querySelector(selector: string): FakeNode | null {
    const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (!match) return null;
    const [, name, expected] = match;
    for (const child of this.childNodes) {
      const value = child.getAttribute(name!);
      if (value !== null && (expected === undefined || value === expected)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

class FakeElement extends FakeNode {
  nodeName: string;
  tagName: string;
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  className = '';
  value = '';
  disabled = false;

  constructor(ownerDocument: FakeDocument, tagName: string) {
    super(ownerDocument);
    this.nodeName = tagName.toUpperCase();
    this.tagName = tagName.toUpperCase();
  }
}

class FakeDocument extends FakeNode {
  nodeType = 9;
  nodeName = '#document';
  defaultView: FakeWindow;
  documentElement: FakeElement;
  body: FakeElement;

  constructor() {
    super(undefined as unknown as FakeDocument);
    this.ownerDocument = this;
    this.defaultView = new FakeWindow(this);
    this.documentElement = new FakeElement(this, 'html');
    this.body = new FakeElement(this, 'body');
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string) {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace: string, tagName: string) {
    return this.createElement(tagName);
  }

  createTextNode(value: string) {
    const node = new FakeNode(this);
    node.nodeType = 3;
    node.nodeName = '#text';
    node.textContent = value;
    return node;
  }

  createComment(value: string) {
    const node = new FakeNode(this);
    node.nodeType = 8;
    node.nodeName = '#comment';
    node.textContent = value;
    return node;
  }

  get activeElement() {
    return this.body;
  }
}

class FakeWindow {
  document: FakeDocument;
  HTMLElement = FakeElement;
  HTMLIFrameElement = FakeElement;
  Node = FakeNode;
  Element = FakeElement;
  Text = FakeNode;
  Comment = FakeNode;
  navigator = { userAgent: 'vitest' };
  listeners = new Map<string, Listener[]>();

  constructor(document: FakeDocument) {
    this.document = document;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }
}

const installDom = () => {
  const document = new FakeDocument();
  const window = document.defaultView;
  Object.assign(globalThis, {
    document,
    window,
    HTMLElement: FakeElement,
    HTMLIFrameElement: FakeElement,
    Node: FakeNode,
    Element: FakeElement,
    Text: FakeNode,
    Comment: FakeNode,
    IS_REACT_ACT_ENVIRONMENT: true,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: window.navigator,
  });
  return document;
};

const { requestMarketDetailMock, useQueryMock, mergeMarketDetailMock, queryClient } = vi.hoisted(() => ({
  requestMarketDetailMock: vi.fn<MarketDetailFetcher>(),
  useQueryMock: vi.fn(),
  mergeMarketDetailMock: vi.fn(),
  queryClient: { cancelQueries: vi.fn(), fetchQuery: vi.fn() },
}));

vi.mock('./market-detail.api.js', () => ({ requestMarketDetail: requestMarketDetailMock }));
vi.mock('./market-detail.types.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MarketDetailTypes>();
  return {
    ...actual,
    mergeMarketDetail: (...args: Parameters<typeof actual.mergeMarketDetail>) => {
      mergeMarketDetailMock(...args);
      return actual.mergeMarketDetail(...args);
    },
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown): unknown => useQueryMock(options),
  useQueryClient: () => queryClient,
}));
vi.mock('@/components/market-color-menu', () => ({ MarketColorMenu: () => null }));
vi.mock('@/components/ui/dialog', () => {
  const Content = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Content,
    DialogContent: Content,
    DialogDescription: Content,
    DialogHeader: Content,
    DialogTitle: Content,
  };
});
vi.mock('./MarketDetailSections.js', () => {
  const Empty = () => null;
  const BarsSection = ({
    section,
    onLoadLater,
    onLoadEarlier,
    onRetryLater,
    onRetry,
    latestNotice,
    latestError,
  }: {
    onLoadLater?: () => void;
    onLoadEarlier?: () => void;
    onRetryLater?: () => void;
    onRetry?: () => void;
    section?: { data?: { points?: Array<{ close?: number }> } | null };
    latestNotice?: string | null;
    latestError?: string | null;
  }) => (
    <div data-market-detail-section="bars">
      <button data-market-probe onClick={onLoadLater}>探测</button>
      <button data-market-earlier onClick={onLoadEarlier}>更早</button>
      <button data-market-retry onClick={onRetryLater}>重试</button>
      <button data-market-section-retry onClick={onRetry}>分段重试</button>
      <span data-market-latest-state>{latestNotice ?? latestError ?? ''}</span>
      <span data-market-latest-close>{section?.data?.points?.at(-1)?.close ?? ''}</span>
    </div>
  );
  return {
    BarsSection,
    ChipSection: Empty,
    DetailMetric: Empty,
    FundNavHistorySection: Empty,
    FundNavSection: Empty,
    IndicatorSection: Empty,
    MarketDetailLoadingSections: Empty,
    MarketDetailNotice: Empty,
    QuoteSection: Empty,
    sectionIsVisible: (section: { status?: string } | undefined) => section?.status !== 'unsupported',
  };
});

const { createRoot } = await import('react-dom/client');
const { MarketDetailDialog } = await import('./MarketDetailDialog.js');

const position = {
  symbol: '600519.SH',
  quantity: 1,
  costPrice: 100,
  pnl: 1,
  asset: { name: '测试股票', assetType: 'stock' as const },
};

const response = (symbol: string, dates: string[], close = 10): MarketDetailResponse => {
  const series = {
    contractVersion: 3 as const,
    identity: { symbol, assetType: 'STOCK' as const, timeframe: '1d' as const, adjustment: 'qfq' as const },
    points: dates.map((date) => ({
      timestamp: `${date}T00:00:00.000Z`,
      open: close - 1,
      high: close + 1,
      low: close - 2,
      close,
      volume: 100,
      amount: 1_000,
      completionStatus: 'complete' as const,
      availableAt: `${date}T08:00:00.000Z`,
    })),
    coverage: {
      actualStart: `${dates[0]}T00:00:00.000Z`,
      actualEnd: `${dates.at(-1)}T00:00:00.000Z`,
      hasMoreBefore: true,
      latestCompleteTradingDate: dates.at(-1) ?? null,
    },
    provenance: {
      providerId: 'fixture',
      upstreamSource: 'fixture',
      routeIndex: 0,
      effectivePolicyRevision: 1,
      providerRevision: 'fixture',
      fetchedAt: '2026-09-17T08:00:00.000Z',
      freshUntil: '2099-01-01T00:00:00.000Z',
      servedFromCache: false,
      cacheStatus: 'miss' as const,
    },
    inputFingerprint: `input-${dates.at(-1)}`,
  };
  return {
    contractVersion: 3,
    symbol,
    assetType: 'STOCK',
    identity: { source: 'asset', status: 'confirmed' },
    requested: ['bars'],
    capabilities: { supported: ['bars'], unsupported: [] },
    limits: { bars: 90, nav: 90 },
    sections: { bars: { capability: 'bars', status: 'ready', data: series } },
    dependencies: { DAILY_BAR: { status: 'ready' } },
    barSeries: series,
    requestId: `request-${symbol}-${dates.at(-1)}-${close}`,
    generatedAt: '2026-09-17T08:00:00.000Z',
  };
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
};

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const mount = async (
  cached: MarketDetailResponse,
  adjustment?: 'none' | 'qfq' | 'hfq',
  activePosition: MarketDetailTypes.MarketDetailPosition = position,
) => {
  const document = installDom();
  const opening = deferred<MarketDetailResponse>();
  requestMarketDetailMock.mockImplementationOnce(() => opening.promise);
  useQueryMock.mockImplementation((options: { queryKey: readonly unknown[]; queryFn: (context: { signal: AbortSignal }) => Promise<MarketDetailResponse> }) => {
    const [state, setState] = useState({ data: cached, isPending: false, isError: false, isFetching: true });
    useEffect(() => {
      const controller = new AbortController();
      void options.queryFn({ signal: controller.signal }).then(
        (data) => setState({ data, isPending: false, isError: false, isFetching: false }),
        () => setState({ data: cached, isPending: false, isError: true, isFetching: false }),
      );
      return () => controller.abort();
    }, [JSON.stringify(options.queryKey)]);
    return state;
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(<MarketDetailDialog position={activePosition} onClose={() => undefined} {...(adjustment ? { adjustment } : {})} />);
    await Promise.resolve();
  });
  return { container, root, opening };
};

describe('MarketDetailDialog 最新端挂载交互', () => {
  beforeEach(() => {
    requestMarketDetailMock.mockReset();
    useQueryMock.mockReset();
    queryClient.fetchQuery.mockReset();
    queryClient.cancelQueries.mockReset();
    mergeMarketDetailMock.mockReset();
  });

  it('基金首次打开只请求净值能力，不触发日线口径计划', async () => {
    const symbol = '000001.OF';
    const current: MarketDetailResponse = {
      ...response(symbol, ['2026-09-15']),
      assetType: 'MUTUAL_FUND',
      requested: ['fund-nav', 'fund-nav-history'],
      capabilities: { supported: ['fund-nav', 'fund-nav-history'], unsupported: [] },
      sections: {
        'fund-nav': { capability: 'fund-nav', status: 'empty', data: null },
        'fund-nav-history': { capability: 'fund-nav-history', status: 'empty', data: [] },
      },
      dependencies: {},
    };
    delete current.barSeries;
    const mounted = await mount(current, undefined, {
      ...position,
      symbol,
      asset: { name: '测试基金', assetType: 'fund' },
    });
    expect(requestMarketDetailMock.mock.calls.at(-1)?.[0]).toMatchObject({
      symbol,
      include: ['fund-nav', 'fund-nav-history'],
      navLimit: 90,
    });
    mounted.opening.resolve(current);
    await act(flushAsync);
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
  });

  it('V3 历史扩窗、最新检查和指标重试都读取当前整窗', async () => {
    const current = response(position.symbol, ['2026-09-15', '2026-09-16']);
    const mounted = await mount(current, 'qfq');
    expect(requestMarketDetailMock.mock.calls.at(-1)?.[0]).toMatchObject({ chartContractVersion: 3, barsLimit: 90 });
    mounted.opening.resolve(current);
    await act(flushAsync);
    requestMarketDetailMock.mockResolvedValue(current);
    await act(async () => {
      mounted.container.querySelector('[data-market-earlier]')!.dispatchEvent({ type: 'click' });
      await flushAsync();
    });
    await act(flushAsync);
    expect(requestMarketDetailMock.mock.calls.at(-1)?.[0]).toMatchObject({ chartContractVersion: 3, barsLimit: 180 });
    queryClient.fetchQuery.mockImplementation(({ queryFn }: { queryFn: (context: { signal: AbortSignal }) => Promise<MarketDetailResponse> }) => queryFn({ signal: new AbortController().signal }));
    for (const selector of ['[data-market-retry]', '[data-market-section-retry]']) {
      await act(async () => { mounted.container.querySelector(selector)!.dispatchEvent({ type: 'click' }); await flushAsync(); });
      await act(flushAsync);
      const request = requestMarketDetailMock.mock.calls.at(-1)![0];
      expect(request).toMatchObject({ chartContractVersion: 3, barsLimit: 180, refresh: true,
        include: ['bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI'] });
      expect(request.start).toBeUndefined();
      expect(request.end).toBeUndefined();
    }
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
  });

  it.each(['none', 'qfq', 'hfq'] as const)('%s 口径贯穿打开、最新检查与分段重试', async (adjustment) => {
    const current = response(position.symbol, ['2026-09-15']);
    const mounted = await mount(current, adjustment);
    expect(requestMarketDetailMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ adjustment }), expect.any(AbortSignal),
    );
    const openingOptions = useQueryMock.mock.calls.at(-1)?.[0] as { queryKey: readonly unknown[] };
    expect(openingOptions.queryKey.at(-3)).toBe(adjustment);
    mounted.opening.resolve(current);
    await act(flushAsync);
    requestMarketDetailMock.mockResolvedValue(current);
    queryClient.fetchQuery.mockImplementation(({ queryFn }: { queryFn: (context: { signal: AbortSignal }) => Promise<MarketDetailResponse> }) => queryFn({ signal: new AbortController().signal }));
    for (const selector of ['[data-market-retry]', '[data-market-section-retry]']) {
      const retry = mounted.container.querySelector(selector)!;
      await act(async () => { retry.dispatchEvent({ type: 'click' }); await flushAsync(); });
      await act(flushAsync);
      expect(requestMarketDetailMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ adjustment }), expect.any(AbortSignal),
      );
      const retryOptions = queryClient.fetchQuery.mock.calls.at(-1)?.[0] as { queryKey: readonly unknown[] };
      expect(retryOptions.queryKey.at(-3)).toBe(adjustment);
    }
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
  });

  it('打开刷新进行中时拖动不重复请求，完成后立即拖动受冷却保护', async () => {
    const cached = response(position.symbol, ['2026-09-15']);
    const mounted = await mount(cached);
    expect(requestMarketDetailMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: position.symbol, refresh: true }),
      expect.any(AbortSignal),
    );
    const probe = mounted.container.querySelector('[data-market-probe]')!;
    await act(async () => { probe.dispatchEvent({ type: 'click' }); await flushAsync(); });
    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
    mounted.opening.resolve(response(position.symbol, ['2026-09-16']));
    await act(flushAsync);
    await act(async () => { probe.dispatchEvent({ type: 'click' }); await flushAsync(); });
    expect(queryClient.fetchQuery).not.toHaveBeenCalled();
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
  });

  it('失败后显式重试绕过冷却，当前整窗请求带 refresh', async () => {
    const mounted = await mount(response(position.symbol, ['2026-09-15']));
    mounted.opening.resolve(response(position.symbol, ['2026-09-15']));
    await act(flushAsync);
    const failed = deferred<MarketDetailResponse>();
    const retried = deferred<MarketDetailResponse>();
    requestMarketDetailMock.mockImplementationOnce(() => failed.promise).mockImplementationOnce(() => retried.promise);
    queryClient.fetchQuery.mockImplementation(({ queryFn }: { queryFn: (context: { signal: AbortSignal }) => Promise<MarketDetailResponse> }) => queryFn({ signal: new AbortController().signal }));
    const probe = mounted.container.querySelector('[data-market-probe]')!;
    await act(async () => { probe.dispatchEvent({ type: 'click' }); await flushAsync(); });
    void failed.promise.catch(() => undefined);
    failed.reject(new Error('fixture failure'));
    await act(flushAsync);
    const retry = mounted.container.querySelector('[data-market-retry]')!;
    await act(async () => { retry.dispatchEvent({ type: 'click' }); await flushAsync(); });
    expect(requestMarketDetailMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ symbol: position.symbol, chartContractVersion: 3, barsLimit: 90, refresh: true }),
      expect.any(AbortSignal),
    );
    expect(requestMarketDetailMock.mock.calls.at(-1)?.[0].start).toBeUndefined();
    retried.resolve(response(position.symbol, ['2026-09-15']));
    await act(async () => Promise.resolve());
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
  });

  it('顺序推进基线后较新的 latest 响应可覆盖同日修订，卸载后迟到响应不提交', async () => {
    const mounted = await mount(response(position.symbol, ['2026-09-15']));
    mounted.opening.resolve(response(position.symbol, ['2026-09-15']));
    await act(flushAsync);
    const first = deferred<MarketDetailResponse>();
    const second = deferred<MarketDetailResponse>();
    requestMarketDetailMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    queryClient.fetchQuery.mockImplementation(({ queryFn }: { queryFn: (context: { signal: AbortSignal }) => Promise<MarketDetailResponse> }) => queryFn({ signal: new AbortController().signal }));
    const retry = mounted.container.querySelector('[data-market-retry]')!;
    await act(async () => { retry.dispatchEvent({ type: 'click' }); await flushAsync(); });
    first.resolve(response(position.symbol, ['2026-09-15', '2026-09-16'], 11));
    await act(flushAsync);
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(1);
    await act(async () => { retry.dispatchEvent({ type: 'click' }); await flushAsync(); });
    expect(queryClient.fetchQuery).toHaveBeenCalledTimes(2);
    second.resolve(response(position.symbol, ['2026-09-16'], 12));
    await act(flushAsync);
    expect(mounted.container.querySelector('[data-market-latest-state]')?.textContent).toContain('已更新最新日线');
    expect(mounted.container.querySelector('[data-market-latest-close]')?.textContent).toBe('12');
    const committedClose = mounted.container.querySelector('[data-market-latest-close]')!;
    const late = deferred<MarketDetailResponse>();
    mergeMarketDetailMock.mockClear();
    requestMarketDetailMock.mockImplementationOnce(() => late.promise);
    await act(async () => { retry.dispatchEvent({ type: 'click' }); await flushAsync(); });
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
    late.resolve(response(position.symbol, ['2026-09-16'], 99));
    await act(flushAsync);
    expect(mergeMarketDetailMock).not.toHaveBeenCalled();
    expect(committedClose.textContent).toBe('12');
  });

  it('分段重试卸载后迟到响应不进入 merge commit', async () => {
    const mounted = await mount(response(position.symbol, ['2026-09-15']));
    mounted.opening.resolve(response(position.symbol, ['2026-09-15']));
    await act(flushAsync);
    const retryResponse = deferred<MarketDetailResponse>();
    requestMarketDetailMock.mockImplementationOnce(() => retryResponse.promise);
    queryClient.fetchQuery.mockImplementation(({ queryFn }: { queryFn: (context: { signal: AbortSignal }) => Promise<MarketDetailResponse> }) =>
      queryFn({ signal: new AbortController().signal }),
    );
    mergeMarketDetailMock.mockClear();
    const retry = mounted.container.querySelector('[data-market-section-retry]')!;
    await act(async () => { retry.dispatchEvent({ type: 'click' }); await flushAsync(); });
    await act(async () => { mounted.root.unmount(); await flushAsync(); });
    retryResponse.resolve(response(position.symbol, ['2026-09-15'], 99));
    await act(flushAsync);
    expect(mergeMarketDetailMock).not.toHaveBeenCalled();
  });
});
