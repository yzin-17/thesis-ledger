// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { PerformanceTargetEditor } from '../src/features/performance/PerformanceTargetEditor';

let root: Root;
let host: HTMLDivElement;
const save = vi.fn();
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  )!;
const field = (category: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="${category}目标权重百分比"]`)!;
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(category: string, value: string) {
  await act(async () => {
    const input = field(category);
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function mount(targets: Record<string, number>) {
  await act(async () =>
    root.render(
      <ConfirmDialogProvider>
        <PerformanceTargetEditor
          label="编辑目标"
          scopeLabel="受控组合"
          categories={[]}
          targets={targets}
          saving={false}
          disabled={false}
          onSave={save}
        />
      </ConfirmDialogProvider>,
    ),
  );
  await click('编辑目标');
}
beforeEach(() => {
  vi.resetAllMocks();
  save.mockResolvedValue(true);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('配置目标原值与实际提交', () => {
  it('不编辑直接保存仍提交原权重', async () => {
    const original = { stock: 1 / 3, cash: 2 / 3 };
    await mount(original);
    await click('保存目标');
    expect(save).toHaveBeenCalledExactlyOnceWith(original);
  });
  it('只编辑其他分类时保留未编辑类别的原值', async () => {
    const original = { stock: 1 / 3, etf: 1 / 3, cash: 1 / 3 };
    await mount(original);
    await fill('ETF', '30');
    await fill('现金', '36.66666666666667');
    await click('保存目标');
    expect(save).toHaveBeenCalledExactlyOnceWith({
      stock: original.stock,
      etf: 0.3,
      cash: 0.3666666666666667,
    });
  });
  it('只聚焦和失焦不产生草稿变化，取消直接关闭', async () => {
    await mount({ stock: 1 / 3, cash: 2 / 3 });
    await act(async () => {
      await vi.waitFor(() => expect(document.activeElement).toBe(field('股票')));
    });
    await act(async () => field('股票').blur());
    expect(document.activeElement).not.toBe(field('股票'));
    expect(field('股票').value).toBe('33.3333');
    await act(async () => {
      field('股票').focus();
    });
    expect(field('股票').value).toBe('33.33333333333333');
    await act(async () => {
      field('股票').blur();
    });
    expect(field('股票').value).toBe('33.3333');
    await click('取消');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it.each([1e-9, Number.MIN_VALUE])('极小原值 %s 不显示成零，也不在提交时下溢', async (weight) => {
    const original = { stock: weight, cash: 1 };
    await mount(original);
    expect(Number(field('股票').value)).toBeGreaterThan(0);
    await click('保存目标');
    expect(save).toHaveBeenCalledExactlyOnceWith(original);
  });
  it('失败保留完整输入，空值和显示近似一百的无效合计仍阻止提交', async () => {
    save.mockResolvedValue(false);
    await mount({ stock: 1 / 3, cash: 2 / 3 });
    const raw = '33.3333333333333333333333333';
    await fill('股票', raw);
    await click('保存目标');
    expect(save).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => field('股票').focus());
    expect(field('股票').value).toBe(raw);
    await fill('股票', '');
    expect(button('保存目标').disabled).toBe(true);
    await fill('股票', '99.9995');
    await fill('现金', '0');
    expect(button('保存目标').disabled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('99.9995%');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '合计不足 100%，请增加目标权重。',
    );
  });
});
