// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Combobox, ComboboxInput } from '../src/components/ui/combobox.js';
import { InputGroupButton } from '../src/components/ui/input-group.js';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')];

it('内置清空与展开同时存在，清空在前；清空不移除展开入口', async () => {
  await act(async () => root.render(<Combobox items={['已选']} defaultValue="已选"><ComboboxInput showClear /></Combobox>));
  expect(buttons().map((el) => el.getAttribute('aria-label'))).toEqual(['清空选择', '展开选项']);
  expect(buttons()[0]!.parentElement).toBe(buttons()[1]!.parentElement);
  await act(async () => buttons()[0]!.click());
  expect(host.querySelector('input')!.value).toBe('');
  expect(buttons().some((el) => el.getAttribute('aria-label') === '展开选项')).toBe(true);
});

it('业务清空操作复用同一个尾部区域并保持原回调', async () => {
  const clear = vi.fn();
  await act(async () => root.render(<Combobox items={[]}><ComboboxInput endActions={<InputGroupButton aria-label="清空标的" onClick={clear}>×</InputGroupButton>} /></Combobox>));
  expect(buttons().map((el) => el.getAttribute('aria-label'))).toEqual(['清空标的', '展开选项']);
  expect(buttons()[0]!.parentElement).toBe(buttons()[1]!.parentElement);
  await act(async () => buttons()[0]!.click());
  expect(clear).toHaveBeenCalledTimes(1);
});

it('禁用与不显示展开图标的配置保持有效', async () => {
  await act(async () => root.render(<Combobox items={['已选']} defaultValue="已选"><ComboboxInput disabled showClear /></Combobox>));
  expect(buttons().every((el) => el.disabled)).toBe(true);
  await act(async () => root.render(<Combobox items={['已选']} defaultValue="已选"><ComboboxInput showClear showTrigger={false} /></Combobox>));
  expect(buttons().map((el) => el.getAttribute('aria-label'))).toEqual(['清空选择']);
});
