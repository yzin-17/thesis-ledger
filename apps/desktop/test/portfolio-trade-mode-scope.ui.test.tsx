// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  TradeListQuery,
  TradeListResponse,
  TradeDetailResponse,
  TradeSummaryResponse,
} from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { PortfolioTradeView } from '../src/features/portfolio/PortfolioTradeView.js';
import {
  fetchPortfolioTrade,
  fetchPortfolioTrades,
} from '../src/features/portfolio/portfolio-trade.api.js';
import { portfolioTradeKeys } from '../src/features/portfolio/portfolio-trade.queries.js';
import type { Account, PortfolioMode } from '../src/features/portfolio/portfolio.types.js';

vi.mock('../src/features/portfolio/portfolio-trade.api.js', () => ({
  fetchPortfolioTrades: vi.fn(),
  fetchPortfolioTrade: vi.fn(),
  createPortfolioTradeOpeningBoundary: vi.fn(),
}));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });

const actualAccount: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '运行实际账户',
  type: 'securities',
  mode: 'actual',
  currency: 'CNY',
};

const shadowAccount: Account = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '运行模拟账户',
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
};

type ControlledRequest = {
  params: Partial<TradeListQuery>;
  resolve: (response: TradeListResponse) => void;
  reject: (error: Error) => void;
};
type ControlledDetailRequest = {
  accountId: string;
  tradeId: string;
  mode: PortfolioMode;
  resolve: (detail: TradeDetailResponse) => void;
  reject: (error: Error) => void;
};

const requests: ControlledRequest[] = [];
const detailRequests: ControlledDetailRequest[] = [];
let root: Root | undefined;
let host: HTMLDivElement | undefined;
let queryClient: QueryClient | undefined;

function trade(account: Account, symbol: string, name: string): TradeSummaryResponse {
  return {
    id: `trade:${name}`,
    accountId: account.id,
    accountMode: account.mode,
    symbol,
    assetName: name,
    lifecycle: 'ACTIVE',
    exitProgress: 'FULL',
    endEvidence: 'SELL_EXECUTION',
    openedAt: '2026-01-01T00:00:00.000Z',
    closedAt: '2026-01-05T00:00:00.000Z',
    earliestEvidenceAt: '2026-01-01T00:00:00.000Z',
    sourceQuantity: '100',
    closedQuantity: '100',
    remainingQuantity: '0',
    grossRealizedPnl: '200',
    netRealizedPnl: '190',
    realizedNetReturnRate: '0.19',
    costEstimated: false,
    completeness: 'COMPLETE',
    issues: [],
    costIssues: [],
    algorithmVersion: 'trade-projection-v1',
    projectionFingerprint: null,
    projectionGeneration: '1',
    excludedReasons: [],
  };
}

function response(mode: PortfolioMode, items: TradeSummaryResponse[] = []): TradeListResponse {
  return {
    accountId: null,
    mode,
    items,
    nextCursor: null,
    projectionGenerations: {},
  };
}

function detail(tradeSummary: TradeSummaryResponse): TradeDetailResponse {
  return {
    ...tradeSummary,
    entryLegs: [],
    baselineComponents: [],
    corporateActions: [],
    closeSlices: [],
    dividendAttributions: [],
    evidenceSources: [],
  };
}

function Harness() {
  const [mode, setMode] = useState<PortfolioMode>('actual');
  const [actualIncluded, setActualIncluded] = useState(true);
  const accounts = actualIncluded ? [actualAccount, shadowAccount] : [shadowAccount];

  return (
    <>
      <button
        type="button"
        onClick={() => setMode((current) => (current === 'actual' ? 'shadow' : 'actual'))}
      >
        切换全局账户模式
      </button>
      <button type="button" onClick={() => setActualIncluded((current) => !current)}>
        {actualIncluded ? '删除实际账户' : '恢复实际账户'}
      </button>
      <PortfolioTradeView mode={mode} accounts={accounts} onReview={vi.fn()} />
    </>
  );
}

function InactiveHistoryHarness() {
  return <PortfolioTradeView mode="actual" accounts={[shadowAccount]} onReview={vi.fn()} />;
}

async function renderHarness(node: ReactNode = <Harness />) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient!}>
        <ConfirmDialogProvider>{node}</ConfirmDialogProvider>
      </QueryClientProvider>,
    );
  });
}

async function waitForRequestCount(count: number) {
  for (let attempt = 0; attempt < 20 && requests.length < count; attempt += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  expect(requests).toHaveLength(count);
}

async function waitForDetailRequestCount(count: number) {
  for (let attempt = 0; attempt < 20 && detailRequests.length < count; attempt += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  expect(detailRequests).toHaveLength(count);
}

async function resolveRequest(
  index: number,
  mode: PortfolioMode,
  items: TradeSummaryResponse[] = [],
) {
  await act(async () => requests[index]!.resolve(response(mode, items)));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function rejectRequest(index: number) {
  await act(async () => requests[index]!.reject(new Error('controlled API failure')));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function resolveDetailRequest(index: number, result: TradeDetailResponse) {
  await act(async () => detailRequests[index]!.resolve(result));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

function button(label: string) {
  const found = [...host!.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(found).toBeDefined();
  return found!;
}

async function openSelect(label: string) {
  const trigger = host!.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(trigger).toBeDefined();
  await act(async () => trigger!.click());
}

async function clickOption(predicate: (option: HTMLElement) => boolean) {
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(predicate);
  expect(option).toBeDefined();
  await act(async () => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    option!.dispatchEvent(down);
    option!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
  });
}

async function selectAccount(account: Account, requestIndex: number) {
  await openSelect('交易账户范围');
  await clickOption((option) => option.textContent?.includes(account.name) ?? false);
  await waitForRequestCount(requestIndex + 1);
  expect(requests[requestIndex]!.params).toMatchObject({
    mode: account.mode,
    accountId: account.id,
  });
}

async function setSymbol(value: string, requestIndex: number) {
  const input = host!.querySelector<HTMLInputElement>('[aria-label="交易标的筛选"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitForRequestCount(requestIndex + 1);
  expect(requests[requestIndex]!.params.symbol).toBe(value);
}

async function selectLifecycle(requestIndex: number) {
  await openSelect('交易生命周期');
  await clickOption((option) => option.textContent?.trim() === '进行中');
  await waitForRequestCount(requestIndex + 1);
  expect(requests[requestIndex]!.params.lifecycle).toBe('ACTIVE');
}

beforeEach(() => {
  requests.splice(0);
  detailRequests.splice(0);
  vi.mocked(fetchPortfolioTrades).mockReset();
  vi.mocked(fetchPortfolioTrades).mockImplementation(
    (params) => new Promise((resolve, reject) => requests.push({ params, resolve, reject })),
  );
  vi.mocked(fetchPortfolioTrade).mockReset();
  vi.mocked(fetchPortfolioTrade).mockImplementation(
    (accountId, tradeId, mode) =>
      new Promise((resolve, reject) =>
        detailRequests.push({ accountId, tradeId, mode, resolve, reject }),
      ),
  );
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  queryClient?.clear();
  queryClient = undefined;
  vi.clearAllMocks();
});

describe('交易周期的账户范围与全局模式', () => {
  it('切换模式时立即清空旧账户范围，不展示旧行并保留标的与生命周期筛选', async () => {
    await renderHarness();
    await waitForRequestCount(1);
    expect(requests[0]!.params).toMatchObject({ mode: 'actual' });
    await resolveRequest(0, 'actual', [trade(actualAccount, '600519.SH', '旧实际范围')]);

    await selectAccount(actualAccount, 1);
    await resolveRequest(1, 'actual', [trade(actualAccount, '600519.SH', '旧账户筛选结果')]);
    await setSymbol('600519.SH', 2);
    await resolveRequest(2, 'actual', [trade(actualAccount, '600519.SH', '旧标的筛选结果')]);
    await selectLifecycle(3);
    await resolveRequest(3, 'actual', [trade(actualAccount, '600519.SH', '旧生命周期筛选结果')]);
    expect(host!.textContent).toContain('旧生命周期筛选结果');

    await act(async () => button('切换全局账户模式').click());
    await waitForRequestCount(5);

    expect(requests[4]!.params).toMatchObject({
      mode: 'shadow',
      symbol: '600519.SH',
      lifecycle: 'ACTIVE',
    });
    expect(requests[4]!.params).not.toHaveProperty('accountId');
    expect(host!.querySelector('[role="status"][aria-label="正在读取交易周期"]')).not.toBeNull();
    expect(host!.textContent).not.toContain('旧生命周期筛选结果');
    expect(host!.querySelector('tbody')).toBeNull();
    expect(host!.querySelector('[aria-label="交易账户范围"]')!.textContent).toContain('全部账户');
    expect(host!.textContent).not.toContain(actualAccount.id);

    await rejectRequest(4);
    expect(host!.textContent).toContain('交易列表读取失败');
    expect(host!.textContent).not.toContain('旧生命周期筛选结果');

    await act(async () => button('重试读取').click());
    await waitForRequestCount(6);
    expect(requests[5]!.params).toMatchObject({
      mode: 'shadow',
      symbol: '600519.SH',
      lifecycle: 'ACTIVE',
    });
    expect(requests[5]!.params).not.toHaveProperty('accountId');
    await resolveRequest(5, 'shadow', [trade(shadowAccount, '600519.SH', '恢复后的模拟范围')]);
    expect(host!.textContent).toContain('恢复后的模拟范围');

    await openSelect('交易账户范围');
    const accountOptions = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(accountOptions.some((option) => option.textContent?.includes(shadowAccount.name))).toBe(
      true,
    );
    expect(accountOptions.some((option) => option.textContent?.includes(actualAccount.name))).toBe(
      false,
    );
    await act(async () =>
      host!.querySelector<HTMLButtonElement>('[aria-label="交易账户范围"]')!.click(),
    );

    await act(async () => button('切换全局账户模式').click());
    await waitForRequestCount(7);
    expect(requests[6]!.params).toMatchObject({
      mode: 'actual',
      symbol: '600519.SH',
      lifecycle: 'ACTIVE',
    });
    expect(requests[6]!.params).not.toHaveProperty('accountId');
    expect(host!.textContent).not.toContain('恢复后的模拟范围');
  });

  it('账户从当前列表移除后按全部账户读取，之后也不自动复活旧筛选', async () => {
    await renderHarness();
    await waitForRequestCount(1);
    await resolveRequest(0, 'actual');

    await selectAccount(actualAccount, 1);
    await resolveRequest(1, 'actual', [trade(actualAccount, 'AAPL.US', '待移除账户结果')]);
    await act(async () => {
      queryClient!.removeQueries({
        queryKey: portfolioTradeKeys.list('actual', '', '', 'ALL'),
        exact: true,
      });
      button('删除实际账户').click();
    });
    await waitForRequestCount(3);

    expect(requests[2]!.params).toMatchObject({ mode: 'actual' });
    expect(requests[2]!.params).not.toHaveProperty('accountId');
    expect(host!.querySelector('[role="status"][aria-label="正在读取交易周期"]')).not.toBeNull();
    expect(host!.textContent).not.toContain('待移除账户结果');
    expect(host!.querySelector('[aria-label="交易账户范围"]')!.textContent).toContain('全部账户');
    await resolveRequest(2, 'actual', [trade(actualAccount, 'AAPL.US', '移除后的范围结果')]);

    await act(async () => button('恢复实际账户').click());
    expect(requests).toHaveLength(3);
    expect(host!.querySelector('[aria-label="交易账户范围"]')!.textContent).toContain('全部账户');
    expect(host!.textContent).not.toContain('待移除账户结果');
  });

  it('切换模式时关闭旧交易详情，不向新模式查询旧账户交易', async () => {
    await renderHarness();
    await waitForRequestCount(1);
    const selectedTrade = trade(actualAccount, '600519.SH', '选中的实际交易');
    await resolveRequest(0, 'actual', [selectedTrade]);
    await act(async () => button('查看详情').click());
    await waitForDetailRequestCount(1);
    expect(detailRequests[0]).toMatchObject({
      accountId: actualAccount.id,
      tradeId: selectedTrade.id,
      mode: 'actual',
    });
    await resolveDetailRequest(0, detail(selectedTrade));
    expect(document.body.textContent).toContain('选中的实际交易');

    await act(async () => button('切换全局账户模式').click());
    await waitForRequestCount(2);

    expect(
      detailRequests.filter(
        (request) => request.mode === 'shadow' && request.accountId === actualAccount.id,
      ),
    ).toEqual([]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).not.toContain('选中的实际交易');

    await act(async () => button('切换全局账户模式').click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(detailRequests).toHaveLength(1);
  });

  it('账户列表未包含已停用账户时仍可打开服务端返回的历史交易详情', async () => {
    await renderHarness(<InactiveHistoryHarness />);
    await waitForRequestCount(1);
    const inactiveTrade = trade(actualAccount, '600519.SH', '已停用账户历史交易');
    await resolveRequest(0, 'actual', [inactiveTrade]);

    expect(host!.textContent).toContain('已停用账户历史交易');
    await act(async () => button('查看详情').click());
    await waitForDetailRequestCount(1);

    expect(detailRequests[0]).toMatchObject({
      accountId: actualAccount.id,
      tradeId: inactiveTrade.id,
      mode: 'actual',
    });
    await resolveDetailRequest(0, detail(inactiveTrade));
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
