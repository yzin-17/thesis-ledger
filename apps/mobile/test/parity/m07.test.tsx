// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { mount, setApi, view } from './mobile-view-harness';
import { mobileValuationOptions } from '../../src/app/query/valuation-query';
import { mobileScopeKey } from '../../src/app/navigation-state';
import { MobilePortfolioScreen } from '../../src/components/MobilePortfolioScreen';
import { valuationLoadState } from '../../src/app/query/query-state';
import { TradesScreen } from '../../src/features/portfolio/TradesScreen';
const accountId = '00000000-0000-4000-8000-000000000001';
const valuation = {
  positions: [],
  cashValue: 500,
  cashByAccount: [{ accountId, amount: 500 }],
  totalCost: 0,
  totalMarketValue: 500,
  totalPnl: 0,
  unrealizedPnl: 0,
  unrealizedPnlRatio: null,
  realizedPnl: 0,
  realizedPnlRatio: null,
  cumulativePnl: 0,
  cumulativePnlRatio: null,
  mode: 'shadow' as const,
  partial: false,
  baseCurrency: 'USD',
  valuedAt: '2026-10-22T01:00:00.000Z',
};
vi.mock('react-native', async () => {
  const React = await import('react');
  const Element = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', {}, children);
  return { Text: Element, View: Element, ActivityIndicator: Element };
});
describe('手机组合范围与事实展示', () => {
  it('从单账户组合进入交易时，首个交易请求继承该账户而非读取全量', async () => {
    const fetcher = vi.fn(async (url: string) =>
      Response.json(
        url.includes('/portfolio/trades') ? { mode: 'shadow', items: [], nextCursor: null } : [],
      ),
    );
    setApi(fetcher);
    view.params = { accountId };
    await mount(<TradesScreen />);
    const urls = fetcher.mock.calls.map(([url]) => new URL(url));
    const trades = urls.filter((url) => url.pathname.endsWith('/portfolio/trades'));
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every((url) => url.searchParams.get('accountId') === accountId)).toBe(true);
    expect(trades.every((url) => url.searchParams.get('mode') === 'shadow')).toBe(true);
  });
  it('模式或账户不符的估值作为读取失败，不进入当前范围缓存', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...valuation, mode: 'actual' }))
      .mockResolvedValueOnce(
        Response.json({
          ...valuation,
          cashByAccount: [{ accountId: '00000000-0000-4000-8000-000000000002', amount: 500 }],
        }),
      )
      .mockResolvedValueOnce(Response.json(valuation));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const options = mobileValuationOptions(
      api,
      mobileScopeKey('https://ledger.test/api/v1', 'shadow'),
      accountId,
    );
    const context = { signal: new AbortController().signal };
    await expect(options.queryFn(context)).rejects.toThrow('响应契约');
    await expect(options.queryFn(context)).rejects.toThrow('响应契约');
    await expect(options.queryFn(context)).resolves.toMatchObject({
      cashValue: 500,
      baseCurrency: 'USD',
    });
  });
  it('没有证券持仓时仍展示服务端现金和汇总，币种不固定成人民币', async () => {
    expect(valuationLoadState({ data: valuation, isPending: false, isError: false })).toBe('ready');
    expect(
      valuationLoadState({
        data: { ...valuation, partial: true },
        isPending: false,
        isError: false,
      }),
    ).toBe('stale');
    await mount(
      <MobilePortfolioScreen
        state={{
          status: 'empty',
          mode: 'shadow',
          portfolio: valuation,
          riskEvents: [],
          error: null,
        }}
        theme={{} as never}
        styles={{} as never}
      />,
    );
    expect(document.body.textContent).toContain('现金');
    expect(document.body.textContent).toContain('US$500.00');
    expect(document.body.textContent).toContain('暂无持仓');
  });
});
