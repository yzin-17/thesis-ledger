import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioDashboard } from '../src/features/portfolio/PortfolioDashboard.js';
import {
  nextPortfolioPositionSort,
  PortfolioSummary,
  sortPortfolioPositions,
} from '../src/features/portfolio/PortfolioOverview.js';
import { fetchPortfolioValuation } from '../src/features/portfolio/portfolio.api.js';
import type { Position } from '../src/features/portfolio/portfolio.types.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

describe('Portfolio table contract', () => {
  it('同一列点击三次后恢复默认市值降序', () => {
    const first = nextPortfolioPositionSort(null, 'dailyPnl');
    const second = nextPortfolioPositionSort(first, 'dailyPnl');
    const third = nextPortfolioPositionSort(second, 'dailyPnl');

    expect(first).toEqual({ key: 'dailyPnl', direction: 'desc' });
    expect(second).toEqual({ key: 'dailyPnl', direction: 'asc' });
    expect(third).toBeNull();
  });

  it('按市值、今日收益和未实现盈亏排序，并将不可用值置底', () => {
    const positions = [
      {
        id: 'position-a',
        accountId: 'account-a',
        symbol: 'A',
        quantity: 1,
        costPrice: 10,
        marketValue: 100,
        pnl: 5,
        dailyPnl: -2,
        stale: false,
        asset: { name: 'A' },
      },
      {
        id: 'position-b',
        accountId: 'account-b',
        symbol: 'B',
        quantity: 1,
        costPrice: 10,
        marketValue: 200,
        pnl: -10,
        dailyPnl: 8,
        stale: false,
        asset: { name: 'B' },
      },
      {
        id: 'position-c',
        accountId: 'account-c',
        symbol: 'C',
        quantity: 1,
        costPrice: 10,
        marketValue: null,
        pnl: null,
        dailyPnl: null,
        stale: true,
        asset: { name: 'C' },
      },
    ] satisfies Position[];

    expect(
      sortPortfolioPositions(positions, { key: 'marketValue', direction: 'desc' }).map(
        (position) => position.symbol,
      ),
    ).toEqual(['B', 'A', 'C']);
    expect(
      sortPortfolioPositions(positions, { key: 'dailyPnl', direction: 'desc' }).map(
        (position) => position.symbol,
      ),
    ).toEqual(['B', 'A', 'C']);
    expect(
      sortPortfolioPositions(positions, { key: 'pnl', direction: 'asc' }).map(
        (position) => position.symbol,
      ),
    ).toEqual(['B', 'A', 'C']);
  });

  it('使用组合级累计字段，不把当前持仓未实现盈亏直接改名', () => {
    const html = renderToStaticMarkup(
      <PortfolioSummary
        portfolio={{
          totalMarketValue: 104,
          totalCost: 80,
          totalPnl: 24,
          unrealizedPnl: 24,
          unrealizedPnlRatio: 0.3,
          realizedPnl: 4,
          realizedPnlRatio: 0.2,
          cumulativePnl: 28,
          cumulativePnlRatio: 0.28,
          cashValue: 0,
          mode: 'actual',
          partial: false,
          valuedAt: '2026-09-09T00:00:00.000Z',
          positions: [],
        }}
      />,
    );

    expect(html).toContain('+¥28.00');
    expect(html).toContain('+28.00% · 已实现 + 未实现');
    expect(html).toContain('+¥4.00');
    expect(html).toContain('来自已卖出交易');
    expect(html).not.toContain('最大持仓');
  });

  it('keeps row cells aligned with the seven semantic headers', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <PortfolioDashboard
          state="ready"
          mode="actual"
          onModeChange={vi.fn()}
          onRetry={vi.fn()}
          onNavigate={vi.fn()}
          accounts={[
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: '测试账户',
              type: 'securities',
              mode: 'actual',
              currency: 'CNY',
            },
          ]}
          portfolio={{
            totalMarketValue: 14880,
            totalCost: 14500,
            totalPnl: 380,
            unrealizedPnl: 380,
            unrealizedPnlRatio: 380 / 14500,
            realizedPnl: 0,
            realizedPnlRatio: null,
            cumulativePnl: 380,
            cumulativePnlRatio: 380 / 14500,
            cashValue: 0,
            dailyChange: {
              pnl: 80,
              returnRate: 0.005405,
              partial: false,
              missingSymbols: [],
              basis: 'PREVIOUS_CLOSE_CURRENT_HOLDINGS',
            },
            mode: 'actual',
            partial: false,
            valuedAt: '2026-08-21T04:00:00.000Z',
            positions: [
              {
                id: '00000000-0000-4000-8000-000000000002',
                accountId: '00000000-0000-4000-8000-000000000001',
                symbol: '600519.SH',
                quantity: 10,
                costPrice: 1450,
                marketPrice: 1488,
                previousClose: 1480,
                marketValue: 14880,
                pnl: 380,
                pnlRatio: 0.0262069,
                dailyPnl: 80,
                dailyReturn: 0.005405,
                stale: false,
                asset: { name: '贵州茅台', assetType: 'stock' },
              },
            ],
          }}
        />
      </QueryClientProvider>,
    );

    const table = html.match(
      /<table>[\s\S]*?<thead>([\s\S]*?标的[\s\S]*?操作[\s\S]*?)<\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/,
    );
    expect(table).not.toBeNull();
    const headers = [...table![1]!.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) =>
      text(match[1]!),
    );
    const cells = [...table![2]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) =>
      text(match[1]!),
    );

    expect(headers).toEqual([
      '标的',
      '持有',
      '现价',
      '市值',
      '今日收益',
      '未实现盈亏',
      '状态',
      '操作',
    ]);
    expect(cells).toHaveLength(headers.length);
    expect(cells[0]).toContain('贵州茅台');
    expect(cells[1]).toContain('成本');
    expect(cells[2]).toContain('今日 +0.54%');
    expect(cells[3]).toContain('仓位 100.00%');
    expect(cells[4]).toContain('+¥80.00');
    expect(cells[5]).toContain('+2.62%');
    expect(cells[6]).toContain('最新');
    expect(cells[7]).toContain('行情详情');
    expect(html).toContain('今日收益');
    expect(html).toContain('累计盈亏');
    expect(html).toContain('已实现盈亏');
    expect(html).not.toContain('最大持仓');
    expect(html).toContain('较上一交易日');
    expect(html).toContain('按市值排序，当前为默认降序，点击进入排序循环');
    expect(html).toContain('按今日收益排序，当前未排序，点击按降序排列');
    expect(html).toContain('按未实现盈亏排序，当前未排序，点击按降序排列');
    expect(html).toContain('按市值降序');
  });

  it('兼容并映射 Portfolio API 的每日变化字段', async () => {
    const request = vi.fn(
      async <T,>() =>
        ({
          positions: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              accountId: '00000000-0000-4000-8000-000000000001',
              symbol: '600519.SH',
              quantity: 10,
              costPrice: 1450,
              marketPrice: 1488,
              previousClose: 1480,
              marketValue: 14880,
              costValue: 14500,
              pnl: 380,
              pnlRatio: 0.0262069,
              dailyPnl: 80,
              dailyReturn: 0.005405,
              baseDailyPnl: 80,
              stale: false,
              asset: { name: '贵州茅台', assetType: 'stock' },
            },
          ],
          cashValue: 0,
          cashByAccount: [],
          totalCost: 14500,
          totalMarketValue: 14880,
          totalPnl: 380,
          unrealizedPnl: 380,
          unrealizedPnlRatio: 380 / 14500,
          realizedPnl: 0,
          realizedPnlRatio: null,
          cumulativePnl: 380,
          cumulativePnlRatio: 380 / 14500,
          dailyChange: {
            pnl: 80,
            returnRate: 0.005405,
            partial: false,
            missingSymbols: [],
            basis: 'PREVIOUS_CLOSE_CURRENT_HOLDINGS',
          },
          partial: false,
          mode: 'actual',
          baseCurrency: 'CNY',
          valuedAt: '2026-09-09T00:00:00.000Z',
        }) as T,
    );

    const result = await fetchPortfolioValuation('actual', undefined, {
      request,
    } as unknown as DesktopRequestClient);

    expect(result.dailyChange).toMatchObject({ pnl: 80, returnRate: 0.005405 });
    expect(result.positions[0]).toMatchObject({
      marketPrice: 1488,
      previousClose: 1480,
      dailyPnl: 80,
      dailyReturn: 0.005405,
      pnlRatio: 0.0262069,
    });
  });
});
