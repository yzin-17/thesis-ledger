// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResearchDefaultModelField } from '../src/features/ai/ResearchDefaultModelField';

type Model = ComponentProps<typeof ResearchDefaultModelField>['model'];
let root: Root;
let host: HTMLDivElement;
function model(overrides: Partial<Model> = {}): Model {
  const selected = { value: 'controlled', label: '受控提供方 / 研究模型', priceConfigured: false };
  return {
    query: { isPending: false, isError: false, isFetching: false },
    options: [selected],
    selected,
    selectedKey: selected.value,
    currentDefault: { providerId: 'controlled', model: 'configured-model' },
    dirty: true,
    saving: false,
    error: null,
    choose: vi.fn(),
    save: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}
async function render(value: Model, disabled = false) {
  await act(async () => {
    root.render(<ResearchDefaultModelField model={value} disabled={disabled} />);
    await Promise.resolve();
  });
}
function button(label: string) {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!found) throw new Error('找不到控件：' + label);
  return found;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.unstubAllGlobals();
});

it('已有默认模型不在候选中时仍回显原身份，禁止保存未知候选，清除只改变选择', async () => {
  const value = model({ selected: undefined, selectedKey: 'missing' });
  await render(value);
  expect(host.querySelector('[role="combobox"]')?.textContent).toContain(
    'controlled / configured-model',
  );
  expect(button('保存默认模型').disabled).toBe(true);
  expect(value.choose).not.toHaveBeenCalled();
  expect(value.save).not.toHaveBeenCalled();
  await act(async () => {
    button('清除默认').click();
    await Promise.resolve();
  });
  expect(value.choose).toHaveBeenCalledExactlyOnceWith('none');
  expect(value.save).not.toHaveBeenCalled();
});

it('明确选择清除默认后，允许保存空选择', async () => {
  const value = model({ selected: undefined, selectedKey: 'none', options: [] });
  await render(value);
  expect(button('保存默认模型').disabled).toBe(false);
  expect(button('清除默认').disabled).toBe(true);
  await act(async () => {
    button('保存默认模型').click();
    await Promise.resolve();
  });
  expect(value.save).toHaveBeenCalledOnce();
});

it('读取失败优先于历史保存错误，重新读取和禁用状态保持原资格', async () => {
  const value = model({
    query: { isPending: false, isError: true, isFetching: false },
    error: new Error('原保存失败'),
  });
  await render(value);
  expect(host.textContent).toContain('研究默认模型读取失败');
  expect(host.textContent).not.toContain('原保存失败');
  expect(button('保存默认模型').disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[role="combobox"]')?.disabled).toBe(true);
  await act(async () => {
    button('重新读取模型').click();
    await Promise.resolve();
  });
  expect(value.reload).toHaveBeenCalledOnce();
  await render(value, true);
  expect(button('重新读取模型').disabled).toBe(true);
  await render({ ...value, query: { ...value.query, isFetching: true } });
  expect(button('重新读取模型').disabled).toBe(true);
});

it('价格未填写仍可保存默认模型，单纯展示不会自动保存或改选', async () => {
  const value = model();
  await render(value);
  expect(host.textContent).toContain('价格尚未填写，可以保存默认');
  expect(button('保存默认模型').disabled).toBe(false);
  expect(value.choose).not.toHaveBeenCalled();
  expect(value.save).not.toHaveBeenCalled();
  await render({ ...value, saving: true });
  expect(button('保存中…').disabled).toBe(true);
  expect(value.save).not.toHaveBeenCalled();
});
