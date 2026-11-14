// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi } from './mobile-view-harness';
import { MarketCatalogScreen } from '../../src/features/market-catalog/MarketCatalogScreen';
import { InstrumentPicker } from '../../src/features/market/InstrumentPicker';
import { b5Catalog } from './batch5-fixture';

const row = { id: '11111111-1111-4111-8111-111111111111', symbol: '600036.SH', canonicalCode: '600036',
  displayName: '招商银行', instrumentType: 'STOCK', market: 'SH', generation: 1, active: true,
  confirmable: true, confirmed: false, disabledReason: null };
it('目录确认失败可重试，成功后显示已确认并禁用，不支持市场单独显示', async () => {
  let saved = false, fail = true, writes = 0;
  setApi(vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      writes += 1;
      if (fail) return Response.json({}, { status: 503 });
      saved = true; return Response.json({});
    }
    if (String(url).includes('/instruments/search')) return Response.json([{ ...row, confirmed: saved },
      { ...row, id: '22222222-2222-4222-8222-222222222222', symbol: '03968.HK', market: 'HK',
        confirmable: false, confirmed: false, disabledReason: 'unsupported_market' }]);
    return Response.json(b5Catalog);
  }));
  await mount(<MarketCatalogScreen />);
  await input(field('标的名称或代码'), '招商银行');
  await click(button('搜索标的'));
  await vi.waitFor(() => expect(button('确认标的 600036.SH')?.disabled).toBe(false));
  expect(button('不支持关联 03968.HK')?.disabled).toBe(true);
  expect(document.body.textContent).toContain('当前市场暂不支持持仓关联');
  await click(button('确认标的 600036.SH'));
  await vi.waitFor(() => expect(button('确认标的 600036.SH')?.disabled).toBe(false));
  expect(document.body.textContent).not.toContain('已确认 600036.SH');
  fail = false;
  await click(button('确认标的 600036.SH'));
  await vi.waitFor(() => expect(button('已确认 600036.SH')?.disabled).toBe(true));
  expect(writes).toBe(2);
});

it('已确认标的仍然可在持仓选择器中选择', async () => {
  const selected = vi.fn();
  setApi(vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
    Response.json(init?.method === 'POST' ? {} : [{ ...row, confirmed: true }])));
  await mount(<InstrumentPicker purpose="holding" onConfirmed={selected} />);
  await input(field('代码或名称'), '招商银行');
  await click(button('搜索标的'));
  await vi.waitFor(() => expect(button('确认 招商银行')?.disabled).toBe(false));
  await click(button('确认 招商银行'));
  expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: row.id, confirmed: true }));
});
