// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount, setApi, view } from './mobile-view-harness';
import { MarketStaticScreen } from '../../src/features/market-static/MarketStaticScreen';
import { mobileInstrument } from '../../src/features/market-detail/market-model';
vi.mock('../../src/components/SourceLink', () => ({ SourceLink: () => null }));
describe('M14a 证券静态资料', () => {
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
