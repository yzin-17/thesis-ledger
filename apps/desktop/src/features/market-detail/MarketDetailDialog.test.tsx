import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';
import type { BarSeries } from '@thesis-ledger/schemas';
vi.mock('./MarketChartAdjustment.js', () => ({ MarketChartAdjustment: () => null }));

const { useQueryMock, useQueryClientMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useQueryClientMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }): unknown => {
    if (options.queryKey[1] === 'fund-valuation') return { isPending: true };
    if (options.queryKey[1] !== 'market-detail')
      return { data: undefined, isPending: false, isError: false, isFetching: false };
    return useQueryMock(options);
  },
  useQueryClient: useQueryClientMock,
}));

vi.mock('@/components/ui/dialog', () => {
  const Content = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Close = ({ children }: { children: ReactNode }) => <button>{children}</button>;
  const Title = ({ children }: { children: ReactNode }) => <h2>{children}</h2>;
  const Description = ({ children }: { children: ReactNode }) => <p>{children}</p>;
  return {
    Dialog: Content,
    DialogClose: Close,
    DialogContent: Content,
    DialogDescription: Description,
    DialogHeader: Content,
    DialogTitle: Title,
  };
});

vi.mock('@/components/market-color-menu', () => ({
  MarketColorMenu: () => null,
}));

import {
  commitIfCurrentGeneration,
  MarketDetailDialog,
  responseMatchesIndicatorParams,
} from './MarketDetailDialog.js';

const time = '2026-08-21T00:00:00.000Z';
const position = {
  symbol: '600519.SH',
  quantity: 10,
  costPrice: 100,
  pnl: 20,
  asset: { name: '示例股票', assetType: 'stock' as const },
};

const detail = (input: Partial<MarketDetailResponse>): MarketDetailResponse => ({
  contractVersion: 1,
  symbol: '600519.SH',
  assetType: 'STOCK',
  identity: { source: 'asset', status: 'confirmed' },
  requested: [],
  capabilities: { supported: [], unsupported: [] },
  limits: { bars: 30, nav: 30 },
  sections: {},
  dependencies: {},
  requestId: 'request-1',
  generatedAt: time,
  ...input,
});

const readyQuote = {
  version: 1 as const,
  symbol: '600519.SH',
  open: 100,
  high: 110,
  low: 90,
  price: 105,
  previousClose: 100,
  volume: 100,
  amount: 10_500,
  stale: false,
  provider: 'fixture',
  marketTime: time,
  fetchedAt: time,
  freshness: 'live' as const,
};

const readyIndicator = (name: 'MA' | 'MACD' | 'RSI') => ({
  name,
  parameters: {},
  inputFingerprint: 'fixture',
  points: [],
});

const readySeries: BarSeries = {
  contractVersion: 1,
  identity: { symbol: '600519.SH', assetType: 'STOCK', timeframe: '1d', adjustment: 'qfq' },
  points: [
    {
      timestamp: '2026-08-20T00:00:00.000Z',
      open: 99,
      high: 102,
      low: 98,
      close: 100,
      volume: 100,
      amount: 10_000,
      completionStatus: 'complete',
      availableAt: time,
    },
    {
      timestamp: time,
      open: 100,
      high: 106,
      low: 99,
      close: 105,
      volume: 120,
      amount: 12_600,
      completionStatus: 'complete',
      availableAt: time,
    },
  ],
  coverage: {
    actualStart: '2026-08-20T00:00:00.000Z',
    actualEnd: time,
    hasMoreBefore: true,
    latestCompleteTradingDate: '2026-08-21',
  },
  provenance: {
    providerId: 'fixture',
    upstreamSource: 'fixture',
    routeIndex: 0,
    effectivePolicyRevision: 1,
    providerRevision: 'fixture',
    fetchedAt: time,
    freshUntil: '2099-01-01T00:00:00.000Z',
    servedFromCache: false,
    cacheStatus: 'miss',
  },
  inputFingerprint: 'fixture',
};

const queryClient = {
  cancelQueries: vi.fn(),
  fetchQuery: vi.fn(),
};

const staleQuoteWithinUpstreamWindow = (fetchedAt: string) => ({
  ...readyQuote,
  stale: true,
  servedFromCache: true,
  freshness: 'stale' as const,
  refreshFailure: 'budget_cooldown' as const,
  fetchedAt,
});

const detailWithStaleQuote = (fetchedAt: string): MarketDetailResponse =>
  detail({
    requested: ['quote'],
    capabilities: { supported: ['quote'], unsupported: [] },
    sections: {
      quote: {
        capability: 'quote',
        status: 'stale',
        data: staleQuoteWithinUpstreamWindow(fetchedAt),
      },
    },
  });

describe('MarketDetailDialog UI contract', () => {
  registerMarketDetailContractSetup();
  registerMarketDetailIdentityContracts();
  registerMarketDetailSectionContracts();
  registerMarketDetailFreshnessContracts();
  registerMarketDetailReadinessContracts();
});

function registerMarketDetailContractSetup() {
  beforeEach(() => {
    useQueryClientMock.mockReturnValue(queryClient);
    useQueryMock.mockReset();
  });
}
function registerMarketDetailIdentityContracts() {
  it('参数变化时拒绝旧响应，避免旧指标页短暂回填', () => {
    const response = detail({
      sections: {
        'indicator:MACD': {
          capability: 'indicator:MACD',
          status: 'ready',
          data: { ...readyIndicator('MACD'), parameters: { fast: 12, slow: 26, signal: 9 } },
        },
      },
    });
    expect(
      responseMatchesIndicatorParams(response, {
        fast: 20,
        slow: 50,
        signal: 9,
        short: 6,
        mid: 12,
        long: 24,
      }),
    ).toBe(false);
  });
  it('参数变化后拒绝延迟完成的旧重试提交', async () => {
    let generation = 1;
    let resolveRequest!: (value: MarketDetailResponse) => void;
    const request = new Promise<MarketDetailResponse>((resolve) => {
      resolveRequest = resolve;
    });
    const commit = vi.fn();
    const pending = commitIfCurrentGeneration(
      1,
      () => generation,
      () => request,
      commit,
    );

    generation = 2;
    resolveRequest(detail({ requestId: 'old-retry' }));

    await expect(pending).resolves.toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
}
function registerMarketDetailSectionContracts() {
  it('渲染股票的持仓上下文、行情、指标和局部失败重试', () => {
    useQueryMock.mockReturnValue({
      data: detail({
        requested: ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI', 'chip'],
        capabilities: {
          supported: ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI', 'chip'],
          unsupported: ['fund-nav', 'fund-nav-history'],
        },
        sections: {
          quote: { capability: 'quote', status: 'ready', data: readyQuote },
          bars: {
            capability: 'bars',
            status: 'ready',
            data: readySeries,
          },
          'indicator:MA': {
            capability: 'indicator:MA',
            status: 'ready',
            data: readyIndicator('MA'),
          },
          'indicator:MACD': {
            capability: 'indicator:MACD',
            status: 'ready',
            data: readyIndicator('MACD'),
          },
          'indicator:RSI': {
            capability: 'indicator:RSI',
            status: 'ready',
            data: readyIndicator('RSI'),
          },
          chip: {
            capability: 'chip',
            status: 'unavailable',
            error: { code: 'market_data_unavailable', message: '暂不可用', diagnosticId: 'd-1' },
          },
        },
        barSeries: readySeries,
      }),
      isPending: false,
      isError: false,
      isFetching: false,
    });

    const html = renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);

    expect(html).toContain('持仓数量');
    expect(html).toContain('实时价');
    expect(html).toContain('涨跌幅');
    expect(html).toContain('+5.00%');
    expect(html).toContain('sm:grid-cols-4');
    expect(html).toContain('技术指标');
    expect(html).toContain('data-market-price-chart="true"');
    expect(html).toContain('data-market-chart-navigation="true"');
    expect(html.indexOf('全屏')).toBeLessThan(html.indexOf('data-market-chart-navigation="true"'));
    expect(html.indexOf('data-market-chart-navigation="true"')).toBeLessThan(
      html.indexOf('data-market-lightweight-chart="true"'),
    );
    expect(html).not.toContain('共享日线依赖');
    expect(html).not.toContain('已并入上方日线图');
    expect(html).toContain('缺少历史序列或日线口径证据');
    expect(html).not.toContain('加载更早日线');
    expect(html).not.toContain('data-market-indicator-chart');
    expect(html).toContain('data-market-detail-section="chip"');
    expect(html).toContain('重试');
    expect(html).toContain('数据可用性');
  });
  it('目录行情不需要持仓，省略数量、成本和盈亏', () => {
    useQueryMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(
      <MarketDetailDialog
        position={{ symbol: '159516.SZ', asset: { name: '半导体 ETF', assetType: 'etf' } }}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain('159516.SZ');
    expect(html).toContain('行情详情');
    expect(html).not.toContain('持仓数量');
    expect(html).not.toContain('持仓成本');
    expect(html).not.toContain('持仓盈亏');
  });
  it('ETF 隐藏 unsupported chip，而基金只渲染 NAV 分段', () => {
    useQueryMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const etfHtml = renderToStaticMarkup(
      <MarketDetailDialog
        position={{
          ...position,
          symbol: '510300.SH',
          asset: { name: '示例 ETF', assetType: 'etf' },
        }}
        onClose={vi.fn()}
      />,
    );
    expect(etfHtml).not.toContain('data-market-detail-section="chip"');

    useQueryMock.mockReturnValue({
      data: detail({
        symbol: '000001.OF',
        assetType: 'MUTUAL_FUND',
        requested: ['fund-nav', 'fund-nav-history'],
        capabilities: {
          supported: ['fund-nav', 'fund-nav-history'],
          unsupported: ['quote', 'bars', 'indicator:MA', 'indicator:MACD', 'indicator:RSI', 'chip'],
        },
        sections: {
          'fund-nav': {
            capability: 'fund-nav',
            status: 'ready',
            data: {
              version: 1,
              symbol: '000001.OF',
              unitNav: 1.2,
              navDate: time,
              provider: 'fixture',
              fetchedAt: time,
              freshness: 'delayed',
            },
          },
          'fund-nav-history': { capability: 'fund-nav-history', status: 'empty', data: [] },
        },
      }),
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const fundHtml = renderToStaticMarkup(
      <MarketDetailDialog
        position={{
          ...position,
          symbol: '000001.OF',
          asset: { name: '示例基金', assetType: 'fund' },
        }}
        onClose={vi.fn()}
      />,
    );
    expect(fundHtml).toContain('单位净值');
    expect(fundHtml).toContain('基金净值历史');
    expect(fundHtml).not.toContain('data-market-detail-section="quote"');
  });
}
function registerMarketDetailFreshnessContracts() {
  it('有明确原因的行情冷却直接说明请求窗口', () => {
    const now = Date.now();
    useQueryMock.mockReturnValue({
      data: detailWithStaleQuote(new Date(now - 60_000).toISOString()),
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(html).toContain('行情刷新冷却中');
    expect(html).toContain('本次未再次请求来源');
    expect(html).not.toContain('行情数据时效提示');
    expect(html).not.toContain('陈旧回退');
    // 徽标与横幅保持一致：间隔内不显示告警色「陈旧」，契约状态仍为 stale。
    expect(html).toContain('刷新冷却中');
    expect(html).not.toMatch(/>陈旧</);
    expect(html).toContain('data-section-status="stale"');
    // 提示位于「实时行情」分段的分界线之下、标题之上。
    expect(html.indexOf('data-market-detail-section="quote"')).toBeLessThan(
      html.indexOf('行情刷新冷却中'),
    );
    expect(html.indexOf('行情刷新冷却中')).toBeLessThan(html.indexOf('实时行情</h3>'));
  });
  it('正常休市快照使用信息提示，两个来源时点分行且不显示陈旧告警', () => {
    useQueryMock.mockReturnValue({
      data: detail({
        requested: ['quote'],
        sections: {
          quote: {
            capability: 'quote',
            status: 'ready',
            data: {
              ...readyQuote,
              stale: false,
              freshness: 'delayed',
              sessionContext: {
                session: 'closed_snapshot',
                evaluatedAt: '2026-11-09T02:00:00Z',
                latestTradingDate: '2026-11-06',
                calendarRevision: 'verified',
              },
            },
          },
        },
      }),
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(html).toContain('休市快照');
    expect(html).toContain('最近交易日（2026-11-06）');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toMatch(/\n行情时间：[^\n]+\n抓取时间：/);
    expect(html).not.toContain('行情数据时效提示');
    expect(html).not.toMatch(/>陈旧</);
  });
  it('刷新超时不能因刚读取缓存而被当成正常刷新间隔', () => {
    const now = Date.now();
    useQueryMock.mockReturnValue({
      data: detail({
        requested: ['quote'],
        sections: {
          quote: {
            capability: 'quote',
            status: 'stale',
            data: {
              ...staleQuoteWithinUpstreamWindow(new Date(now - 60_000).toISOString()),
              refreshFailure: 'fetch_failed',
              staleReason: {
                code: 'timeout',
                message: '数据源请求超时，当前展示上次成功取得的数据。',
              },
            },
          },
        },
      }),
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(html).toContain('行情数据时效提示');
    expect(html).toContain('数据源请求超时');
    expect(html).toContain('刷新失败，保留旧数据');
    expect(html).toContain('行情时间：');
    expect(html).toContain('抓取时间：');
    expect(html).toMatch(/>陈旧</);
    expect(html).not.toContain('行情刷新冷却中');
  });
}
function registerMarketDetailReadinessContracts() {
  it('保留 loading 和整页读取失败状态', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: true,
    });
    const loadingHtml = renderToStaticMarkup(
      <MarketDetailDialog position={position} onClose={vi.fn()} />,
    );
    expect(loadingHtml).toContain('行情分段加载中');

    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
    });
    const errorHtml = renderToStaticMarkup(
      <MarketDetailDialog position={position} onClose={vi.fn()} />,
    );
    expect(errorHtml).toContain('行情详情读取失败');
    expect(errorHtml).toContain('aria-label="刷新行情"');
  });
  it('重新打开即使命中客户端缓存也始终重新执行最新检查', () => {
    useQueryMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      isFetching: false,
    });
    renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(
      useQueryMock.mock.calls.find(
        ([options]) => (options as { queryKey: unknown[] }).queryKey[1] === 'market-detail',
      )?.[0],
    ).toMatchObject({ refetchOnMount: 'always' });
  });
  it('分钟能力尚未确认时不派发详情，也不改成日线请求', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => '5m' } });
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isFetching: false,
    });
    try {
      renderToStaticMarkup(
        <MarketDetailDialog
          position={{ symbol: 'SPY.US', asset: { name: '受控ETF', assetType: 'etf' } }}
          onClose={vi.fn()}
        />,
      );
      const options = useQueryMock.mock.calls.find(
        ([raw]) => (raw as { queryKey: unknown[] }).queryKey[1] === 'market-detail',
      )?.[0] as { enabled: boolean; queryKey: unknown[] };
      expect(options.enabled).toBe(false);
      expect(options.queryKey).toContain('5m');
    } finally {
      vi.unstubAllGlobals();
    }
  });
}
