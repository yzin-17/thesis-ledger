// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewResearchSheet } from './NewResearchSheet.js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { NavigationGuardProvider } from '../shared/navigation-guard.js';
import { PortfolioModeProvider } from '../portfolio/portfolio-mode-context.js';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  valuation: vi.fn(),
  strategies: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('../portfolio/portfolio.api.js', () => ({
  fetchAccounts: mocks.accounts,
  fetchPortfolioValuation: mocks.valuation,
}));
vi.mock('../strategy/strategy.api.js', () => ({ fetchStrategies: mocks.strategies }));
vi.mock('./ai.mutations.js', () => ({
  useCreateAiRunMutation: () => ({ mutateAsync: mocks.generate, isPending: false }),
}));
vi.mock('./ai.queries.js', () => ({
  useAiCapabilitiesQuery: () => ({ data: { canStart: false, providers: [] } }),
  useAiRoutingSettingsQuery: () => ({ data: { researchDefault: null } }),
  useAiResearchRetryPrefillQuery: () => ({ data: undefined, isPending: false, isError: false }),
}));
vi.mock('@/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn() }),
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let router: ReturnType<typeof createMemoryRouter>;
const accountId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('thesis-ledger-portfolio-mode', 'shadow');
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
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  mocks.accounts.mockResolvedValue([
    {
      id: accountId,
      name: '研究验收账户',
      type: 'securities',
      mode: 'shadow',
      currency: 'CNY',
      active: true,
    },
  ]);
  mocks.valuation.mockImplementation((mode: string) =>
    Promise.resolve({
      positions:
        mode === 'shadow'
          ? [
              {
                id: 'position-1',
                symbol: '510300.SH',
                asset: { name: '沪深300ETF' },
              },
            ]
          : [],
    }),
  );
  mocks.strategies.mockResolvedValue([
    {
      id: 'strategy-1',
      name: '研究验收策略',
      versions: [{ id: versionId, version: 2 }],
    },
  ]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  client.clear();
  router?.dispose();
  window.localStorage.removeItem('thesis-ledger-portfolio-mode');
  container.remove();
  vi.unstubAllGlobals();
});

async function until<T>(read: () => T | undefined | null): Promise<T> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = read();
    if (value) return value;
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error('未出现预期研究选择控件');
}

async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
    await Promise.resolve();
  });
}

async function choose(triggerId: string, text: string) {
  await click(
    await until(() => {
      const trigger = document.getElementById(triggerId) as HTMLButtonElement | null;
      return trigger && !trigger.disabled ? trigger : null;
    }),
  );
  const option = await until(() =>
    [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes(text),
    ),
  );
  await click(option);
}

async function openScope(label: string) {
  router = createMemoryRouter([
    {
      path: '*',
      element: (
        <NavigationGuardProvider>
          <PortfolioModeProvider>
            <NewResearchSheet open onOpenChange={vi.fn()} onCreated={vi.fn()} />
          </PortfolioModeProvider>
        </NavigationGuardProvider>
      ),
    },
  ]);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  await click(
    await until(() =>
      [...document.querySelectorAll('button')].find((item) => item.textContent === label),
    ),
  );
}

describe('新建研究的实体选择', () => {
  it('账户选中后继续显示名称和模式，而非 UUID', async () => {
    await openScope('账户');
    await choose('ai-account', '研究验收账户');
    expect(document.getElementById('ai-account')?.textContent).toContain(
      '研究验收账户 · 证券 · CNY · 模拟',
    );
    expect(document.getElementById('ai-account')?.textContent).not.toContain(accountId);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each(['actual', 'shadow'])('%s 账户使用自身模式查询，持仓回显代码及名称', async (mode) => {
    mocks.accounts.mockResolvedValue([
      {
        id: accountId,
        name: '研究验收账户',
        type: 'securities',
        mode,
        currency: 'CNY',
        active: true,
      },
    ]);
    mocks.valuation.mockImplementation((requestedMode: string) =>
      Promise.resolve({
        positions:
          requestedMode === mode
            ? [
                {
                  id: 'position-1',
                  symbol: '510300.SH',
                  asset: { name: '沪深300ETF' },
                },
              ]
            : [],
      }),
    );
    window.localStorage.setItem('thesis-ledger-portfolio-mode', mode);
    await openScope('单个持仓');
    await choose('ai-position-account', '研究验收账户');
    await until(() => mocks.valuation.mock.calls.length > 0);
    expect(mocks.valuation.mock.calls.at(-1)?.slice(0, 2)).toEqual([mode, accountId]);
    await choose('ai-position-symbol', '沪深300ETF');
    expect(document.getElementById('ai-position-symbol')?.textContent).toContain(
      '510300.SH · 沪深300ETF',
    );
    expect(
      client.getQueryData(['desktop', 'portfolio', 'valuation', mode, accountId]),
    ).toBeDefined();
    const otherMode = mode === 'actual' ? 'shadow' : 'actual';
    expect(
      client.getQueryData(['desktop', 'portfolio', 'valuation', otherMode, accountId]),
    ).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('策略版本选中后保留策略名称和版本号', async () => {
    await openScope('策略版本');
    await choose('ai-strategy-version', '研究验收策略');
    expect(document.getElementById('ai-strategy-version')?.textContent).toContain(
      '研究验收策略 · v2',
    );
    expect(document.getElementById('ai-strategy-version')?.textContent).not.toContain(versionId);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
