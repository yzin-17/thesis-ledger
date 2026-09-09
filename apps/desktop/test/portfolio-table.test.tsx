import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioDashboard } from '../src/features/portfolio/PortfolioDashboard.js';
import { fetchPortfolioValuation } from '../src/features/portfolio/portfolio.api.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();

describe('Portfolio table contract', () => {
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
      '累计收益',
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
    expect(html).toContain('今日持仓收益');
    expect(html).toContain('按当前持仓与上一价格估算');
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
