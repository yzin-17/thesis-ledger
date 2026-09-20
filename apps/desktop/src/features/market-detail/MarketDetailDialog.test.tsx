import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDetailResponseV2 } from '@thesis-ledger/api-client';
import type { BarSeriesV2 } from '@thesis-ledger/schemas';

const { useQueryMock, useQueryClientMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useQueryClientMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
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

const detail = (input: Partial<MarketDetailResponseV2>): MarketDetailResponseV2 => ({
  contractVersion: 2,
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

const readySeries: BarSeriesV2 = {
  contractVersion: 2,
  identity: { symbol: '600519.SH', assetType: 'STOCK', timeframe: '1d', adjustment: 'qfq' },
  points: [
    { timestamp: '2026-08-20T00:00:00.000Z', open: 99, high: 102, low: 98, close: 100, volume: 100, amount: 10_000, completionStatus: 'complete', availableAt: time },
    { timestamp: time, open: 100, high: 106, low: 99, close: 105, volume: 120, amount: 12_600, completionStatus: 'complete', availableAt: time },
  ],
  coverage: { actualStart: '2026-08-20T00:00:00.000Z', actualEnd: time, hasMoreBefore: true, latestCompleteTradingDate: '2026-08-21' },
  provenance: { providerId: 'fixture', upstreamSource: 'fixture', routeIndex: 0, effectivePolicyRevision: 1, providerRevision: 'fixture', fetchedAt: time, freshUntil: '2099-01-01T00:00:00.000Z', servedFromCache: false, cacheStatus: 'miss' },
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
  fetchedAt,
});

const detailWithStaleQuote = (fetchedAt: string): MarketDetailResponseV2 =>
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
  beforeEach(() => {
    useQueryClientMock.mockReturnValue(queryClient);
    useQueryMock.mockReset();
  });

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
    let resolveRequest!: (value: MarketDetailResponseV2) => void;
    const request = new Promise<MarketDetailResponseV2>((resolve) => {
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

  it('上游刷新间隔内的行情回退只提示、不告警', () => {
    const now = Date.now();
    useQueryMock.mockReturnValue({
      data: detailWithStaleQuote(new Date(now - 60_000).toISOString()),
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(html).toContain('行情按上游刷新间隔更新');
    expect(html).toContain('按上游间隔刷新');
    expect(html).not.toContain('行情详情可能陈旧');
    expect(html).not.toContain('陈旧回退');
    // 徽标与横幅保持一致：间隔内不显示告警色「陈旧」，契约状态仍为 stale。
    expect(html).toContain('按上游间隔');
    expect(html).not.toMatch(/>陈旧</);
    expect(html).toContain('data-section-status="stale"');
    // 提示位于「实时行情」分段的分界线之下、标题之上。
    expect(html.indexOf('data-market-detail-section="quote"')).toBeLessThan(
      html.indexOf('行情按上游刷新间隔更新'),
    );
    expect(html.indexOf('行情按上游刷新间隔更新')).toBeLessThan(html.indexOf('实时行情</h3>'));
  });

  it('超过上游刷新间隔的行情回退仍保持陈旧告警', () => {
    const now = Date.now();
    useQueryMock.mockReturnValue({
      data: detailWithStaleQuote(new Date(now - 30 * 60_000).toISOString()),
      isPending: false,
      isError: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(html).toContain('行情详情可能陈旧');
    expect(html).toContain('陈旧回退');
    expect(html).toMatch(/>陈旧</);
    expect(html).not.toContain('行情按上游刷新间隔更新');
  });

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
    expect(errorHtml).toContain('重新加载');
  });

  it('重新打开即使命中客户端缓存也始终重新执行最新检查', () => {
    useQueryMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      isFetching: false,
    });
    renderToStaticMarkup(<MarketDetailDialog position={position} onClose={vi.fn()} />);
    expect(useQueryMock.mock.calls[0]?.[0]).toMatchObject({ refetchOnMount: 'always' });
  });
});
