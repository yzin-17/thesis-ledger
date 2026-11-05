// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/app/routes.js';
import { AppShell } from '../src/app/AppShell.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { NavigationGuardProvider } from '../src/features/shared/navigation-guard.js';
import { PortfolioModeProvider } from '../src/features/portfolio/portfolio-mode-context.js';
import type { Account, PortfolioMode } from '../src/features/portfolio/portfolio.types.js';
import type * as PortfolioApi from '../src/features/portfolio/portfolio.api.js';
import type * as PerformanceApi from '../src/features/performance/performance.api.js';
import type * as TradeApi from '../src/features/portfolio/portfolio-trade.api.js';

const calls = vi.hoisted(() => ({
  accounts: vi.fn(),
  valuation: vi.fn(),
  summary: vi.fn(),
  save: vi.fn(),
  pnl: vi.fn(),
  trades: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: calls.toast }) }));
vi.mock('../src/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../src/components/market-color-menu', () => ({ MarketColorMenu: () => null }));
vi.mock('../src/features/onboarding/onboarding.queries.js', () => ({
  useOnboardingStatusQuery: () => ({ data: { hasProviderSetup: true, hasRiskRule: true } }),
}));
vi.mock('../src/shared/api/client.js', () => ({
  getDesktopApiClient: () => ({ performance: { getPnlSeries: calls.pnl } }),
}));
vi.mock('../src/features/portfolio/portfolio.api.js', async (original) => ({
  ...(await original<typeof PortfolioApi>()),
  fetchAccounts: calls.accounts,
  fetchManagedAccounts: async () => accounts,
  fetchPortfolioValuation: calls.valuation,
}));
vi.mock('../src/features/portfolio/portfolio-trade.api.js', async (original) => ({
  ...(await original<typeof TradeApi>()),
  fetchPortfolioTrades: calls.trades,
  fetchPortfolioTradeInstruments: async () => ({ items: [] }),
}));
vi.mock('../src/features/performance/performance.api.js', async (original) => ({
  ...(await original<typeof PerformanceApi>()),
  fetchPerformanceHistory: async () =>
    [1, 2].map((day) => ({
      id: `s${day}`,
      capturedAt: `2026-11-0${day}T00:00:00Z`,
      marketValue: 100,
      costValue: 80,
      cashValue: 0,
      partial: false,
      missingSymbols: [],
      currency: 'CNY',
    })),
  fetchPerformanceSeries: async () => ({
    range: '1Y',
    interval: '1d',
    currency: 'CNY',
    availableIntervals: ['1d'],
    defaultInterval: '1d',
    points: [],
    dataQuality: 'COMPLETE',
  }),
  fetchPerformanceSummary: calls.summary,
  fetchPerformanceLayers: async (_mode: PortfolioMode, id?: string) => ({
    security: [
      {
        accountId: id ?? 'a',
        symbol: '600000.SH',
        assetType: 'stock',
        costValue: 80,
        marketValue: 100,
      },
    ],
    account: [
      {
        accountId: id ?? 'a',
        marketValue: 100,
        costValue: 80,
        cashValue: 0,
        partial: false,
        currency: 'CNY',
      },
    ],
    portfolio: { marketValue: 100, costValue: 80, cashValue: 0, partial: false, currency: 'CNY' },
    byCurrency: [],
    valuedAt: '2026-11-05T00:00:00Z',
    dataQuality: { partial: false, missingSymbols: [] },
  }),
  fetchPerformanceTargets: async () => ({
    targets: { stock: 0.6, fund: 0.4 },
    version: 1,
    scope: 'account',
  }),
  fetchPerformanceAllocation: async () => ({
    allocation: [{ category: 'stock', value: 100, weight: 1 }],
    rebalance: [],
    partial: false,
    missingSymbols: [],
  }),
  savePerformanceTargets: calls.save,
}));

const accounts: Account[] = [
  { id: 'a', name: '实际甲', type: 'securities', mode: 'actual', currency: 'CNY' },
  { id: 'b', name: '实际乙', type: 'securities', mode: 'actual', currency: 'USD' },
  { id: 's', name: '模拟甲', type: 'securities', mode: 'shadow', currency: 'CNY' },
];
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
const NativeRequest = globalThis.Request;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
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
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
  localStorage.clear();
  calls.accounts.mockResolvedValue(accounts);
  calls.valuation.mockImplementation(async (mode: PortfolioMode, id?: string) => ({
    mode,
    baseCurrency: 'CNY',
    positions: [],
    totalMarketValue: id === 'b' ? 200 : 100,
    totalCost: 80,
    totalPnl: 20,
    cashValue: 100,
    partial: false,
    cumulativePnl: 20,
    realizedPnl: 20,
    valuedAt: '2026-11-05T00:00:00Z',
  }));
  calls.summary.mockImplementation(async (mode: PortfolioMode) => ({
    ttwror: mode === 'actual' ? 0.2 : 0.1,
    xirr: 0.1,
  }));
  calls.pnl.mockResolvedValue({ points: [], truncated: false });
  calls.save.mockResolvedValue(undefined);
  calls.trades.mockResolvedValue({ items: [], nextCursor: null });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  router?.dispose();
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function mount(url: string) {
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
  router = createMemoryRouter([{ path: '*', element }], { initialEntries: [url] });
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await Promise.resolve();
  });
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function click(text: string, selector = 'button') {
  let button: HTMLElement | undefined;
  await vi.waitFor(async () => {
    await settle();
    button = [...document.querySelectorAll<HTMLElement>(selector)].find(
      (el) => el.textContent?.trim() === text,
    );
    expect(button, text).toBeDefined();
  });
  await act(async () => {
    button!.click();
    await Promise.resolve();
  });
  await settle();
}
async function fill(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}
const params = () => new URLSearchParams(router.state.location.search);
async function chooseAccount(name: string) {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="收益账户范围"]')!;
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
  await settle();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((el) =>
    el.textContent?.includes(name),
  )!;
  expect(option).toBeDefined();
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option.dispatchEvent(down);
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
    await Promise.resolve();
  });
  await settle();
}

describe('收益分析统一工作区的真实路由', () => {
  it('单账户链接等待账户列表校验后才读取该账户', async () => {
    let finish!: (value: Account[]) => void;
    calls.accounts.mockReturnValueOnce(
      new Promise<Account[]>((resolve) => {
        finish = resolve;
      }),
    );
    await mount('/performance?accountId=a&tab=analysis');
    expect(calls.valuation).not.toHaveBeenCalled();
    expect(calls.summary).not.toHaveBeenCalled();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    await act(async () => {
      finish(accounts);
      await Promise.resolve();
    });
    await vi.waitFor(async () => {
      await settle();
      expect(calls.summary).toHaveBeenCalledWith('actual', 'a', expect.any(Object));
    });
    expect(calls.summary.mock.calls.every(([, id]) => id === 'a')).toBe(true);
  });
  it('旧地址保留账户与页签跳转，侧栏只有一个入口，交易不读取概览估值', async () => {
    await mount('/portfolio?accountId=a&tab=trades');
    expect(router.state.location.pathname).toBe('/performance');
    expect(params().get('accountId')).toBe('a');
    expect(params().get('tab')).toBe('trades');
    expect(
      [...host.querySelectorAll('nav a')].filter(
        (a) => a.getAttribute('aria-label') === '收益分析',
      ),
    ).toHaveLength(1);
    expect(host.querySelector('nav a[aria-label="投资组合"]')).toBeNull();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(host.querySelectorAll('button[aria-label="收益账户范围"]')).toHaveLength(1);
    expect(calls.trades).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'a', mode: 'actual' }),
    );
    expect(calls.valuation).not.toHaveBeenCalled();
    await click('组合概览', '[role="tab"]');
    expect(calls.valuation).toHaveBeenCalledWith('actual', 'a', undefined);
    expect(host.textContent).toContain('已实现盈亏');
    expect(host.textContent).not.toContain('累计盈亏走势');
  });
  it('四页签共享账户、同图保留两类口径，前进后退恢复范围', async () => {
    await mount('/performance?accountId=a');
    await click('收益分析', '[role="tab"]');
    expect(calls.summary).toHaveBeenCalledWith('actual', 'a', expect.any(Object));
    expect(host.textContent).toContain('时间加权收益率');
    expect(host.textContent).not.toContain('配置与目标');
    expect(host.textContent).toContain('资产总值与累计盈亏');
    expect(host.querySelector('[aria-label="走势指标"]')).toBeNull();
    expect(calls.pnl).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'a', mode: 'actual' }),
      expect.any(AbortSignal),
    );
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="刷新组合数据"]')!.click();
      await Promise.resolve();
    });
    await vi.waitFor(async () => {
      await settle();
      expect(calls.pnl).toHaveBeenCalledTimes(2);
    });
    await click('配置目标', '[role="tab"]');
    expect(host.textContent).toContain('配置与目标');
    expect(host.textContent).not.toContain('时间加权收益率');
    await chooseAccount('实际乙');
    expect(params().get('accountId')).toBe('b');
    await click('组合概览', '[role="tab"]');
    expect(params().get('accountId')).toBe('b');
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(params().get('tab')).toBe('allocation');
    expect(params().get('accountId')).toBe('b');
    await act(async () => {
      await router.navigate(-1);
    });
    await settle();
    expect(params().get('accountId')).toBe('a');
    expect(host.querySelector('[aria-label="收益账户范围"]')?.textContent).toContain('实际甲');
  });
  it('全局模式切换清除旧账户，不以旧范围请求模拟收益', async () => {
    await mount('/performance?accountId=a&tab=analysis');
    await click('模拟');
    expect(params().has('accountId')).toBe(false);
    expect(params().get('tab')).toBe('analysis');
    expect(calls.summary.mock.calls.some(([mode, id]) => mode === 'shadow' && id === 'a')).toBe(
      false,
    );
    expect(calls.summary).toHaveBeenCalledWith('shadow', undefined, expect.any(Object));
    expect(host.textContent).toContain('全部账户');
  });
  it('账户和换算控件位于页签外，跨四页签保留选择且不增加概览或交易请求', async () => {
    await mount('/performance');
    const merge = host.querySelector<HTMLButtonElement>('button[aria-label="汇率合并"]')!;
    expect(merge).not.toBeNull();
    expect(merge.closest('[role="tabpanel"]')).toBeNull();
    expect(calls.summary).not.toHaveBeenCalled();
    await act(async () => {
      merge.click();
      await Promise.resolve();
    });
    expect(merge.getAttribute('aria-checked')).toBe('true');
    await click('收益分析', '[role="tab"]');
    expect(calls.summary).toHaveBeenLastCalledWith('actual', undefined, {
      fxMerge: true,
      baseCurrency: 'CNY',
    });
    await click('配置目标', '[role="tab"]');
    await click('调整目标');
    await fill('股票目标权重百分比', '70');
    await fill('基金目标权重百分比', '30');
    await act(async () => {
      merge.click();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('放弃未保存的目标修改并切换换算方式？');
    await click('继续编辑');
    expect(merge.getAttribute('aria-checked')).toBe('true');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="股票目标权重百分比"]')?.value,
    ).toBe('70');
    await click('交易', '[role="tab"]');
    await click('放弃修改并离开');
    const count = calls.summary.mock.calls.length;
    expect(host.querySelectorAll('button[aria-label="汇率合并"]')).toHaveLength(1);
    expect(merge.isConnected).toBe(true);
    await act(async () => {
      merge.click();
      await Promise.resolve();
    });
    expect(calls.summary).toHaveBeenCalledTimes(count);
    await click('组合概览', '[role="tab"]');
    expect(merge.getAttribute('aria-checked')).toBe('false');
    expect(calls.summary).toHaveBeenCalledTimes(count);
  });
  it('模式往返后恢复未合并的默认换算，不复用另一范围的汇率选择', async () => {
    await mount('/performance?tab=analysis');
    const switchButton = host.querySelector<HTMLButtonElement>('button[aria-label="汇率合并"]')!;
    expect(switchButton).not.toBeNull();
    await act(async () => {
      switchButton.click();
      await Promise.resolve();
    });
    await vi.waitFor(async () => {
      await settle();
      expect(calls.summary).toHaveBeenLastCalledWith('actual', undefined, {
        fxMerge: true,
        baseCurrency: 'CNY',
      });
    });
    await click('模拟');
    await click('实际');
    await vi.waitFor(async () => {
      await settle();
      expect(calls.summary).toHaveBeenLastCalledWith('actual', undefined, {
        fxMerge: false,
        baseCurrency: 'CNY',
      });
    });
  });
  it('账户列表刷新失败保留已验证范围和正在编辑的配置草稿', async () => {
    await mount('/performance?accountId=a&tab=allocation');
    await click('调整目标');
    await fill('股票目标权重百分比', '70');
    await fill('基金目标权重百分比', '30');
    calls.accounts.mockRejectedValueOnce(new Error('账户列表暂不可用'));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="刷新组合数据"]')!.click();
      await Promise.resolve();
    });
    await vi.waitFor(async () => {
      await settle();
      expect(host.textContent).toContain('账户列表未更新');
    });
    expect(params().get('accountId')).toBe('a');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="股票目标权重百分比"]')?.value,
    ).toBe('70');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="基金目标权重百分比"]')?.value,
    ).toBe('30');
    expect(calls.save).not.toHaveBeenCalled();
  });
  it('配置草稿切页可取消，保存失败保留输入，保存中阻止切页，重试不改请求归属', async () => {
    await mount('/performance?accountId=a&tab=allocation');
    await click('调整目标');
    await fill('股票目标权重百分比', '70');
    await fill('基金目标权重百分比', '30');
    await click('交易', '[role="tab"]');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click('继续编辑');
    expect(params().get('tab')).toBe('allocation');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="股票目标权重百分比"]')?.value,
    ).toBe('70');
    calls.save.mockRejectedValueOnce(new Error('受控保存失败'));
    await click('保存目标');
    expect(host.textContent).toContain('受控保存失败');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="股票目标权重百分比"]')?.value,
    ).toBe('70');
    let finish!: () => void;
    calls.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await click('保存目标');
    await click('组合概览', '[role="tab"]');
    expect(params().get('tab')).toBe('allocation');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await settle();
    expect(calls.save.mock.calls[1]).toEqual(calls.save.mock.calls[0]);
    expect(calls.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: 'account',
        accountId: 'a',
        targets: { stock: 0.7, fund: 0.3 },
      }),
    );
    await click('组合概览', '[role="tab"]');
    expect(params().get('tab')).toBe('overview');
  });
});
