// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DecimalInput } from '../src/components/ui/decimal-input.js';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const input = () => host.querySelector<HTMLInputElement>('input:not([type="hidden"])')!;
const submitted = () => new FormData(host.querySelector('form')!).get('cost');

it('未编辑、聚焦失焦和修改其他字段均提交完整原值，不触发数值变更', async () => {
  const original = '1.2222222222222223';
  const changed = vi.fn();
  await act(async () =>
    root.render(
      <form>
        <DecimalInput name="cost" defaultValue={original} onChange={changed} />
        <input name="other" />
      </form>,
    ),
  );
  expect(input().value).toBe('1.222222');
  expect(submitted()).toBe(original);
  await act(async () => input().focus());
  expect(input().value).toBe(original);
  await act(async () => input().blur());
  expect(input().value).toBe('1.222222');
  expect(submitted()).toBe(original);
  expect(changed).not.toHaveBeenCalled();
});

it('实际输入在紧凑展示后仍按输入字符串提交', async () => {
  function Controlled() {
    const [value, setValue] = useState('1.2222222222222223');
    return (
      <form>
        <DecimalInput
          name="cost"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    );
  }
  await act(async () => root.render(<Controlled />));
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input(),
      '2.345678901234567890',
    );
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input().blur());
  expect(input().value).toBe('2.345679');
  expect(submitted()).toBe('2.345678901234567890');
});

it.each(['0.000000000000000001', '9007199254740993.125', '0', ''])(
  '边界值 %s 不显示成其他数值',
  async (value) => {
    await act(async () =>
      root.render(
        <form>
          <DecimalInput name="cost" defaultValue={value} />
        </form>,
      ),
    );
    expect(input().value).toBe(value);
    expect(submitted()).toBe(value);
  },
);

it('超长十进制字符串显示时也不经过浮点转换，极小非零值不下溢成零', async () => {
  const raw = '9007199254740990.9123456789';
  await act(async () => root.render(<form><DecimalInput name="cost" value={raw} /></form>));
  expect(input().value).toBe('9007199254740990.912346');
  expect(submitted()).toBe(raw);
  const tiny = `0.${'0'.repeat(350)}1`;
  await act(async () => root.render(<form><DecimalInput name="cost" value={tiny} /></form>));
  expect(input().value).toBe(tiny);
  expect(submitted()).toBe(tiny);
});

it('非负和必填校验继续生效，空输入保留为空', async () => {
  await act(async () =>
    root.render(
      <form>
        <DecimalInput name="cost" type="number" min="0" step="any" required defaultValue="-1" />
      </form>,
    ),
  );
  expect(input().validity.rangeUnderflow).toBe(true);
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), '');
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input().validity.valueMissing).toBe(true);
  expect(submitted()).toBe('');
});
