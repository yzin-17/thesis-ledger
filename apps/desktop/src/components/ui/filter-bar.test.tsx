// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FilterActions, FilterBar } from './filter-bar.js';

let container: HTMLDivElement;
let root: Root;

async function mount(node: ReactNode) {
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
}

function buttonByText(text: string) {
  const buttons = [...container.querySelectorAll('button')];
  const found = buttons.find((button) => button.textContent?.trim() === text);
  if (!found) throw new Error(`未找到按钮：${text}`);
  return found;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
  vi.unstubAllGlobals();
});

it('无条件时「清空筛选」常驻但禁用', async () => {
  await mount(<FilterActions onApply={vi.fn()} onReset={vi.fn()} hasConditions={false} />);
  expect(buttonByText('搜索')).not.toBeNull();
  expect(buttonByText('清空筛选').disabled).toBe(true);
});

it('有条件下可清空并回调', async () => {
  const onReset = vi.fn();
  await mount(<FilterActions onApply={vi.fn()} onReset={onReset} hasConditions />);
  await click(buttonByText('清空筛选'));
  expect(onReset).toHaveBeenCalledTimes(1);
});

it('提交按钮只渲染一个，且按作用域可改名', async () => {
  const onApply = vi.fn();
  await mount(
    <FilterActions applyLabel="查询历史" onApply={onApply} onReset={vi.fn()} hasConditions />,
  );
  expect(container.querySelectorAll('[data-slot="filter-actions"] > button')).toHaveLength(2);
  await click(buttonByText('查询历史'));
  expect(onApply).toHaveBeenCalledTimes(1);
});

it('busy 时禁用提交，避免重复发起', async () => {
  const onApply = vi.fn();
  await mount(<FilterActions onApply={onApply} onReset={vi.fn()} hasConditions busy />);
  const apply = buttonByText('搜索');
  expect(apply.disabled).toBe(true);
  expect(apply.getAttribute('aria-busy')).toBe('true');
  await click(apply);
  expect(onApply).not.toHaveBeenCalled();
});

it('筛选条用栅格承载字段，摘要独占整行', async () => {
  await mount(
    <FilterBar className="sm:grid-cols-2" summary={<span data-testid="summary">匹配 3 条</span>}>
      <div>字段一</div>
      <div>字段二</div>
    </FilterBar>,
  );
  const bar = container.querySelector('[data-slot="filter-bar"]');
  expect(bar?.className).toContain('grid');
  expect(bar?.className).toContain('items-end');
  expect(container.querySelector('[data-testid="summary"]')?.parentElement?.className).toContain(
    'col-span-full',
  );
});
