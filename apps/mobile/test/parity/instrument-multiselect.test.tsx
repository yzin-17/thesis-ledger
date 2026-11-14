// @vitest-environment jsdom
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { button, click, field, input, mount, setApi } from './mobile-view-harness';
import { InstrumentPicker } from '../../src/features/market/InstrumentPicker';

const directory: InstrumentSearchResult[] = ['股票甲', '股票乙'].map((displayName, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  displayName, symbol: `30000${index + 1}.SZ`, canonicalCode: `30000${index + 1}`,
  market: 'SZ', instrumentType: 'STOCK', active: true, confirmable: true,
  disabledReason: null, generation: 1,
}));
function Form({ reject = false, initial = [] }: { reject?: boolean; initial?: InstrumentSearchResult[] }) {
  const [selected, setSelected] = useState(initial);
  return <InstrumentPicker purpose="browse" label="参赛标的" selection={{
    items: selected,
    onRemove: (id) => setSelected((items) => items.filter((item) => item.id !== id)),
  }} onConfirmed={(item) => {
    if (reject) return false;
    setSelected((items) => [...items, item]);
    return true;
  }} />;
}
const chips = () => document.querySelector('[data-testid="multiselect-field"]')!;
async function search(text: string) {
  await input(field('参赛标的'), text);
  await click(button('搜索标的'));
}

it('连续添加后清空输入并保持焦点，名称和代码在同一输入容器内回显', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(directory));
  setApi(fetcher);
  await mount(<Form />);
  for (const item of directory) {
    await search(item.displayName);
    await vi.waitFor(() => expect(button('选择 ' + item.displayName)).toBeTruthy());
    await click(button('选择 ' + item.displayName));
    expect(field('参赛标的').value).toBe('');
    expect(document.activeElement).toBe(field('参赛标的'));
    expect(chips().textContent).toContain(`${item.displayName} · ${item.symbol}`);
  }
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  await click(document.querySelector('[aria-label="移除 股票甲 · 300001.SZ"]')! as HTMLElement);
  expect(chips().textContent).not.toContain('股票甲');
  expect(chips().textContent).toContain('股票乙');
});

it('已选标的仍能搜索，结果显示取消选择且不产生重复项', async () => {
  setApi(vi.fn().mockImplementation(async () => Response.json(directory)));
  await mount(<Form initial={[directory[0]!]} />);
  await search('股票');
  await vi.waitFor(() => expect(button('取消选择 股票甲')).toBeTruthy());
  expect(button('选择 股票乙')).toBeTruthy();
  await click(button('取消选择 股票甲'));
  expect(chips().textContent).not.toContain('股票甲');
  expect(field('参赛标的').value).toBe('');
});

it('业务校验拒绝时保留搜索输入和已选标的', async () => {
  setApi(vi.fn().mockImplementation(async () => Response.json(directory)));
  await mount(<Form reject initial={[directory[0]!]} />);
  await search('股票乙');
  await vi.waitFor(() => expect(button('选择 股票乙')).toBeTruthy());
  await click(button('选择 股票乙'));
  expect(field('参赛标的').value).toBe('股票乙');
  expect(chips().textContent).toContain('股票甲');
  expect(chips().textContent).not.toContain('股票乙');
});

it('目录失败和重试保留输入与已选集合', async () => {
  setApi(vi.fn()
    .mockResolvedValueOnce(Response.json({ message: '目录暂不可用' }, { status: 503 }))
    .mockResolvedValue(Response.json(directory)));
  await mount(<Form initial={[directory[0]!]} />);
  await search('股票乙');
  await vi.waitFor(() => expect(button('重新读取')).toBeTruthy());
  expect(field('参赛标的').value).toBe('股票乙');
  expect(chips().textContent).toContain('股票甲');
  await click(button('重新读取'));
  await vi.waitFor(() => expect(button('选择 股票乙')).toBeTruthy());
  expect(chips().textContent).toContain('股票甲');
});
