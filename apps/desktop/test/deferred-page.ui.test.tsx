// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeferredPage } from '../src/app/DeferredPage';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function view(children: ReactNode) {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(children));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.restoreAllMocks();
});
function Page({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((value) => value + 1)}>
      {label}:{count}
    </button>
  );
}
it('声明未访问的页面不执行加载器', async () => {
  const load = vi.fn(async () => ({ default: Page }));
  createDeferredPage(load);
  await view(<aside>主导航</aside>);
  expect(load).not.toHaveBeenCalled();
});
it('首次加载有可访问反馈，后续 props 更新保持页面状态与加载缓存', async () => {
  let finish!: (module: { default: typeof Page }) => void;
  const load = vi.fn(
    () =>
      new Promise<{ default: typeof Page }>((resolve) => {
        finish = resolve;
      }),
  );
  const Deferred = createDeferredPage(load);
  await view(<Deferred label="原范围" />);
  expect(host!.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('正在打开页面');
  expect(host!.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
  await act(async () => finish({ default: Page }));
  await act(async () => host!.querySelector('button')!.click());
  expect(host!.textContent).toBe('原范围:1');
  await view(<Deferred label="新范围" />);
  expect(host!.textContent).toBe('新范围:1');
  expect(load).toHaveBeenCalledTimes(1);
  await view(<aside>主导航</aside>);
  await view(<Deferred label="再次进入" />);
  expect(host!.textContent).toBe('再次进入:0');
  expect(load).toHaveBeenCalledTimes(1);
});
it('同一页面的两个实例共用代码缓存，分别保留状态', async () => {
  const load = vi.fn(async () => ({ default: Page }));
  const Deferred = createDeferredPage(load);
  await view(
    <>
      <Deferred label="甲" />
      <Deferred label="乙" />
    </>,
  );
  await act(async () => host!.querySelector('button')!.click());
  expect([...host!.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
    '甲:1',
    '乙:0',
  ]);
  expect(load).toHaveBeenCalledTimes(1);
});
it('等待代码期间切走不出现晚到页面，再次进入复用已加载代码', async () => {
  let finish!: (module: { default: typeof Page }) => void;
  const load = vi.fn(
    () =>
      new Promise<{ default: typeof Page }>((resolve) => {
        finish = resolve;
      }),
  );
  const Deferred = createDeferredPage(load);
  await view(<Deferred label="原页面" />);
  await view(<aside>其他页面</aside>);
  await act(async () => finish({ default: Page }));
  expect(host!.textContent).toBe('其他页面');
  await view(<Deferred label="返回页面" />);
  expect(host!.textContent).toBe('返回页面:0');
  expect(load).toHaveBeenCalledTimes(1);
});
it('代码读取失败保留应用壳与重新加载入口，隐藏技术异常', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const Deferred = createDeferredPage(async () => {
    throw new TypeError('受控 chunk 地址与栈');
  });
  await view(
    <>
      <aside>主导航</aside>
      <Deferred />
    </>,
  );
  expect(host!.querySelector('aside')?.textContent).toBe('主导航');
  expect(host!.querySelector('[role="alert"]')?.textContent).toContain('页面暂时无法打开');
  expect(host!.querySelector('button')?.textContent).toBe('重新加载页面');
  expect(host!.textContent).not.toContain('受控 chunk');
});
it('页面渲染异常在同一 Interface 收敛，兄弟内容继续可用', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const Deferred = createDeferredPage(async () => ({
    default: function BrokenPage() {
      throw new Error('受控渲染细节');
    },
  }));
  await view(
    <>
      <aside>主导航</aside>
      <Deferred />
    </>,
  );
  expect(host!.querySelector('aside')?.textContent).toBe('主导航');
  expect(host!.textContent).toContain('页面暂时无法打开');
  expect(host!.textContent).not.toContain('受控渲染细节');
});
