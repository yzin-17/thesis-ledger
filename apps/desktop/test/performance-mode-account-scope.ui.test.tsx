// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import type { Account, PortfolioMode } from '../src/features/portfolio/portfolio.types.js';
import { PerformanceDashboard } from '../src/features/performance/PerformanceDashboard.js';

const api = vi.hoisted(() => ({ read: vi.fn(), saveTargets: vi.fn() }));
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: vi.fn() }) }));
vi.mock('../src/features/performance/performance.api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchPerformanceHistory: (...args: unknown[]) => api.read('history', ...args),
  fetchPerformanceSeries: (...args: unknown[]) => api.read('series', ...args),
  fetchPerformanceSummary: (...args: unknown[]) => api.read('summary', ...args),
  fetchPerformanceLayers: (...args: unknown[]) => api.read('layers', ...args),
  fetchPerformanceTargets: (...args: unknown[]) => api.read('targets', ...args),
  savePerformanceTargets: api.saveTargets,
}));

type RequestRecord = {
  kind: string;
  mode: PortfolioMode;
  accountId: string | undefined;
  range?: string;
  interval?: string;
  reject?: (reason: Error) => void;
};

const actualAccount: Account = {
  id: 'actual-account',
  name: '验收实际账户',
  type: 'securities',
  mode: 'actual',
  currency: 'CNY',
};
const shadowAccount: Account = {
  id: 'shadow-account',
  name: '验收模拟账户',
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
};
const accounts = [actualAccount, shadowAccount];
const requests: RequestRecord[] = [];
let recoverShadow = false;
let root: Root | undefined;
let host: HTMLDivElement | undefined;
let client: QueryClient | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window, { PointerEvent: MouseEvent });

const fixture = (
  kind: string,
  mode: PortfolioMode,
  accountId: string | undefined,
  range?: string,
  interval?: string,
) => {
  const value = mode === 'actual' ? 987654 : recoverShadow ? 223456 : 123456;
  const snapshot = (day: number) => ({
    id: `${mode}-snapshot-${day}`,
    capturedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    marketValue: value + day,
    costValue: value,
    cashValue: 0,
    partial: false,
    missingSymbols: [],
    currency: 'CNY',
  });
  const total = {
    marketValue: value,
    costValue: value,
    cashValue: 0,
    partial: false,
    missingSymbols: [],
    currency: 'CNY',
  };

  if (kind === 'history') return [snapshot(1), snapshot(2)];
  if (kind === 'series') {
    return {
      range: range ?? '1Y',
      interval: interval ?? '1d',
      currency: 'CNY',
      availableIntervals: ['1d', '1w', '1mo'],
      defaultInterval: '1d',
      dataQuality: 'COMPLETE',
      historyStart: '2026-09-01T00:00:00.000Z',
      points: [1, 2].map((day) => ({
        at: `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`,
        value: value + day,
        currency: 'CNY',
        valuationBasis: 'OFFICIAL',
        disclosureCoverage: 1,
        pricedCoverage: 1,
        dataQuality: 'COMPLETE',
        sourceSnapshotId: `${mode}-point-${day}`,
      })),
    };
  }
  if (kind === 'summary')
    return { ttwror: mode === 'actual' ? 0.77 : recoverShadow ? 0.25 : 0.1, xirr: null };
  if (kind === 'layers') {
    return {
      security: [],
      account: [{ accountId: accountId ?? `${mode}-account`, ...total }],
      portfolio: total,
      byCurrency: [],
      valuedAt: '2026-09-02T00:00:00.000Z',
      dataQuality: { partial: false, missingSymbols: [], missingCurrencies: [] },
      fx: { enabled: false, status: 'disabled', missingCurrencies: [], rates: [] },
    };
  }
  return {
    targets: {},
    scope: accountId ? 'account' : 'portfolio',
    accountId: accountId ?? null,
    version: 1,
    createdAt: '2026-09-02T00:00:00.000Z',
    source: 'none',
  };
};

function Harness() {
  const [mode, setMode] = useState<PortfolioMode>('actual');
  return (
    <>
    <button aria-label="切换全局账户模式" onClick={() => setMode(current => current === 'actual' ? 'shadow' : 'actual')}>切换全局账户模式</button>
    <PerformanceDashboard
      accounts={accounts}
      mode={mode}
      onNavigate={() => undefined}
    />
    </>
  );
}

const button = (selector: string) => {
  const found = document.querySelector<HTMLButtonElement>(selector);
  if (!found) throw new Error(`缺少按钮：${selector}`);
  return found;
};

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

async function waitFor(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    check();
  });
}

async function choose(selectLabel: string, optionText: string) {
  await click(button(`button[aria-label="${selectLabel}"]`));
  await waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(optionText),
  );
  if (!option) throw new Error(`缺少选项：${optionText}`);
  await act(async () => {
    option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    option.click();
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  requests.splice(0);
  recoverShadow = false;
  api.read.mockImplementation((kind: string, ...args: unknown[]) => {
    const [rawMode, rawAccountId, rawRange, rawInterval] = args;
    const mode = rawMode as PortfolioMode;
    const accountId = rawAccountId as string | undefined;
    const record: RequestRecord = {
      kind,
      mode,
      accountId,
      ...(typeof rawRange === 'string' ? { range: rawRange } : {}),
      ...(typeof rawInterval === 'string' ? { interval: rawInterval } : {}),
    };
    requests.push(record);
    if (mode === 'shadow' && !recoverShadow) {
      return new Promise((resolve, reject) => {
        record.reject = reject;
      });
    }
    return Promise.resolve(fixture(kind, mode, accountId, record.range, record.interval));
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  root = undefined;
  host = undefined;
  client = undefined;
});

describe('收益分析账户范围切换', () => {
  it('切换模式时请求和回显立即采用当前模式的账户范围，并隔离错误与恢复数据', async () => {
    await act(async () => {
      root?.render(
        <QueryClientProvider client={client!}>
          <ConfirmDialogProvider>
            <Harness />
          </ConfirmDialogProvider>
        </QueryClientProvider>,
      );
    });
    await waitFor(() =>
      expect(requests.filter((request) => request.mode === 'actual').length).toBeGreaterThanOrEqual(
        5,
      ),
    );
    await choose('账户', '验收实际账户');
    expect(button('button[aria-label="账户"]').textContent).toContain('验收实际账户');
    await waitFor(() =>
      expect(
        requests.filter(
          (request) => request.mode === 'actual' && request.accountId === actualAccount.id,
        ).length,
      ).toBeGreaterThanOrEqual(5),
    );
    await choose('走势区间', '近3月');
    await choose('走势粒度', '周线');

    await click(button('button[aria-label="切换全局账户模式"]'));
    await waitFor(() =>
      expect(
        requests.filter((request) => request.mode === 'shadow' && request.accountId === undefined),
      ).toHaveLength(5),
    );

    expect(
      requests.filter(
        (request) => request.mode === 'shadow' && request.accountId === actualAccount.id,
      ),
    ).toEqual([]);
    expect(button('button[aria-label="账户"]').textContent).toContain('全部账户');
    expect(button('button[aria-label="走势区间"]').textContent).toContain('近3月');
    expect(button('button[aria-label="走势粒度"]').textContent).toContain('周线');
    expect(document.body.textContent).not.toContain('77.00%');

    const pendingShadow = requests.filter((request) => request.mode === 'shadow' && request.reject);
    expect(pendingShadow).toHaveLength(5);
    await act(async () =>
      pendingShadow.forEach((request) => request.reject?.(new Error('HTTP 503'))),
    );
    await waitFor(() => expect(document.body.textContent).toContain('数据读取失败'));
    expect(document.body.textContent).not.toContain('77.00%');

    recoverShadow = true;
    const retry = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === '重新加载',
    );
    if (!retry) throw new Error('缺少重新加载按钮');
    await click(retry);
    await waitFor(() => expect(document.body.textContent).toContain('25.00%'));
    expect(button('button[aria-label="账户"]').textContent).toContain('全部账户');
    expect(
      requests
        .filter((request) => request.mode === 'shadow')
        .every((request) => request.accountId === undefined),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.kind === 'series' &&
          request.mode === 'shadow' &&
          request.accountId === undefined &&
          request.range === '3M' &&
          request.interval === '1w',
      ),
    ).toBe(true);
  });
});
