// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { AppShell } from '../src/app/AppShell.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import {
  PortfolioModeProvider,
  usePortfolioMode,
} from '../src/features/portfolio/portfolio-mode-context.js';
import { useDraftCloseGuard } from '../src/features/shared/useDraftCloseGuard.js';

const feedback = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => feedback }));
vi.mock('../src/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../src/components/market-color-menu', () => ({ MarketColorMenu: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });

const storageKey = 'thesis-ledger-portfolio-mode';
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
let reads: string[];
let writes: string[];
let settleWrite: ((result: 'ok' | 'error') => void) | undefined;
let settleRead: (() => void) | undefined;
let startWrite: (() => void) | undefined;
let discardCount = 0;
const NativeRequest = globalThis.Request;

function DraftPage() {
  const { mode, changeMode } = usePortfolioMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      writes.push(mode);
      await new Promise<void>((resolve, reject) => {
        settleWrite = (result) => (result === 'ok' ? resolve() : reject(new Error('受控保存失败')));
      });
      await new Promise<void>((resolve) => {
        settleRead = resolve;
      });
    },
  });
  startWrite = () => mutation.mutate();
  useDraftCloseGuard({
    open: true,
    draft,
    busy: mutation.isPending,
    onOpenChange: () => {
      discardCount += 1;
      setDraft('');
    },
  });
  const query = useQuery({
    queryKey: ['mode-probe', mode],
    queryFn: async () => {
      reads.push(mode);
      return mode;
    },
  });
  return (
    <>
      <output aria-label="当前模式">{mode}</output>
      <output aria-label="当前路径">
        {location.pathname}
        {location.search}
      </output>
      <output aria-label="读取模式">{query.data}</output>
      <input aria-label="验收草稿" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={() => navigate('/second')}>前往第二页</button>
      <button onClick={() => mutation.mutate()}>受控保存</button>
      <button onClick={() => void changeMode(mode === 'actual' ? 'shadow' : 'actual')}>
        再次请求切换
      </button>
    </>
  );
}
function ModePage() {
  const { mode } = usePortfolioMode();
  return <DraftPage key={mode} />;
}
function Layout() {
  return (
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <NavigationGuardProvider>
          <PortfolioModeProvider>
            <AppShell>
              <ModePage />
            </AppShell>
          </PortfolioModeProvider>
        </NavigationGuardProvider>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
}
async function mount(entries = ['/first?accountId=old-actual&mode=actual&search=保留']) {
  router = createMemoryRouter([{ path: '*', element: <Layout /> }], { initialEntries: entries });
  await act(async () => {
    root.render(<RouterProvider router={router} />);
  });
}
const output = (name: string) => host.querySelector(`output[aria-label="${name}"]`)?.textContent;
const input = () => host.querySelector<HTMLInputElement>('input[aria-label="验收草稿"]')!;
const globalSwitch = () =>
  host.querySelector<HTMLButtonElement>('[aria-label^="全局账户模式"] button[aria-pressed="false"]')!;
async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
async function waitFor(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    check();
  });
}
async function button(text: string) {
  const match = [...document.querySelectorAll('button')].find((e) => e.textContent === text);
  expect(match, text).toBeDefined();
  await click(match!);
}
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  // Router 在 jsdom 中使用 DOM AbortSignal，Node Request 使用另一 realm；
  // 本组不测试 Router Request 取消，业务查询/写入仍使用真实 TanStack 生命周期。
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
  window.localStorage.clear();
  reads = [];
  writes = [];
  discardCount = 0;
  settleWrite = undefined;
  settleRead = undefined;
  feedback.add.mockClear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose();
  client.clear();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('应用全局模式与转换保护', () => {
  it('首次查询前恢复模拟，跨页、重新挂载与旧 URL 都不改模式', async () => {
    window.localStorage.setItem(storageKey, 'shadow');
    await mount();
    expect(reads).toEqual(['shadow']);
    expect(output('当前模式')).toBe('shadow');
    await button('前往第二页');
    expect(output('当前路径')).toBe('/second');
    expect(output('当前模式')).toBe('shadow');
    await act(async () => router.navigate(-1));
    expect(output('当前模式')).toBe('shadow');
    expect(output('当前路径')).toContain('mode=actual');
    expect(reads).not.toContain('actual');
    await act(async () => root.unmount());
    router.dispose();
    client.clear();
    root = createRoot(host);
    await mount(['/second?mode=actual']);
    expect(output('当前模式')).toBe('shadow');
    expect(reads).not.toContain('actual');
  });

  it('取消保留草稿、URL 与记忆，确认一次后清理范围参数而保留筛选', async () => {
    await mount();
    await edit('实际输入不能写进模拟');
    const original = output('当前路径');
    await click(globalSwitch());
    await button('再次请求切换');
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(output('当前模式')).toBe('actual');
    expect(reads).toEqual(['actual']);
    await button('继续编辑');
    expect(input().value).toBe('实际输入不能写进模拟');
    expect(output('当前路径')).toBe(original);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await click(globalSwitch());
    await button('放弃修改并切换');
    expect(output('当前模式')).toBe('shadow');
    expect(input().value).toBe('');
    expect(output('当前路径')).toBe('/first?search=%E4%BF%9D%E7%95%99');
    expect(window.localStorage.getItem(storageKey)).toBe('shadow');
    expect(discardCount).toBe(1);
    expect(writes).toEqual([]);
  });

  it('写入和保存后确认读取在途均锁住模式，失败保留原模式与草稿', async () => {
    await mount();
    await edit('保留');
    await button('受控保存');
    await waitFor(() => expect(globalSwitch().disabled).toBe(true));
    await button('再次请求切换');
    expect(output('当前模式')).toBe('actual');
    await act(async () => {
      settleWrite!('ok');
    });
    expect(globalSwitch().disabled).toBe(true);
    await button('再次请求切换');
    expect(output('当前模式')).toBe('actual');
    await act(async () => {
      settleRead!();
    });
    await waitFor(() => expect(globalSwitch().disabled).toBe(false));
    await button('受控保存');
    await act(async () => {
      settleWrite!('error');
    });
    await waitFor(() => expect(globalSwitch().disabled).toBe(false));
    expect(input().value).toBe('保留');
    expect(output('当前模式')).toBe('actual');
    expect(writes).toEqual(['actual', 'actual']);
  });

  it('确认期间开始写入时不提交模式、不丢弃输入', async () => {
    await mount();
    await edit('确认期间的原稿');
    await click(globalSwitch());
    await act(async () => startWrite!());
    await button('放弃修改并切换');
    expect(output('当前模式')).toBe('actual');
    expect(input().value).toBe('确认期间的原稿');
    expect(discardCount).toBe(0);
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    await act(async () => settleWrite!('error'));
  });

  it('浏览器返回先确认，取消保留位置与输入，确认后不重复询问', async () => {
    await mount(['/previous', '/first?accountId=A']);
    await edit('返回保护');
    await act(async () => router.navigate(-1));
    expect(output('当前路径')).toBe('/first?accountId=A');
    await button('继续编辑');
    expect(input().value).toBe('返回保护');
    await act(async () => router.navigate(-1));
    await button('放弃修改并离开');
    expect(output('当前路径')).toBe('/previous');
    expect(discardCount).toBe(1);
    expect(output('当前模式')).toBe('actual');
  });

  it('记忆失败时当前切换仍有效并明确反馈', async () => {
    await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    await click(globalSwitch());
    expect(output('当前模式')).toBe('shadow');
    expect(feedback.add).toHaveBeenCalledWith(expect.objectContaining({ title: '模式记忆未保存' }));
  });
});
