// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value.js';

let container: HTMLDivElement;
let root: Root;
let seen: string[];

function Probe({ value }: { value: string }) {
  const debounced = useDebouncedValue(value, 300);
  seen.push(debounced);
  return null;
}

async function render(value: string) {
  await act(async () => {
    root.render(<Probe value={value} />);
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  seen = [];
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('首次渲染直接给出当前值，不等待防抖', async () => {
  await render('茅台');
  expect(seen.at(-1)).toBe('茅台');
});

it('未到延迟不改写输出，到点才切换', async () => {
  await render('');
  seen = [];
  await render('600519');
  expect(seen.at(-1)).toBe('');
  await advance(299);
  expect(seen.at(-1)).toBe('');
  await advance(1);
  expect(seen.at(-1)).toBe('600519');
});

it('连续输入只输出最后一次的值', async () => {
  await render('');
  await render('6');
  await render('60');
  await render('600');
  await advance(300);
  expect(seen.at(-1)).toBe('600');
  expect(seen.filter((value) => value === '6' || value === '60')).toHaveLength(0);
});

it('卸载后不再触发延迟更新', async () => {
  await render('');
  await render('late');
  const beforeUnmount = seen.length;
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  await advance(300);
  expect(seen).toHaveLength(beforeUnmount);
  root = createRoot(container);
});
