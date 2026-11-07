// @vitest-environment jsdom
import { act, createRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DateInput } from '../src/components/ui/date-input.js';
import { Field, FieldLabel } from '../src/components/ui/field.js';

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
const input = () => host.querySelector<HTMLInputElement>('input')!;
const formValue = () => new FormData(host.querySelector('form')!).get('at');
const click = async (element: HTMLElement) => act(async () => element.click());
const open = () => click(host.querySelector<HTMLButtonElement>('button')!);
const panel = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
const button = (text: string) =>
  Array.from(panel().querySelectorAll('button')).find((item) => item.textContent === text)!;
const edit = async (element: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

it('面板编辑控件隔离外层 Field 的 id、名称和表单字段', async () => {
  await act(async () =>
    root.render(
      <form>
        <Field name="at">
          <FieldLabel htmlFor="start-month">开始月份</FieldLabel>
          <DateInput id="start-month" type="month" defaultValue="2026-11" />
        </Field>
      </form>,
    ),
  );
  await open();
  const year = panel().querySelector<HTMLInputElement>('input')!;
  expect(year.id).not.toBe('start-month');
  expect(year.name).not.toBe('at');
  expect(year.getAttribute('aria-labelledby')).not.toBe(input().getAttribute('aria-labelledby'));
  expect(new FormData(host.querySelector('form')!).getAll('at')).toEqual(['2026-11']);
});

it('聚焦、失焦和开关面板不改写秒、毫秒及提交原值', async () => {
  const changed = vi.fn();
  const ref = createRef<HTMLInputElement>();
  await act(async () =>
    root.render(
      <form>
        <DateInput
          ref={ref}
          name="at"
          type="datetime-local"
          value="2026-11-06T12:34:56.789"
          step="any"
          onChange={changed}
        />
      </form>,
    ),
  );
  expect(ref.current).toBe(input());
  expect(formValue()).toBe('2026-11-06T12:34:56.789');
  await act(async () => input().focus());
  await act(async () => input().blur());
  await open();
  await click(button('完成'));
  expect(formValue()).toBe('2026-11-06T12:34:56.789');
  expect(changed).not.toHaveBeenCalled();
});

it('受控月份选择、清除与原生表单值同步，边界月份禁用', async () => {
  const changed = vi.fn();
  function Sample() {
    const [value, setValue] = useState('2026-11');
    return (
      <form>
        <DateInput
          name="at"
          type="month"
          value={value}
          min="2026-10"
          max="2026-12"
          required
          onChange={(event) => {
            changed(event.target.value);
            setValue(event.target.value);
          }}
        />
      </form>
    );
  }
  await act(async () => root.render(<Sample />));
  await open();
  expect(button('9月').disabled).toBe(true);
  await click(button('12月'));
  expect(formValue()).toBe('2026-12');
  expect(changed).toHaveBeenLastCalledWith('2026-12');
  await open();
  await click(button('清除'));
  expect(formValue()).toBe('');
  expect(input().validity.valueMissing).toBe(true);
});

it('非受控日期支持键盘编辑、原生校验与表单重置', async () => {
  await act(async () =>
    root.render(
      <form>
        <DateInput
          name="at"
          type="date"
          defaultValue="2026-11-06"
          min="2026-11-01"
          max="2026-11-30"
        />
      </form>,
    ),
  );
  await edit(input(), '2026-11-12');
  expect(formValue()).toBe('2026-11-12');
  expect(host.textContent).toContain('2026-11-12');
  await edit(input(), '2026-12-01');
  expect(input().validity.rangeOverflow).toBe(true);
  await act(async () => host.querySelector('form')!.reset());
  expect(formValue()).toBe('2026-11-06');
  expect(host.textContent).toContain('2026-11-06');
});

it.each([{ disabled: true }, { readOnly: true }])(
  '禁用或只读不打开面板、不改变值：%o',
  async (state) => {
    const changed = vi.fn();
    await act(async () =>
      root.render(
        <form>
          <DateInput {...state} name="at" type="month" value="2026-11" onChange={changed} />
        </form>,
      ),
    );
    await open();
    await click(input());
    expect(panel()).toBeNull();
    expect(input().value).toBe('2026-11');
    expect(changed).not.toHaveBeenCalled();
  },
);

it('选择新日期保留已有时间精度，时间编辑按原 step 校验', async () => {
  function Sample() {
    const [value, setValue] = useState('2026-11-06T12:34:56.789');
    return (
      <form>
        <DateInput
          name="at"
          type="datetime-local"
          value={value}
          step="any"
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    );
  }
  await act(async () => root.render(<Sample />));
  await open();
  const day = Array.from(panel().querySelectorAll<HTMLButtonElement>('button[data-day]')).find(
    (item) => item.textContent === '7',
  )!;
  await click(day);
  expect(formValue()).toBe('2026-11-07T12:34:56.789');
  await edit(panel().querySelector<HTMLInputElement>('input[type="time"]')!, '08:09:10.123');
  expect(formValue()).toBe('2026-11-07T08:09:10.123');
});

it('日期时间边界与步长由原生输入判定，非法选择可恢复', async () => {
  function Sample() {
    const [value, setValue] = useState('2026-11-06T12:00');
    return (
      <form>
        <DateInput
          name="at"
          type="datetime-local"
          value={value}
          min="2026-11-06T10:00"
          max="2026-11-06T13:00"
          step={900}
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    );
  }
  await act(async () => root.render(<Sample />));
  await open();
  await edit(panel().querySelector<HTMLInputElement>('input[type="time"]')!, '14:00');
  expect(formValue()).toBe('2026-11-06T12:00');
  expect(panel().textContent).toContain('请选择允许范围和间隔');
  await edit(panel().querySelector<HTMLInputElement>('input[type="time"]')!, '12:07');
  expect(formValue()).toBe('2026-11-06T12:00');
  await edit(panel().querySelector<HTMLInputElement>('input[type="time"]')!, '12:15');
  expect(formValue()).toBe('2026-11-06T12:15');
  expect(panel().querySelector('[role="alert"]')).toBeNull();
});
