import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioDashboard } from '../src/features/legacy-pages.js';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

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
                marketValue: 14880,
                pnl: 380,
                stale: false,
                asset: { name: '贵州茅台', assetType: 'stock' },
              },
            ],
          }}
        />
      </QueryClientProvider>,
    );

    const table = html.match(/<table>[\s\S]*?<thead>([\s\S]*?标的[\s\S]*?操作[\s\S]*?)<\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/);
    expect(table).not.toBeNull();

    const headers = [...table![1]!.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => text(match[1]!));
    const cells = [...table![2]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => text(match[1]!));

    expect(headers).toEqual(['标的', '数量', '成本价', '市值', '浮盈亏', '状态', '操作']);
    expect(cells).toHaveLength(headers.length);
    expect(cells[0]).toContain('贵州茅台');
    expect(cells[1]).toBe('10');
    expect(cells[5]).toContain('最新');
    expect(cells[6]).toContain('行情详情');
  });
});
