// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { MarketStaticScreen } from '../../src/features/market-static/MarketStaticScreen';
import { mobileInstrument } from '../../src/features/market-detail/market-model';
vi.mock('../../src/components/SourceLink', () => ({ SourceLink: () => null }));
describe('M14a 证券静态资料', () => {
  it('目录未覆盖时可按港美代码读取，坏输入不发请求，资料失败不遮蔽有效每手结果', async () => {
    view.params = {};
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('security-lot-size'))
        return Response.json({
          symbol: '00700.HK',
          sharesPerLot: '100',
          historicalChanges: 'unverified',
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: 'fixture-lot',
          fetchedAt: '2026-10-23T01:00:00Z',
          policyRevision: 1,
          routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
          source: {
            provider: 'futu',
            observedAt: '2026-10-23T00:00:00Z',
            sourceUrl: 'https://example.com/controlled-lot',
            sha256: 'a'.repeat(64),
          },
        });
      return Response.json(
        { error: 'Unavailable', message: '静态资料来源不可用' },
        { status: 503 },
      );
    });
    setApi(fetcher);
    await mount(<MarketStaticScreen />);
    expect(fetcher).not.toHaveBeenCalled();
    await input(field('港美证券代码'), 'bad');
    await click(button('读取港美资料'));
    expect(fetcher).not.toHaveBeenCalled();
    await input(field('港美证券代码'), '00700.HK');
    await click(button('读取港美资料'));
    expect(document.body.textContent).toContain('静态资料来源不可用');
    expect(document.body.textContent).toContain('100 股／手');
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('symbol=00700.HK'))).toBe(true);
  });
  it('不支持的市场保持明确状态，不推测每手股数或发错误请求', async () => {
    view.params = { instrument: mobileInstrument({ symbol: '510300.SH', instrumentType: 'etf' }) };
    const fetcher = vi.fn();
    setApi(fetcher);
    await mount(<MarketStaticScreen />);
    expect(document.body.textContent).toContain('此标的暂不支持');
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('100 股');
  });
  it('资料读取失败保留重试，不能呈现为未知字段的成功资料', async () => {
    view.params = { instrument: mobileInstrument({ symbol: 'SPY.US', instrumentType: 'etf' }) };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'Unavailable', message: '静态资料来源不可用' }, { status: 503 }),
      );
    setApi(fetcher);
    await mount(<MarketStaticScreen />);
    expect(document.body.textContent).toContain('静态资料来源不可用');
    expect(String(fetcher.mock.calls[0]![0])).toContain('assetType=ETF');
  });
});
