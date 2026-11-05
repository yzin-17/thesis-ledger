// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../src/features/portfolio/portfolio.types.js';
import { AccountDataPage } from '../src/features/account-data/AccountDataPage.js';
import { accountDataKeys } from '../src/features/account-data/account-data.queries.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';
import { Toaster } from '../src/components/ui/toast.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import type * as ConfirmDialogModule from '../src/components/ui/confirm-dialog';

const NativeRequest = globalThis.Request;
const api = vi.hoisted(() => ({
  plans: vi.fn(),
  occurrences: vi.fn(),
  confirm: vi.fn(),
  create: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  end: vi.fn(),
}));
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({
    fundInvestments: {
      getPlans: api.plans,
      getOccurrences: api.occurrences,
      createPlan: api.create,
      pausePlan: api.pause,
      resumePlan: api.resume,
      endPlan: api.end,
    },
  }),
}));
vi.mock('../src/components/ui/confirm-dialog', async (original) => ({
  ...(await original<typeof ConfirmDialogModule>()),
  useConfirmDialog: () => ({ confirm: api.confirm }),
}));

const account: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '基金账户',
  type: 'fund',
  mode: 'actual',
  currency: 'CNY',
  active: true,
};
const plan = {
  id: '22222222-2222-4222-8222-222222222222',
  accountId: account.id,
  name: '每月成长定投',
  symbol: '000001.OF',
  fundName: '华夏成长混合',
  expectedAmount: '100',
  currency: 'CNY',
  dayOfMonth: 1,
  timezone: 'Asia/Shanghai',
  startPeriod: '2026-10',
  status: 'ENDED',
  nextDueAt: null,
  version: 1,
  pausedAt: null,
  endedAt: '2026-11-01T00:00:00Z',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};
const occurrence = {
  id: '33333333-3333-4333-8333-333333333333',
  planId: plan.id,
  accountId: account.id,
  status: 'CONFIRMED',
  periodKey: '2026-10',
  symbol: plan.symbol,
  fundName: plan.fundName,
};
const ledgerEvent = {
  version: 3,
  eventId: '44444444-4444-4444-8444-444444444444',
  factId: '55555555-5555-4555-8555-555555555555',
  accountId: account.id,
  ledgerRevision: '1',
  occurredAt: '2026-10-23',
  recordedAt: '2026-10-24T00:00:00Z',
  timePrecision: 'DATE',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'investment',
  payloadVersion: 1,
  type: 'BUY_EXECUTION',
  revisionAction: 'CREATE',
  actorId: 'fixture',
  source: {
    category: 'MANUAL',
    channel: 'recurring-fund-investment',
    externalId: `fund-investment-occurrence:${occurrence.id}`,
  },
  payload: {
    symbol: plan.symbol,
    quantity: '80',
    price: '1.25',
    currency: 'CNY',
    capabilityVerification: 'VERIFIED',
    charges: [],
  },
};
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;

async function mount(tab = 'transactions', scope: Account = account, focus?: string) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  for (const filter of ['executions', 'other', 'all'] as const)
    client.setQueryData(accountDataKeys.events(scope.id, scope.mode, filter), {
      accountId: scope.id,
      ledgerRevision: '1',
      projectionGeneration: '1',
      effective: true,
      events: [{ ...ledgerEvent, accountId: scope.id }],
      instrumentDirectory: {
        generation: 1,
        items: [{ symbol: plan.symbol, displayName: plan.fundName }],
        unresolvedSymbols: [],
      },
    });
  client.setQueryData(portfolioKeys.valuation(scope.mode, scope.id), {
    positions: [],
    cashValue: 0,
    cashByAccount: [],
    cashByCurrency: [],
    totalMarketValue: 0,
    totalCost: 0,
    totalPnl: 0,
    partial: false,
    mode: scope.mode,
    valuedAt: '2026-11-05T00:00:00Z',
  });
  router = createMemoryRouter(
    [
      {
        path: '/accounts',
        element: (
          <Toaster>
            <NavigationGuardProvider>
              <AccountDataPage accounts={[scope]} mode={scope.mode} />
            </NavigationGuardProvider>
          </Toaster>
        ),
      },
    ],
    {
      initialEntries: [
        `/accounts?accountId=${scope.id}&tab=${tab}${focus ? `&fundOccurrence=${focus}` : ''}`,
      ],
    },
  );
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
  await settle();
}
const activeTab = () => host.querySelector('[role=tab][aria-selected=true]')?.textContent;

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, { ...init, signal: undefined });
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('布局测试禁止未配置的网络请求');
    }),
  );
  api.plans.mockResolvedValue([plan]);
  api.occurrences.mockResolvedValue([occurrence]);
  api.confirm.mockResolvedValue(true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  router?.dispose();
  client?.clear();
  host?.remove();
  vi.unstubAllGlobals();
});

describe('账户定投页签与成交来源', () => {
  it('成交页没有定投查询与重复标题，来源进入对应已结束计划，前后导航保留页签', async () => {
    await mount();
    expect([...host.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual([
      '持仓',
      '成交记录',
      '现金',
      '定投计划',
    ]);
    expect(host.querySelectorAll('h2')).toHaveLength(0);
    expect(host.textContent).toContain('买入 80 份 · 单位净值 ¥1.25');
    expect(host.textContent).toContain('成交金额');
    expect(host.textContent).not.toContain('recurring-fund-investment');
    expect(api.plans).not.toHaveBeenCalled();
    expect(api.occurrences).not.toHaveBeenCalled();
    await click('查看定投计划');
    expect(activeTab()).toBe('定投计划');
    expect(router.state.location.search).toContain(`fundOccurrence=${occurrence.id}`);
    expect(api.plans).toHaveBeenCalledWith({ accountId: account.id });
    expect(host.querySelector('details')?.open).toBe(true);
    expect(host.querySelector('[aria-current=true]')?.textContent).toContain(plan.name);
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(activeTab()).toBe('成交记录');
    await act(async () => {
      await router.navigate(1);
    });
    await settle();
    expect(activeTab()).toBe('定投计划');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('直接打开定投地址时空态紧凑，已结束计划默认收起且可展开', async () => {
    await mount('fund-investments');
    expect(activeTab()).toBe('定投计划');
    expect(host.textContent?.match(/暂无待确认成交/g)).toHaveLength(1);
    expect(host.textContent).not.toContain('0 条');
    const details = host.querySelector('details')!;
    expect(details.open).toBe(false);
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(details.open).toBe(true);
    expect(details.textContent).toContain(plan.name);
    expect(details.querySelector('button')).toBeNull();
  });

  it.each([{ type: 'securities' as const }, { mode: 'shadow' as const }, { active: false }])(
    '不支持的账户 %j 对定投深链回退且不启用查询',
    async (extra) => {
      await mount('fund-investments', { ...account, ...extra });
      expect(activeTab()).toBe('成交记录');
      expect(
        [...host.querySelectorAll('[role=tab]')].some((t) => t.textContent === '定投计划'),
      ).toBe(false);
      expect(api.plans).not.toHaveBeenCalled();
      expect(api.occurrences).not.toHaveBeenCalled();
    },
  );

  it('定投草稿阻止页签切换，保留修改后允许用户明确放弃', async () => {
    await mount('fund-investments');
    await click('新建定投');
    const input = document.querySelector<HTMLInputElement>('#fund-plan-name')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '未保存计划',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    api.confirm.mockResolvedValueOnce(false);
    await click('成交记录');
    expect(activeTab()).toBe('定投计划');
    expect(input.value).toBe('未保存计划');
    expect(api.confirm).toHaveBeenCalled();
    await click('成交记录');
    expect(activeTab()).toBe('成交记录');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('未知来源记录明确显示无法定位，不默认选择其他计划', async () => {
    await mount('fund-investments', account, 'unknown');
    expect(host.textContent).toContain('无法定位对应计划');
    expect(host.querySelector('[aria-current=true]')).toBeNull();
  });

  it('作废只在更多菜单中出现，选择后仍进入原有确认流程', async () => {
    await mount();
    expect(
      [...document.querySelectorAll('button')].some((button) => button.textContent === '作废'),
    ).toBe(false);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label^="更多操作："]')!.click(),
    );
    const items = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')];
    expect(items.map((item) => item.textContent)).toEqual(['查看历史', '作废']);
    await act(async () => items.find((item) => item.textContent === '作废')!.click());
    expect(document.body.textContent).toContain('作废成交');
    expect(document.body.textContent).toContain('确认作废');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('当前计划的暂停、恢复和结束沿用版本条件并重读分组', async () => {
    const active = {
      ...plan,
      id: '66666666-6666-4666-8666-666666666666',
      name: '当前定投',
      status: 'ACTIVE',
      endedAt: null,
    };
    api.plans.mockResolvedValue([active, plan]);
    await mount('fund-investments');
    const rowButton = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>(`#fund-plan-${active.id} button`)].find(
        (button) => button.textContent === label,
      )!;
    const waitForButton = async (label: string) =>
      vi.waitFor(async () => {
        await settle();
        expect(rowButton(label)).toBeDefined();
      });
    const paused = { ...active, status: 'PAUSED', version: 2 };
    api.pause.mockResolvedValue(paused);
    api.plans.mockResolvedValue([paused, plan]);
    await act(async () => rowButton('暂停').click());
    await waitForButton('恢复');
    expect(api.pause).toHaveBeenCalledWith(active.id, 1);
    const resumed = { ...active, version: 3 };
    api.resume.mockResolvedValue(resumed);
    api.plans.mockResolvedValue([resumed, plan]);
    await act(async () => rowButton('恢复').click());
    await waitForButton('暂停');
    expect(api.resume).toHaveBeenCalledWith(active.id, 2);
    const ended = { ...active, status: 'ENDED', version: 4, endedAt: plan.endedAt };
    api.end.mockResolvedValue(ended);
    api.plans.mockResolvedValue([ended, plan]);
    await act(async () => rowButton('结束').click());
    await vi.waitFor(async () => {
      await settle();
      expect(host.querySelector('[aria-label="当前定投计划"]')).toBeNull();
    });
    expect(api.end).toHaveBeenCalledWith(active.id, 3);
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('summary')?.textContent).toContain('2 个');
  });
});
