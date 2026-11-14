// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MultiSelect } from '../src/components/ui/multi-select';

let host: HTMLDivElement, root: Root;
const items = [{ value: 'a', label: '通知' }, { value: 'b', label: '报价' }];
function Form({ initial = [] as string[], disabled = false, maxSelected = 3 }) {
  const [value, setValue] = useState(initial);
  return <><MultiSelect label="能力" options={items} value={value} onValueChange={setValue}
    disabled={disabled} maxSelected={maxSelected} /><output>{JSON.stringify(value)}</output></>;
}
const input = () => host.querySelector('input')!;
const values = () => JSON.parse(host.querySelector('output')!.textContent!) as string[];
async function type(text: string) {
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const option = () => document.querySelector<HTMLElement>('[role="option"]')!;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('中文标签回显并保留未知选择，逐项移除不改变其他原值', async () => {
  await act(async () => root.render(<Form initial={['old-provider', 'a']} />));
  expect(host.querySelector('[data-slot="combobox-chips"]')!.textContent).toContain('通知');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="移除 old-provider"]')!.click());
  expect(values()).toEqual(['a']);
});
it('搜索后添加并清空输入，已选值仍能搜索和取消', async () => {
  await act(async () => root.render(<Form initial={['a']} />));
  await type('报价');
  await act(async () => option().click());
  expect(values()).toEqual(['a', 'b']);
  expect(input().value).toBe('');
  await type('报价');
  expect(option().getAttribute('aria-selected')).toBe('true');
  await act(async () => option().click());
  expect(values()).toEqual(['a']);
});
it('达到上限后禁用新增项，仍可移除已选项', async () => {
  await act(async () => root.render(<Form initial={['a']} maxSelected={1} />));
  await type('报价');
  expect(option().hasAttribute('data-disabled')).toBe(true);
  await act(async () => option().click());
  expect(values()).toEqual(['a']);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="移除 通知"]')!.click());
  expect(values()).toEqual([]);
});
it('连续切换不同搜索词不残留上一次候选', async () => {
  await act(async () => root.render(<Form />));
  await type('通知');
  await act(async () => option().click());
  await type('报价');
  expect(option().textContent).toContain('报价');
  await act(async () => option().click());
  expect(values()).toEqual(['a', 'b']);
});
it('禁用时输入和标签移除均不可操作', async () => {
  await act(async () => root.render(<Form initial={['a']} disabled />));
  expect(input().disabled).toBe(true);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="移除 通知"]')!.click());
  expect(values()).toEqual(['a']);
});
