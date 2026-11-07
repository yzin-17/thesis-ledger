// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DecimalInput } from '../src/components/ui/decimal-input.js';
import { InputGroup } from '../src/components/ui/input-group.js';

let host: HTMLDivElement;
let root: Root;
const original = '1.2222222222222223';
const edited = '2.345678901234567890';
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
const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const field = () => host.querySelector<HTMLInputElement>('input:not([type="hidden"])')!;
const form = (id?: string) => host.querySelector<HTMLFormElement>(id ? '#' + id : 'form')!;
const submitted = (id?: string) => new FormData(form(id)).get('cost');
const reset = async (id?: string) => {
  await act(async () => {
    form(id).reset();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const edit = async (value = edited) => {
  await act(async () => field().focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(), value);
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

it.each([false, true])('原生 reset 恢复完整默认值，grouped=%s，且不触发新修改', async (grouped) => {
  const changed = vi.fn();
  await render(
    <form>
      <InputGroup>
        <DecimalInput grouped={grouped} name="cost" defaultValue={original} onChange={changed} />
      </InputGroup>
    </form>,
  );
  await edit();
  await act(async () => field().blur());
  expect(submitted()).toBe(edited);
  expect(changed).toHaveBeenCalledTimes(1);
  await reset();
  expect(field().value).toBe('1.222222');
  expect(submitted()).toBe(original);
  expect(changed).toHaveBeenCalledTimes(1);
  await act(async () => field().focus());
  expect(field().value).toBe(original);
});

it('聚焦中的 reset 保留焦点并恢复完整默认文本', async () => {
  await render(
    <form>
      <DecimalInput name="cost" defaultValue={original} />
    </form>,
  );
  await edit();
  await reset();
  expect(document.activeElement).toBe(field());
  expect(field().value).toBe(original);
  expect(submitted()).toBe(original);
});

it('reset 同步父组件在事件中提交的最新默认值', async () => {
  const nextDefault = '3.456789012345678901';
  function Example() {
    const [seed, setSeed] = useState(original);
    return (
      <form onReset={() => setSeed(nextDefault)}>
        <DecimalInput name="cost" defaultValue={seed} />
      </form>
    );
  }
  await render(<Example />);
  await edit();
  await reset();
  expect(submitted()).toBe(nextDefault);
});

it('取消原生 reset 保留草稿及提交值', async () => {
  await render(
    <form onReset={(event) => event.preventDefault()}>
      <DecimalInput name="cost" defaultValue={original} />
    </form>,
  );
  await edit();
  await reset();
  expect(field().value).toBe(edited);
  expect(submitted()).toBe(edited);
});

it('受控值在 reset 后继续由父组件拥有', async () => {
  function Example() {
    const [value, setValue] = useState(original);
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
  await render(<Example />);
  await edit();
  await reset();
  expect(field().value).toBe(edited);
  expect(submitted()).toBe(edited);
});

it.each(['9007199254740993.125', '0.' + '0'.repeat(350) + '1', '0', ''])(
  '边界默认值 %s 重置后按原文本提交',
  async (value) => {
    await render(
      <form>
        <DecimalInput name="cost" defaultValue={value} />
      </form>,
    );
    await edit('4.5');
    await reset();
    expect(field().value).toBe(value);
    expect(submitted()).toBe(value);
  },
);

it('外置 form 同时关联显示控件和唯一命名原值', async () => {
  await render(
    <>
      <form id="owner" />
      <DecimalInput name="cost" form="owner" defaultValue={original} />
    </>,
  );
  expect(field().form).toBe(form('owner'));
  expect(new FormData(form('owner')).getAll('cost')).toEqual([original]);
  await edit();
  await reset('owner');
  expect(submitted('owner')).toBe(original);
});

it('form 归属变更后只响应新表单的 reset', async () => {
  const controls = (owner: string) => (
    <>
      <form id="first" />
      <form id="second" />
      <DecimalInput form={owner} name="cost" defaultValue={original} />
    </>
  );
  await render(controls('first'));
  await edit();
  await render(controls('second'));
  await reset('first');
  expect(submitted('second')).toBe(edited);
  await reset('second');
  expect(submitted('second')).toBe(original);
});

it('disabled 原值继续排除在表单提交之外', async () => {
  await render(
    <form>
      <DecimalInput name="cost" defaultValue={original} disabled />
    </form>,
  );
  await reset();
  expect(submitted()).toBeNull();
});
