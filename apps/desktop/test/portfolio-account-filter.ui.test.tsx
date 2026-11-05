// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceWorkspace } from '../src/app/PerformanceWorkspace.js';
import {
  fetchAccounts,
  fetchManagedAccounts,
  fetchPortfolioValuation,
} from '../src/features/portfolio/portfolio.api.js';
import type * as PortfolioApi from '../src/features/portfolio/portfolio.api.js';
import {
  fetchPortfolioTrades,
  fetchPortfolioTradeInstruments,
} from '../src/features/portfolio/portfolio-trade.api.js';
import type * as PortfolioTradeApi from '../src/features/portfolio/portfolio-trade.api.js';
import type * as PnlQueries from '../src/features/performance/performance-pnl.queries.js';
import { usePortfolioShellQueries } from '../src/features/portfolio/portfolio.queries.js';
import type {
  Account,
  Portfolio,
  PortfolioMode,
} from '../src/features/portfolio/portfolio.types.js';

vi.mock('../src/features/portfolio/portfolio.api.js', async (original) => ({
  ...(await original<typeof PortfolioApi>()),
  fetchAccounts: vi.fn(),
  fetchManagedAccounts: vi.fn(),
  fetchPortfolioValuation: vi.fn(),
}));
vi.mock('../src/features/portfolio/portfolio-trade.api.js', async (original) => ({
  ...(await original<typeof PortfolioTradeApi>()),
  fetchPortfolioTrades: vi.fn(),
  fetchPortfolioTradeInstruments: vi.fn(),
}));
vi.mock('../src/features/onboarding/onboarding.queries.js', () => ({
  useOnboardingStatusQuery: () => ({ data: { hasProviderSetup: true, hasRiskRule: true } }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('../src/features/performance/performance-pnl.queries.js', async (original) => ({
  ...(await original<typeof PnlQueries>()),
  usePerformancePnlQuery: () => ({ data: undefined, isPending: false, isError: false }),
}));
Object.assign(window, { PointerEvent: MouseEvent });

const accounts: Account[] = [
  { id: 'a', name: '安卓基金账户', type: 'fund', mode: 'actual', currency: 'CNY' },
  { id: 'b', name: '苹果基金账户', type: 'fund', mode: 'actual', currency: 'CNY' },
  { id: 'shadow', name: '模拟账户', type: 'fund', mode: 'shadow', currency: 'CNY' },
  {
    id: 'inactive',
    name: '停用账户',
    type: 'fund',
    mode: 'actual',
    currency: 'CNY',
    active: false,
  },
];
const portfolio = (accountId = '', mode: PortfolioMode = 'actual'): Portfolio => ({
  totalMarketValue: accountId ? 80 : 160,
  totalCost: accountId ? 100 : 200,
  totalPnl: accountId ? -20 : -40,
  cashValue: 0,
  mode,
  partial: false,
  valuedAt: '2026-11-04T10:00:00Z',
  positions: (accountId ? [accountId] : ['a', 'b']).map((id) => ({
    id: `position-${id}`,
    accountId: id,
    symbol: '000001.OF',
    quantity: 90,
    costPrice: 1.22,
    marketValue: 80,
    pnl: -20,
    stale: false,
    asset: { name: `基金持仓-${id}` },
  })),
});
const requests: Array<{
  mode: PortfolioMode;
  accountId?: string;
  resolve: (value: Portfolio) => void;
  reject: (reason: Error) => void;
}> = [];
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

function Harness({ initialAccountId = '' }: { initialAccountId?: string }) {
  const [tab, setTab] =
    useState<import('../src/app/PerformanceWorkspace.js').PerformanceWorkspaceTab>('overview');
  const [mode, setMode] = useState<PortfolioMode>('actual');
  const [accountId, setAccountId] = useState(initialAccountId);
  const query = usePortfolioShellQueries(mode, { enableValuation: true, accountId });
  return (
    <>
      <button
        onClick={() => {
          setMode('shadow');
          setAccountId('');
        }}
      >
        切换模拟
      </button>
      <PerformanceWorkspace
        tab={tab}
        onTabChange={setTab}
        {...query}
        mode={mode}
        onAccountChange={setAccountId}
        onRetry={() => void query.refresh()}
        onNavigate={vi.fn()}
        onOpenReview={vi.fn()}
      />
    </>
  );
}
async function mount(initialAccountId = '') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness initialAccountId={initialAccountId} />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function resolve(index: number) {
  await act(async () =>
    requests[index]!.resolve(portfolio(requests[index]!.accountId, requests[index]!.mode)),
  );
  await settle();
}
async function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
  await settle();
}
async function select(label: string) {
  await click('收益账户范围');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(label),
  );
  expect(option).toBeDefined();
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option!.dispatchEvent(down);
    option!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
  });
  await settle();
}

beforeEach(() => {
  vi.mocked(fetchPortfolioTradeInstruments).mockImplementation(async (mode, accountId) => ({
    mode,
    accountId: accountId ?? null,
    items: [],
  }));
  requests.length = 0;
  vi.mocked(fetchAccounts).mockResolvedValue(accounts);
  vi.mocked(fetchManagedAccounts).mockResolvedValue(accounts);
  vi.mocked(fetchPortfolioValuation).mockImplementation(
    (mode, accountId) =>
      new Promise((resolve, reject) =>
        requests.push({ mode, ...(accountId ? { accountId } : {}), resolve, reject }),
      ),
  );
  vi.mocked(fetchPortfolioTrades).mockResolvedValue({
    mode: 'actual',
    accountId: null,
    items: [],
    nextCursor: null,
    projectionGenerations: {},
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  vi.clearAllMocks();
});

describe('投资组合账户筛选', () => {
  it('顶部刷新同时更新交易及筛选选项，等待交易完成并保留账户范围', async () => {
    await mount('a');
    await resolve(0);
    vi.mocked(fetchPortfolioTradeInstruments).mockRejectedValueOnce(new Error('选项暂不可用'));
    await click('交易');
    expect(host.querySelector('[aria-label="交易标的筛选"]')?.textContent).toContain(
      '标的暂不可用',
    );
    expect(
      [...host.querySelectorAll('button')].some((button) => button.textContent === '刷新交易'),
    ).toBe(false);
    let finishTrades!: (value: Awaited<ReturnType<typeof fetchPortfolioTrades>>) => void;
    vi.mocked(fetchPortfolioTrades).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishTrades = resolve;
        }),
    );
    vi.mocked(fetchPortfolioTradeInstruments).mockResolvedValue({
      mode: 'actual',
      accountId: 'a',
      items: [],
    });
    const managedReads = vi.mocked(fetchManagedAccounts).mock.calls.length;
    await click('刷新组合数据');
    expect(fetchPortfolioTrades).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'actual', accountId: 'a' }),
    );
    expect(fetchManagedAccounts).toHaveBeenCalledTimes(managedReads + 1);
    expect(fetchPortfolioTradeInstruments).toHaveBeenLastCalledWith(
      'actual',
      'a',
      expect.any(AbortSignal),
    );
    await resolve(1);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="刷新组合数据"]')?.disabled).toBe(
      true,
    );
    await act(async () =>
      finishTrades({
        mode: 'actual',
        accountId: 'a',
        items: [],
        nextCursor: null,
        projectionGenerations: {},
      }),
    );
    await settle();
    expect(host.querySelector<HTMLButtonElement>('[aria-label="刷新组合数据"]')?.disabled).toBe(
      false,
    );
    expect(host.querySelector('[aria-label="交易标的筛选"]')?.textContent).toContain('全部标的');
    expect(host.querySelector('[aria-label="收益账户范围"]')?.textContent).toContain(
      '安卓基金账户',
    );
  });
  it('选择账户后汇总和持仓同步切换，交易继承范围，清除筛选恢复全部', async () => {
    await mount();
    await resolve(0);
    expect(host.textContent).toContain('¥160.00');
    await click('收益账户范围');
    const optionText = [...document.querySelectorAll('[role="option"]')]
      .map((item) => item.textContent)
      .join(' ');
    expect(optionText).toContain('全部账户');
    expect(optionText).toContain('安卓基金账户');
    expect(optionText).not.toContain('模拟账户');
    expect(optionText).not.toContain('停用账户');
    await click('收益账户范围');
    await select('安卓基金账户');
    expect(requests[1]).toMatchObject({ mode: 'actual', accountId: 'a' });
    expect(host.querySelector('[aria-label="收益账户范围"]')?.textContent).toContain(
      '安卓基金账户',
    );
    expect(host.textContent).not.toContain('基金持仓-b');
    await resolve(1);
    expect(host.textContent).toContain('¥80.00');
    expect(host.textContent).not.toContain('¥160.00');
    expect(host.textContent).toContain('基金持仓-a');
    expect(host.textContent).not.toContain('基金持仓-b');
    await click('交易');
    expect(fetchPortfolioTrades).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: 'a', mode: 'actual' }),
    );
    expect(host.querySelector('[aria-label="交易账户范围"]')).toBeNull();
    await click('清除筛选');
    expect(fetchPortfolioTrades).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ accountId: 'a' }),
    );
    await click('组合概览');
    expect(host.textContent).toContain('¥160.00');
  });

  it('快速切换和迟到结果不混用账户，失败时仍可恢复全部', async () => {
    await mount();
    await resolve(0);
    await select('安卓基金账户');
    await select('苹果基金账户');
    expect(requests[2]).toMatchObject({ accountId: 'b' });
    await resolve(1);
    expect(host.textContent).not.toContain('基金持仓-a');
    await act(async () => requests[2]!.reject(new Error('账户估值读取失败')));
    await settle();
    expect(host.textContent).toContain('暂时无法读取投资组合');
    expect(host.querySelector('[aria-label="收益账户范围"]')?.textContent).toContain(
      '苹果基金账户',
    );
    await select('全部账户');
    expect(host.textContent).toContain('¥160.00');
  });

  it.each(['shadow', 'inactive', 'missing'])(
    '无效账户 %s 回退当前模式全部范围',
    async (accountId) => {
      await mount(accountId);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ mode: 'actual' });
      expect(requests[0]).not.toHaveProperty('accountId');
    },
  );

  it('链接单账户先等待账户列表核对，切换模式不发送旧账户请求', async () => {
    let finishAccounts!: (value: Account[]) => void;
    vi.mocked(fetchAccounts).mockReturnValue(
      new Promise((resolve) => {
        finishAccounts = resolve;
      }),
    );
    await mount('a');
    expect(requests).toHaveLength(0);
    await act(async () => finishAccounts(accounts));
    await settle();
    expect(requests[0]).toMatchObject({ mode: 'actual', accountId: 'a' });
    await resolve(0);
    await click('切换模拟');
    expect(requests[1]).toMatchObject({ mode: 'shadow' });
    expect(requests[1]).not.toHaveProperty('accountId');
    expect(host.textContent).not.toContain('基金持仓-a');
    expect(host.querySelector('[aria-label="收益账户范围"]')?.textContent).toContain('全部账户');
  });
});
