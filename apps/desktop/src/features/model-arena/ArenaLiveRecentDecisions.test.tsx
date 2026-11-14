// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { ArenaDetailHeader } from './ArenaDetailShell.js';
import {
  ArenaLiveRecentDecisions,
  selectRecentArenaDecisions,
} from './ArenaLiveRecentDecisions.js';

function cycle(id: string, at: string, summary: string, orders: unknown[] = []) {
  return {
    id,
    asOf: at,
    createdAt: at,
    decision: { summary, orders, cancelOrderIds: [], wakeups: [], watchedSymbols: [] },
  };
}

const detail = {
  protocol: { timeZone: 'Asia/Shanghai' },
  instrumentDirectory: { AAPL: '苹果' },
  agents: [
    {
      id: 'agent-a',
      model: '模型 A',
      cycles: [
        cycle('a-1', '2026-11-13T01:00:00Z', '较早买入'),
        cycle('a-3', '2026-11-13T03:00:00Z', '观察市场'),
      ],
    },
    {
      id: 'agent-b',
      model: '模型 B',
      cycles: [
        cycle('b-2', '2026-11-13T02:00:00Z', '等待时机'),
        cycle('b-4', '2026-11-13T04:00:00Z', '最新买入', [
          { clientId: 'buy-1', side: 'buy', symbol: 'AAPL', quantity: '10' },
        ]),
        {
          id: 'b-pending',
          asOf: '2026-11-13T05:00:00Z',
          createdAt: '2026-11-13T05:00:00Z',
          decision: null,
        },
      ],
    },
    {
      id: 'agent-c',
      model: '模型 C',
      cycles: [cycle('c-0', '2026-11-13T00:00:00Z', '最早买入')],
    },
  ],
} as unknown as ArenaLiveDetail;

describe('自主比赛最近模型决策', () => {
  it('跨模型按研究时间倒序展示最近四条已生成决策，不把待研究当成决策', () => {
    expect(selectRecentArenaDecisions(detail).map(({ cycle }) => cycle.id)).toEqual([
      'b-4',
      'a-3',
      'b-2',
      'a-1',
    ]);
    expect(selectRecentArenaDecisions(detail, 2).map(({ cycle }) => cycle.id)).toEqual([
      'b-4',
      'a-3',
    ]);
  });

  it('展示摘要、标的和可跳转的详情入口', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onOpenDecision = vi.fn();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    document.body.append(container);
    try {
      await act(async () => {
        root.render(<ArenaLiveRecentDecisions detail={detail} onOpenDecision={onOpenDecision} />);
        await Promise.resolve();
      });
      expect(container.textContent).toContain('最新买入');
      expect(container.textContent).toContain('苹果 · AAPL');
      expect(container.textContent).not.toContain('最早买入');
      const buttons = [...container.querySelectorAll('button')].filter(
        (button) => button.textContent === '查看详情',
      );
      expect(buttons).toHaveLength(4);
      await act(async () => {
        buttons[0]!.click();
        await Promise.resolve();
      });
      expect(onOpenDecision).toHaveBeenCalledWith('agent-b');
      await act(async () => {
        buttons[1]!.click();
        await Promise.resolve();
      });
      expect(onOpenDecision).toHaveBeenLastCalledWith('agent-a');
    } finally {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it('没有已生成的决策时显示空状态', () => {
    const html = renderToStaticMarkup(
      <ArenaLiveRecentDecisions
        detail={{ ...detail, agents: detail.agents.map((agent) => ({ ...agent, cycles: [] })) }}
        onOpenDecision={() => {}}
      />,
    );
    expect(html).toContain('暂无已生成的模型决策');
  });

  it('比赛状态紧随标题，而不另占标题下方一行', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ArenaDetailHeader
          title="美股"
          backPath="/arena"
          titleAccessory={<span>已暂停</span>}
          actions={<button>恢复比赛</button>}
        />
      </MemoryRouter>,
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    const title = container.querySelector('h1');
    const status = [...container.querySelectorAll('span')].find(
      (node) => node.textContent === '已暂停',
    );
    expect(title?.textContent).toBe('美股');
    expect(title?.parentElement).toBe(status?.parentElement);
    expect(container.textContent).toContain('恢复比赛');
  });
});
