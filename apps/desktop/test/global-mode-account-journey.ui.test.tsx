// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { AppShell } from '../src/app/AppShell.js';
import { AppRoutes } from '../src/app/routes.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import { PortfolioModeProvider } from '../src/features/portfolio/portfolio-mode-context.js';

const toast = vi.hoisted(() => ({ add: vi.fn() }));
const desktopApi = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../src/shared/api/client', () => ({ getDesktopApiClient: () => desktopApi.client }));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => toast }));
vi.mock('../src/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../src/components/market-color-menu', () => ({ MarketColorMenu: () => null }));
const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const initialAccounts = [
  { id: A1, name: '实际一', institution: null, mode: 'actual', type: 'securities', currency: 'CNY', active: true },
  { id: A2, name: '实际二', institution: null, mode: 'actual', type: 'securities', currency: 'CNY', active: true },
  { id: B, name: '模拟一', institution: null, mode: 'shadow', type: 'securities', currency: 'CNY', active: true },
];
let accounts: typeof initialAccounts;
let requests: Array<{ method: string; url: URL; body?: unknown }>;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const NativeRequest = globalThis.Request;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
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
  window.localStorage.clear();
  window.sessionStorage.clear();
  accounts = structuredClone(initialAccounts);
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, url, ...(body ? { body } : {}) });
      if (url.pathname.endsWith('/accounts') && method === 'POST') {
        const account = { ...body, institution: body.institution ?? null, id: C, active: true };
        accounts.push(account);
        return json(account);
      }
      if (url.pathname.endsWith('/accounts') && method === 'GET') return json(accounts);
      if (
        method === 'GET' &&
        ['/backtests/strategies', '/backtests/runs'].some((path) => url.pathname.endsWith(path))
      )
        return json([]);
      if (url.pathname.endsWith('/strategy-optimization/experiments') && method === 'GET')
        return json({
          items: [
            {
              id: 'experiment-1',
              name: '独立实验',
              nameSource: 'stored',
              sourceMode: 'discovery',
              baselineStrategyVersionId: 'version-1',
              status: 'running',
              stage: 'evaluating',
              objective: {},
              split: {},
              modelConfig: [],
              aiCallsUsed: 0,
              backtestRunsUsed: 0,
              inputTokensUsed: 0,
              outputTokensUsed: 0,
              costUsed: null,
              costSummary: {},
              tradingCost: {},
              createdAt: '2026-10-18T00:00:00Z',
              updatedAt: '2026-10-18T00:00:00Z',
            },
          ],
          totalCount: 1,
          pageInfo: { hasNextPage: false, nextCursor: null },
        });
      if (url.pathname.endsWith('/valuation') && method === 'GET')
        return json({
          positions: [],
          totalCost: 0,
          totalMarketValue: 0,
          totalPnl: 0,
          cashValue: 0,
          cashByAccount: [],
          cashByCurrency: [],
          partial: false,
          baseCurrency: 'CNY',
          mode: url.searchParams.get('mode'),
          valuedAt: '2026-10-18T00:00:00Z',
        });
      const ledger = url.pathname.match(/\/ledger\/([^/]+)\/events$/);
      if (ledger && method === 'GET')
        return json({
          accountId: ledger[1],
          ledgerRevision: '1',
          projectionGeneration: '1',
          events: [],
          instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
          effective: true,
        });
      throw new Error(`本组不允许的请求 ${method} ${url.pathname}`);
    }),
  );
  desktopApi.client = new ThesisLedgerApiClient('http://localhost/api/v1/', (input, init) =>
    fetch(input, init),
  );
});
afterEach(async () => {
  await act(async () => root?.unmount());
  router?.dispose();
  client?.clear();
  host?.remove();
  vi.unstubAllGlobals();
});
async function mount(mode: 'actual' | 'shadow' = 'actual') {
  window.localStorage.setItem('thesis-ledger-portfolio-mode', mode);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const element = (
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <NavigationGuardProvider>
          <PortfolioModeProvider>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </PortfolioModeProvider>
        </NavigationGuardProvider>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
  router = createMemoryRouter([{ path: '*', element }], {
    initialEntries: [`/accounts?accountId=${A1}`],
  });
  await act(async () => root.render(<RouterProvider router={router} />));
}
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    check();
  });
}
async function click(e: Element) {
  await act(async () => {
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
const selected = () => document.querySelector('#account-data-account')?.textContent ?? '';
const modeSwitch = () =>
  host.querySelector<HTMLButtonElement>('[aria-label^="全局账户模式"] button[aria-pressed="false"]')!;
async function button(text: string) {
  const e = [...document.querySelectorAll('button')].find((e) => e.textContent?.trim() === text);
  expect(e, text).toBeDefined();
  await click(e!);
}
async function navigateLink(text: string) {
  const e = [...host.querySelectorAll('a')].find((e) => e.getAttribute('aria-label') === text);
  expect(e).toBeDefined();
  await click(e!);
}

describe('真实路由的全局模式与账户往返', () => {
  it('模式切换保留独立实验的改名输入，不粗粒度重建整个策略中心', async () => {
    await mount();
    await act(async () => router.navigate('/strategy/experiments'));
    await wait(() => expect(document.querySelector('[aria-label="管理 独立实验"]')).not.toBeNull());
    await click(document.querySelector('[aria-label="管理 独立实验"]')!);
    await wait(() => expect(document.querySelector('[role="menuitem"]')).not.toBeNull());
    await click(
      [...document.querySelectorAll('[role="menuitem"]')].find((e) =>
        e.textContent?.includes('修改名称'),
      )!,
    );
    const input = document.querySelector<HTMLInputElement>('[aria-label="新的实验名称"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '共享名称草稿',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(modeSwitch());
    await wait(() => expect(modeSwitch().closest('[aria-label^="全局账户模式"]')?.getAttribute('aria-label')).toContain('当前模拟'));
    expect(document.querySelector<HTMLInputElement>('[aria-label="新的实验名称"]')?.value).toBe(
      '共享名称草稿',
    );
    expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
  });
  it('账户选择、跨页返回、跨模式历史和分别恢复不产生错误范围读取', async () => {
    await mount();
    await wait(() => expect(selected()).toContain('实际一'));
    await click(document.querySelector('#account-data-account')!);
    await wait(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(3));
    const option = [...document.querySelectorAll('[role="option"]')].find((e) =>
      e.textContent?.includes('实际二'),
    )!;
    await act(async () => {
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      (option as HTMLElement).click();
    });
    await wait(() =>
      expect({
        selected: selected(),
        url: router.state.location.search,
        dialog: document.querySelector('[role="alertdialog"]')?.textContent,
      }).toMatchObject({ selected: expect.stringContaining('实际二') }),
    );
    await navigateLink('投资组合');
    await navigateLink('账户数据');
    await wait(() => expect(selected()).toContain('实际二'));
    await click(modeSwitch());
    await wait(() => expect(selected()).toContain('模拟一'));
    const marker = requests.length;
    await navigateLink('投资组合');
    for (let step = 0; step < 3; step++) await act(async () => router.navigate(-1));
    await wait(() => expect(selected()).toContain('模拟一'));
    expect(modeSwitch().closest('[aria-label^="全局账户模式"]')?.getAttribute('aria-label')).toContain('当前模拟');
    expect(
      requests.slice(marker).filter((r) => /\/ledger\/(111|222)/.test(r.url.pathname)),
    ).toEqual([]);
    expect(document.body.textContent).toContain('链接与当前账户范围不同');
    await act(async () => router.navigate(1));
    await act(async () => router.navigate(1));
    await wait(() => expect(selected()).toContain('模拟一'));
    await click(modeSwitch());
    await wait(() => expect(selected()).toContain('实际二'));
    expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('新账户只读继承模拟且提交契约为模拟，没有局部模式选择器', async () => {
    await mount('shadow');
    await wait(() => expect(selected()).toContain('模拟一'));
    await button('管理账户');
    await button('创建账户');
    await wait(() => expect(document.querySelector('#account-name')).not.toBeNull());
    const mode = document.querySelector<HTMLInputElement>('#account-mode')!;
    expect(mode.readOnly).toBe(true);
    expect(mode.value).toBe('模拟账户');
    expect(document.querySelector('button#account-mode')).toBeNull();
    const name = document.querySelector<HTMLInputElement>('#account-name')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        name,
        '受控模拟新账户',
      );
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      name.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await wait(() => expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1));
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      name: '受控模拟新账户',
      mode: 'shadow',
    });
    expect(modeSwitch().closest('[aria-label^="全局账户模式"]')?.getAttribute('aria-label')).toContain('当前模拟');
  });
});
