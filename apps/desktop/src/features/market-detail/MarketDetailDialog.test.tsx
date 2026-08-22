import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';

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
    DialogTitle: Title,
  };
});

import { MarketDetailDialog } from './MarketDetailDialog.js';

const time = '2026-08-21T00:00:00.000Z';
const position = {
  symbol: '600519.SH',
  quantity: 10,
  costPrice: 100,
  pnl: 20,
  asset: { name: '示例股票', assetType: 'stock' as const },
};

const detail = (input: Partial<MarketDetailResponse>): MarketDetailResponse => ({
    version: 1,
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
  version: 1 as const,
  symbol: '600519.SH',
  name,
  parameters: {},
  timeframe: '1d' as const,
  marketTime: time,
  calculatedAt: time,
  values: { value: 1 },
  provider: 'fixture',
  engineVersion: 'fixture',
});

const queryClient = {
  cancelQueries: vi.fn(),
  fetchQuery: vi.fn(),
};

describe('MarketDetailDialog UI contract', () => {
  beforeEach(() => {
    useQueryClientMock.mockReturnValue(queryClient);
    useQueryMock.mockReset();
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
          bars: { capability: 'bars', status: 'empty', data: [] },
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
      }),
      isPending: false,
      isError: false,
      isFetching: false,
    });

    const html = renderToStaticMarkup(
      <MarketDetailDialog position={position} onClose={vi.fn()} />,
    );

    expect(html).toContain('持仓数量');
    expect(html).toContain('实时价');
    expect(html).toContain('技术指标');
    expect(html).toContain('data-market-detail-section="chip"');
    expect(html).toContain('重试');
    expect(html).toContain('数据可用性');
  });

  it('ETF 隐藏 unsupported chip，而基金只渲染 NAV 分段', () => {
    useQueryMock.mockReturnValue({ data: null, isPending: false, isError: false, isFetching: false });
    const etfHtml = renderToStaticMarkup(
      <MarketDetailDialog
        position={{ ...position, symbol: '510300.SH', asset: { name: '示例 ETF', assetType: 'etf' } }}
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
        position={{ ...position, symbol: '000001.OF', asset: { name: '示例基金', assetType: 'fund' } }}
        onClose={vi.fn()}
      />,
    );
    expect(fundHtml).toContain('单位净值');
    expect(fundHtml).toContain('基金净值历史');
    expect(fundHtml).not.toContain('data-market-detail-section="quote"');
  });

  it('保留 loading 和整页读取失败状态', () => {
    useQueryMock.mockReturnValue({ data: undefined, isPending: true, isError: false, isFetching: true });
    const loadingHtml = renderToStaticMarkup(
      <MarketDetailDialog position={position} onClose={vi.fn()} />,
    );
    expect(loadingHtml).toContain('行情分段加载中');

    useQueryMock.mockReturnValue({ data: undefined, isPending: false, isError: true, isFetching: false });
    const errorHtml = renderToStaticMarkup(
      <MarketDetailDialog position={position} onClose={vi.fn()} />,
    );
    expect(errorHtml).toContain('行情详情读取失败');
    expect(errorHtml).toContain('重新加载');
  });
});
