// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { Toaster } from '../src/components/ui/toast.js';
import { AccountDataPage } from '../src/features/account-data/AccountDataPage.js';
import type { Account } from '../src/features/portfolio/portfolio.types.js';
import { MemoryRouter, useLocation } from 'react-router';

const desktopApi = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => desktopApi.client,
}));

const actualAccount = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '实际证券账户',
  institution: '受控验收',
  type: 'securities',
  mode: 'actual',
  currency: 'CNY',
  active: true,
} as const satisfies Account;

const shadowAccount = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '模拟证券账户',
  institution: '受控验收',
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: true,
} as const satisfies Account;

const secondaryActualAccount = {
  ...actualAccount,
  id: '77777777-7777-4777-8777-777777777777',
  name: '备用实际账户',
} as const satisfies Account;

const directory = { generation: 0, items: [], unresolvedSymbols: [] };

const ledgerResponse = (account: Account, symbol: string) => ({
  accountId: account.id,
  ledgerRevision: '1',
  projectionGeneration: '1',
  events: [
    {
      version: 3,
      eventId:
        account.mode === 'actual'
          ? '33333333-3333-4333-8333-333333333333'
          : '44444444-4444-4444-8444-444444444444',
      factId:
        account.mode === 'actual'
          ? '55555555-5555-4555-8555-555555555555'
          : '66666666-6666-4666-8666-666666666666',
      accountId: account.id,
      ledgerRevision: '1',
      occurredAt: '2026-10-17T02:00:00.000Z',
      timePrecision: 'INSTANT',
      sourceTimezone: 'Asia/Shanghai',
      economicOrderKey: `mode-scope-${account.mode}`,
      recordedAt: '2026-10-17T02:01:00.000Z',
      payloadVersion: 1,
      source: { category: 'MANUAL', channel: 'mode-scope-test', externalId: account.mode },
      actorId: 'controlled-test',
      type: 'BUY_EXECUTION',
      revisionAction: 'CREATE',
      payload: {
        symbol,
        quantity: '1',
        price: '10',
        currency: 'CNY',
        capabilityVerification: 'VERIFIED',
        charges: [],
      },
    },
  ],
  instrumentDirectory: directory,
  effective: true,
});

const auditResponse = (account: Account) => ({
  accountId: account.id,
  asOfLedgerRevision: '1',
  ledgerRevision: '1',
  projectionGeneration: '1',
  events: [],
  instrumentDirectory: directory,
  effective: false,
});

const valuationResponse = (mode: Account['mode']) => ({
  positions: [],
  cashValue: 0,
  cashByAccount: [],
  cashByCurrency: [],
  totalCost: 0,
  totalMarketValue: 0,
  totalPnl: 0,
  unrealizedPnl: 0,
  unrealizedPnlRatio: 0,
  realizedPnl: 0,
  realizedPnlRatio: 0,
  cumulativePnl: 0,
  cumulativePnlRatio: 0,
  partial: false,
  mode,
  valuedAt: '2026-10-17T00:00:00.000Z',
});

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function AccountDataHarness({
  mode,
  accounts,
  initialEntry,
}: {
  mode: Account['mode'];
  accounts: Account[];
  initialEntry: string;
}) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Toaster>
        <ConfirmDialogProvider>
          <AccountDataPage accounts={accounts} mode={mode} />
        </ConfirmDialogProvider>
      </Toaster>
    </MemoryRouter>
  );
}

let host: HTMLDivElement | undefined;
let root: Root | undefined;
let queryClient: QueryClient | undefined;

async function mountAccountData({
  fetcher,
  mode,
  accounts = [actualAccount, shadowAccount],
  initialEntry = `/accounts?accountId=${actualAccount.id}`,
}: {
  fetcher: typeof fetch;
  mode: Account['mode'];
  accounts?: Account[];
  initialEntry?: string;
}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  desktopApi.client = new ThesisLedgerApiClient('http://127.0.0.1:3000/api/v1/', fetcher);

  const render = (nextMode: Account['mode']) =>
    act(async () => {
      root!.render(
        <QueryClientProvider client={queryClient!}>
          <AccountDataHarness mode={nextMode} accounts={accounts} initialEntry={initialEntry} />
        </QueryClientProvider>,
      );
    });

  await render(mode);
  return { render };
}

async function waitFor(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    check();
  });
}

async function clickButton(label: string) {
  const button = [...(host?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

const apiPath = (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return { path: url.pathname.replace('/api/v1', ''), url };
};

const defaultControlledFetch = (requests: URL[]) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const { path, url } = apiPath(input);
    requests.push(url);
    if (path.startsWith('/ledger/') && path.endsWith('/events')) {
      const accountId = path.split('/')[2];
      const account = [actualAccount, shadowAccount, secondaryActualAccount].find(
        (candidate) => candidate.id === accountId,
      );
      return jsonResponse(
        ledgerResponse(account ?? actualAccount, `${account?.mode ?? 'unknown'}-only`),
      );
    }
    if (path === '/portfolio/valuation') {
      return jsonResponse(
        valuationResponse(url.searchParams.get('mode') === 'shadow' ? 'shadow' : 'actual'),
      );
    }
    if (path === '/accounts') return jsonResponse([]);
    throw new Error(`未设置受控 API 响应：${path}`);
  }) as typeof fetch;

beforeEach(() => {
  window.sessionStorage.clear();
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
});

afterEach(async () => {
  await act(async () => root?.unmount());
  queryClient?.clear();
  host?.remove();
  vi.unstubAllGlobals();
  desktopApi.client = undefined;
  root = undefined;
  host = undefined;
  queryClient = undefined;
});

describe('账户数据页全局模式账户范围', () => {
  it('切换模式后立即消费新模式账户，隔离pending/503并恢复，返回时使用另一模式的记忆', async () => {
    const requests: URL[] = [];
    const shadowLedgerPending = deferred<Response>();
    let shadowLedgerAttempts = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const { path, url } = apiPath(input);
      requests.push(url);
      if (path === `/ledger/${actualAccount.id}/events`)
        return jsonResponse(ledgerResponse(actualAccount, 'ACTUAL-ONLY'));
      if (path === `/ledger/${secondaryActualAccount.id}/events`)
        return jsonResponse(ledgerResponse(secondaryActualAccount, 'ACTUAL-ONLY'));
      if (path === `/ledger/${shadowAccount.id}/events`) {
        shadowLedgerAttempts += 1;
        if (shadowLedgerAttempts === 1) return shadowLedgerPending.promise;
        return jsonResponse(ledgerResponse(shadowAccount, 'SHADOW-ONLY'));
      }
      if (path === '/portfolio/valuation') {
        const mode = url.searchParams.get('mode') === 'shadow' ? 'shadow' : 'actual';
        return jsonResponse(valuationResponse(mode));
      }
      if (path === '/accounts') return jsonResponse([]);
      throw new Error(`未设置受控 API 响应：${path}`);
    }) as typeof fetch;

    const view = await mountAccountData({
      fetcher,
      mode: 'actual',
      accounts: [actualAccount, shadowAccount, secondaryActualAccount],
      initialEntry: `/accounts?mode=shadow&accountId=${secondaryActualAccount.id}`,
    });

    await waitFor(() => expect(host?.textContent).toContain('ACTUAL-ONLY'));
    expect(host?.textContent).toContain('备用实际账户 · 证券 · CNY · 实际');

    const requestsBeforeModeChange = requests.length;
    await view.render('shadow');

    await waitFor(() => expect(host?.textContent).toContain('模拟证券账户 · 证券 · CNY · 模拟'));
    expect(host?.textContent).not.toContain('实际证券账户 · 证券 · CNY · 实际');
    expect(host?.textContent).not.toContain('ACTUAL-ONLY');
    await waitFor(() => expect(shadowLedgerAttempts).toBe(1));
    const requestsAfterModeChange = requests.slice(requestsBeforeModeChange);
    const modeValuationRequests = requestsAfterModeChange.filter((url) =>
      url.pathname.endsWith('/portfolio/valuation'),
    );
    expect(modeValuationRequests.length).toBeGreaterThan(0);
    expect(
      modeValuationRequests.every(
        (url) =>
          url.searchParams.get('mode') === 'shadow' &&
          url.searchParams.get('accountId') === shadowAccount.id,
      ),
    ).toBe(true);
    expect(
      requestsAfterModeChange.some(
        (url) => url.pathname === `/api/v1/ledger/${secondaryActualAccount.id}/events`,
      ),
    ).toBe(false);
    expect(host?.querySelector('[data-testid="location-search"]')?.textContent).toContain(
      `accountId=${shadowAccount.id}`,
    );
    expect(host?.querySelector('[data-testid="location-search"]')?.textContent).toContain(
      'mode=shadow',
    );

    await act(async () => shadowLedgerPending.resolve(jsonResponse({ error: 'unavailable' }, 503)));
    await waitFor(() => expect(host?.textContent).toContain('当前成交列表未更新'));
    expect(host?.textContent).not.toContain('ACTUAL-ONLY');

    await clickButton('重新加载');
    await waitFor(() => expect(host?.textContent).toContain('SHADOW-ONLY'));
    expect(host?.textContent).not.toContain('ACTUAL-ONLY');

    await view.render('actual');
    await waitFor(() => expect(host?.textContent).toContain('备用实际账户 · 证券 · CNY · 实际'));
    expect(host?.textContent).toContain('ACTUAL-ONLY');
    expect(host?.textContent).not.toContain('SHADOW-ONLY');
  });

  it('忽略 URL 中的旧mode参数，全部账户估值仍使用注入的当前模式', async () => {
    const requests: URL[] = [];
    const fetcher = defaultControlledFetch(requests);
    await mountAccountData({
      fetcher,
      mode: 'shadow',
      initialEntry: '/accounts?mode=actual&accountId=all',
    });

    await waitFor(() => expect(host?.textContent).toContain('全部账户'));
    const valuationRequests = requests.filter((url) =>
      url.pathname.endsWith('/portfolio/valuation'),
    );
    expect(valuationRequests).toHaveLength(1);
    expect(valuationRequests[0]?.searchParams.get('mode')).toBe('shadow');
    expect(valuationRequests[0]?.searchParams.has('accountId')).toBe(false);
    expect(host?.querySelector('[data-testid="location-search"]')?.textContent).toContain(
      'mode=actual',
    );
    expect(host?.textContent).not.toContain('实际证券账户 · 证券 · CNY · 实际');
  });

  it('模式切换后不让旧审核目标触发新账户审核查询或继续显示旧浮层', async () => {
    const requests: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const { path, url } = apiPath(input);
      requests.push(url);
      if (path.endsWith('/events/audit')) {
        const accountId = path.split('/')[2];
        const account = accountId === shadowAccount.id ? shadowAccount : actualAccount;
        return jsonResponse(auditResponse(account));
      }
      if (path === `/ledger/${actualAccount.id}/events`)
        return jsonResponse(ledgerResponse(actualAccount, 'ACTUAL-ONLY'));
      if (path === `/ledger/${shadowAccount.id}/events`)
        return jsonResponse(ledgerResponse(shadowAccount, 'SHADOW-ONLY'));
      if (path === '/portfolio/valuation') {
        const mode = url.searchParams.get('mode') === 'shadow' ? 'shadow' : 'actual';
        return jsonResponse(valuationResponse(mode));
      }
      if (path === '/accounts') return jsonResponse([]);
      throw new Error(`未设置受控 API 响应：${path}`);
    }) as typeof fetch;

    const view = await mountAccountData({ fetcher, mode: 'actual' });
    await waitFor(() => expect(host?.textContent).toContain('ACTUAL-ONLY'));
    await clickButton('查看修正链');
    await waitFor(() =>
      expect(
        requests.some((url) => url.pathname === `/api/v1/ledger/${actualAccount.id}/events/audit`),
      ).toBe(true),
    );
    await waitFor(() => expect(document.body.textContent).toContain('成交修正链'));

    await view.render('shadow');
    await waitFor(() => expect(host?.textContent).toContain('模拟证券账户 · 证券 · CNY · 模拟'));
    await act(async () => new Promise((done) => setTimeout(done, 0)));

    const shadowAuditRequested = requests.some(
      (url) => url.pathname === `/api/v1/ledger/${shadowAccount.id}/events/audit`,
    );
    const staleAuditSheetVisible = document.body.textContent?.includes('成交修正链') ?? false;
    expect({ shadowAuditRequested, staleAuditSheetVisible }).toEqual({
      shadowAuditRequested: false,
      staleAuditSheetVisible: false,
    });
  });

  it('当前模式没有账户时显示该模式空态且不请求另一模式账本或估值', async () => {
    const requests: URL[] = [];
    const fetcher = defaultControlledFetch(requests);
    await mountAccountData({
      fetcher,
      mode: 'shadow',
      accounts: [actualAccount],
      initialEntry: `/accounts?mode=actual&accountId=${actualAccount.id}`,
    });

    await waitFor(() =>
      expect(host?.textContent).toContain('先创建一个账户，再录入成交、持仓或现金。'),
    );
    expect(requests.some((url) => url.pathname.endsWith('/portfolio/valuation'))).toBe(false);
    expect(requests.some((url) => /\/ledger\/[^/]+\/events$/.test(url.pathname))).toBe(false);
  });
});
