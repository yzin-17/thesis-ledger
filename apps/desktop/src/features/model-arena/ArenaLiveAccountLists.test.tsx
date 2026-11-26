// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArenaLiveAgent } from './ArenaLiveAgent.js';

type Book = ArenaLiveDetail['agents'][number]['account'];

const account: Book = {
  revision: 0,
  cash: '10000',
  wakeups: [{ id: 'w1', condition: { kind: 'time', at: '2099-11-14T07:00:00Z' }, createdAt: '2026-11-13T07:00:00Z', firedAt: null }],
  orders: [],
  positions: [],
  cashSettlements: [],
  fills: [],
  watchedSymbols: [],
};

function detailWith(book: Book) {
  return {
    id: 'match-1',
    state: 'running',
    remaining: { requests: 10, tokens: 10000, costMicros: 100000 },
    protocol: {
      title: '自主比赛', market: 'US', startsOn: '2026-11-01', endsOn: '2026-11-30',
      initialCash: '100000', currency: 'USD', universe: 'fixed', timeZone: 'America/New_York',
      budgetCurrency: 'USD', resources: { maxResearchSteps: null, maxCycleSeconds: null },
      entrants: [{ model: 'test-model', providerId: 'test-provider', maxInputTokens: 10000, maxOutputTokens: 2000 }],
    },
    startedAt: '2026-11-02T00:00:00.000Z',
    agents: [{
      id: 'agent-1', state: 'waiting', model: 'test-model', providerId: 'test-provider', cycles: [],
      reason: null, remaining: { requests: 10, tokens: 10000, costMicros: 100000 },
      availability: { tradingDate: null, cash: null, shares: {} }, account: book,
    }],
    instrumentDirectory: {}, frames: [],
  } as unknown as ArenaLiveDetail;
}

const tabs = [
  { tab: '持仓', label: '持仓列表', headers: ['标的', '持有数量', '当前可卖', '可卖日期'], empty: '当前空仓', colSpan: 4 },
  { tab: '委托', label: '委托列表', headers: ['标的', '方向与类型', '数量', '价格／触发价', '状态与保护', '有效至'], empty: '暂无委托', colSpan: 6 },
  { tab: '成交', label: '成交列表', headers: ['行情时间', '标的', '方向', '数量', '成交价', '费用', '证据'], empty: '暂无成交', colSpan: 7 },
];

let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  vi.unstubAllGlobals();
  container.remove();
});

async function openTab(tab: string) {
  const trigger = [...container.querySelectorAll('[data-slot="tabs-trigger"]')]
    .find((element) => element.textContent === tab);
  expect(trigger).toBeTruthy();
  await act(async () => { (trigger as HTMLElement).click(); await Promise.resolve(); });
  return trigger as HTMLElement;
}

async function mount(detail: ArenaLiveDetail) {
  const root = createRoot(container);
  await act(async () => {
    root.render(<ArenaLiveAgent detail={detail} agentId="agent-1" busy={false} onRetry={() => {}} onHistory={() => {}} />);
    await Promise.resolve();
  });
  return root;
}

describe('模型账户明细列表', () => {
  it('空仓 / 无委托 / 无成交时仍展示带列标题的表格与表格内空态', async () => {
    const root = await mount(detailWith(account));
    for (const { tab, label, headers, empty, colSpan } of tabs) {
      await openTab(tab);
      const table = container.querySelector(`table[aria-label="${label}"]`);
      expect(table).not.toBeNull();
      expect([...table!.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(headers);
      const emptyCell = [...table!.querySelectorAll('tbody td')]
        .find((cell) => cell.textContent?.includes(empty));
      expect(emptyCell?.getAttribute('colspan')).toBe(String(colSpan));
      expect(emptyCell?.closest('tbody')?.children).toHaveLength(1);
    }
    await act(async () => { root.unmount(); await Promise.resolve(); });
  });

  it('有记录时同一张表展示数据行，不显示空态', async () => {
    const book: Book = {
      ...account,
      positions: [{ symbol: 'SPY.US', quantity: '10', acquiredOn: '2026-11-10', availableOn: '2026-11-12' }],
      orders: [{
        id: 'o1', clientId: 'c1', symbol: 'SPY.US', side: 'buy', kind: 'limit', quantity: '10',
        price: '700', expiresOn: null, exitGroup: null, createdAt: '2026-11-10T14:00:00Z',
        activeSince: '2026-11-10T14:00:00Z', expiresAt: '2026-11-17T14:00:00Z',
        state: 'active', reservedCash: '7000', reason: null,
      }],
      fills: [{
        id: 'f1', orderId: 'o1', symbol: 'SPY.US', side: 'buy', quantity: '10', price: '700',
        fee: '1', cashDelta: '-7001', marketTime: '2026-11-10T14:30:00Z',
        recordedAt: '2026-11-10T14:30:00Z', sourceRef: 'quote-1', evidence: { quote: 700 },
      }],
    };
    const root = await mount(detailWith(book));
    for (const { tab, label, headers, empty } of tabs) {
      await openTab(tab);
      const table = container.querySelector(`table[aria-label="${label}"]`);
      expect(table).not.toBeNull();
      expect([...table!.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(headers);
      expect(table!.textContent).not.toContain(empty);
      expect(table!.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
      expect(table!.querySelector('tbody td[colspan]')).toBeNull();
    }
    await act(async () => { root.unmount(); await Promise.resolve(); });
  });
});
