// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { InstrumentPicker } from '../../src/features/market/InstrumentPicker';
import { WatchlistScreen } from '../../src/features/watchlist/WatchlistScreen';
const id = '00000000-0000-4000-8000-000000000001';
const instrument = {
  id,
  market: 'SZ',
  instrumentType: 'STOCK',
  canonicalCode: '000001',
  symbol: '000001.SZ',
  displayName: '目录名称',
  confirmable: true,
  disabledReason: null,
  active: true,
  generation: 1,
};
it.each(['research', 'watchlist', 'browse', 'holding'] as const)(
  '选择器用途 %s 只在录入持仓时确认资产',
  async (purpose) => {
    const requests: string[] = [];
    setApi(async (url) => {
      const path = new URL(String(url)).pathname;
      requests.push(path);
      if (path.endsWith('/search')) return Response.json([instrument]);
      return new Response(null, { status: 204 });
    });
    const select = vi.fn();
    await mount(<InstrumentPicker purpose={purpose} onConfirmed={select} />);
    await input(field('代码或名称'), '000001');
    await click(button('搜索标的'));
    await vi.waitFor(() =>
      expect(button((purpose === 'holding' ? '确认' : '选择') + ' 目录名称')).toBeTruthy(),
    );
    await click(button((purpose === 'holding' ? '确认' : '选择') + ' 目录名称'));
    expect(select).toHaveBeenCalledWith(instrument);
    expect(requests.filter((p) => p.endsWith('/confirm'))).toHaveLength(
      purpose === 'holding' ? 1 : 0,
    );
  },
);
it('无账户名单可进入标的详情；来源失败仍可移除', async () => {
  let removed = false;
  const writes: object[] = [];
  setApi(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/identity/context')) return Response.json({ principal: { id } });
    if (path.endsWith('/prices'))
      return Response.json({ message: '行情来源暂不可用' }, { status: 503 });
    if (path.endsWith('/changes')) {
      writes.push(JSON.parse(String(init?.body)));
      removed = true;
      return Response.json({ revision: 2 });
    }
    if (path.endsWith('/watchlist'))
      return Response.json({
        revision: removed ? 2 : 1,
        groups: [],
        nextOffset: null,
        items: removed
          ? []
          : [
              {
                id,
                displayName: '目录名称',
                instrument: {
                  id,
                  canonicalCode: '000001',
                  market: 'SZ',
                  instrumentType: 'STOCK',
                  active: true,
                },
                groupId: null,
                pinned: false,
                order: 0,
                addedAt: '2026-11-05T08:00:00Z',
              },
            ],
      });
    throw new Error(path);
  });
  await mount(<WatchlistScreen />);
  await vi.waitFor(() => expect(button('行情详情')).toBeTruthy());
  await click(button('行情详情'));
  expect(view.navigate).toHaveBeenCalledWith('MarketDetail', {
    instrument: expect.objectContaining({ instrumentId: id, symbol: '000001.SZ' }),
  });
  await click(button('管理'));
  await click(button('移出自选'));
  await vi.waitFor(() => expect(document.body.textContent).toContain('当前名单为空'));
  expect(writes).toEqual([{ action: 'remove', itemId: id, revision: 1 }]);
});
