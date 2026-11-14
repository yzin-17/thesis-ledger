// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { describe, expect, it, vi } from 'vitest';
import { ArenaLiveOverview } from './ArenaLiveOverview.js';
import { ArenaLivePerformance } from './ArenaLivePerformance.js';
import { ArenaLiveAgent } from './ArenaLiveAgent.js';

vi.mock('./ArenaLiveChart.js', () => ({
  ArenaLiveChart: () => <div data-testid="performance-chart">收益曲线</div>,
}));

const detail = {
  id: 'match-1',
  state: 'running',
  protocol: {
    title: '自主比赛',
    market: 'CN',
    startsOn: '2026-11-01',
    endsOn: '2026-11-30',
    initialCash: '100000',
    currency: 'CNY',
    universe: 'fixed',
    timeZone: 'Asia/Shanghai',
  },
  startedAt: '2026-11-02T00:00:00.000Z',
  agents: [
    {
      id: 'agent-1',
      state: 'running',
      model: 'test-model',
      providerId: 'test-provider',
      cycles: [],
    },
  ],
  instrumentDirectory: {},
  frames: [
    {
      kind: 'comparison',
      at: '2026-11-10T00:00:00.000Z',
      marks: [],
    },
  ],
} as unknown as ArenaLiveDetail;

describe('自主比赛图表布局', () => {
  it('收益表现以图表开头，将比赛元数据留给比赛设置', () => {
    const html = renderToStaticMarkup(
      <ArenaLivePerformance detail={detail} onSelect={() => {}} onOpenDecision={() => {}} />,
    );
    expect(html).toContain('performance-chart');
    expect(html.indexOf('performance-chart')).toBeLessThan(html.indexOf('赛季排名'));
    expect(html).not.toContain('每模型初始本金');
    expect(html).not.toContain('选股范围');
    expect(html).not.toContain('曲线起点');
  });

  it('窄屏决策优先，并在内容足够宽时恢复双栏布局', () => {
    const html = renderToStaticMarkup(
      <ArenaLivePerformance detail={detail} onSelect={() => {}} onOpenDecision={() => {}} />,
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    const decisions = container.querySelector('[aria-label="最近模型决策"]');
    const ranking = container.querySelector('[aria-label="赛季排名"]');
    expect(decisions).not.toBeNull();
    expect(ranking).not.toBeNull();
    expect(decisions?.parentElement).toBe(ranking?.parentElement);
    expect(decisions?.compareDocumentPosition(ranking!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(decisions?.parentElement?.className).toContain('@min-[720px]:grid-cols-2');
  });

  it('已结束比赛缺少最终估值时在排名处保留提示', () => {
    const ended = { ...detail, state: 'ended' as const, sealedFrame: null };
    const html = renderToStaticMarkup(
      <ArenaLivePerformance detail={ended} onSelect={() => {}} onOpenDecision={() => {}} />,
    );
    expect(html).toContain('尚无完整共同估值，无法确定最终排名');
    expect(html.indexOf('performance-chart')).toBeLessThan(html.indexOf('无法确定最终排名'));
  });

  it('显示模型的下一次预约时间，并允许单独手动触发一次决策', () => {
    const ready = {
      ...detail,
      state: 'running' as const,
      remaining: { requests: 10, tokens: 10000, costMicros: 100000 },
      protocol: { ...detail.protocol, budgetCurrency: 'USD', resources: { maxResearchSteps: null, maxCycleSeconds: null },
        entrants: [{ model: 'test-model', providerId: 'test-provider', maxInputTokens: 10000, maxOutputTokens: 2000 }] },
      agents: [{ ...detail.agents[0]!, state: 'waiting' as const,
        remaining: { requests: 10, tokens: 10000, costMicros: 100000 },
        availability: { tradingDate: null, cash: null, shares: {} },
        account: { revision: 0, cash: '10000', wakeups: [{ id: 'w1', condition: { kind: 'time', at: '2099-11-14T07:00:00Z' }, createdAt: '2026-11-13T07:00:00Z', firedAt: null }], orders: [], positions: [], cashSettlements: [], fills: [], watchedSymbols: [] },
      }],
    } as unknown as ArenaLiveDetail;
    const ranking = renderToStaticMarkup(<ArenaLivePerformance detail={ready} onSelect={() => {}} onOpenDecision={() => {}} />);
    expect(ranking).toContain('下一次决策');
    expect(ranking).toContain('Asia/Shanghai');
    const account = renderToStaticMarkup(<ArenaLiveAgent detail={ready} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} onHistory={() => {}} />);
    expect(account).toContain('手动触发决策');
    expect(account).toContain('休市可以研究');
    // 下一次决策只在预约区块出现一次标题，账户概览不再重复同一时刻的市场时区时间
    expect(account.match(/下一次决策/g)).toHaveLength(1);
    expect(account).toContain('预约时间 · ');
    expect(account.indexOf('查看历史决策')).toBeLessThan(account.indexOf('手动触发决策'));
    const due = { ...ready, agents: ready.agents.map((agent) => ({ ...agent, account: { ...agent.account,
      wakeups: [{ id: 'due', condition: { kind: 'time' as const, at: '2020-11-13T17:04:00Z' }, createdAt: '2020-11-13T17:03:00Z', firedAt: null }] } })) };
    const dueHtml = renderToStaticMarkup(<ArenaLiveAgent detail={due} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} onHistory={() => {}} />);
    expect(dueHtml).toContain('预约已到期（等待研究调度）');
    expect(dueHtml).not.toContain('手动触发决策');
    const ack = renderToStaticMarkup(<ArenaLiveAgent detail={{ ...ready, agents: ready.agents.map((agent) => ({ ...agent, reason: 'market_closed' })) }} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} triggerAppointment="already_scheduled" onHistory={() => {}} />);
    expect(ack).toContain('已有待执行的决策预约');
    expect(ack).toContain('市场未开放也可以研究');
    expect(ack).toContain('role="status"');
    const loading = renderToStaticMarkup(<ArenaLiveAgent detail={ready} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} triggerBusy onHistory={() => {}} />);
    expect(loading).toContain('正在提交预约');
    expect(loading).toContain('disabled');
    const concurrent = renderToStaticMarkup(<ArenaLiveAgent detail={{ ...ready, agents: ready.agents.map((agent) => ({ ...agent, cycles: [{ id: 'cycle-1', agentId: agent.id, state: 'pending' as const, trigger: '[]', attempt: 0, createdAt: '2026-11-13T00:00:00Z', completedAt: null, asOf: null, reason: null, decision: null, requestId: null, usage: null }] })) }} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} triggerAppointment="already_in_progress" onHistory={() => {}} />);
    expect(concurrent).toContain('已有等待执行或正在研究的决策周期');
    expect(concurrent).not.toContain('手动触发决策');
    const studying = renderToStaticMarkup(<ArenaLiveAgent detail={{ ...ready, agents: ready.agents.map((agent) => ({ ...agent, state: 'researching' })) }} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} triggerError={new Error('旧版接口 409')} onHistory={() => {}} />);
    expect(studying).not.toContain('旧版接口 409');
    expect(studying).not.toContain('手动触发决策');
    // 研究进行中仍可从同一处进入历史决策
    expect(studying).toContain('查看历史决策');
    expect(renderToStaticMarkup(<ArenaLiveAgent detail={{ ...ready, state: 'paused' }} agentId={ready.agents[0]!.id} busy={false} onRetry={() => {}} onTrigger={() => {}} onHistory={() => {}} />)).not.toContain('手动触发决策');
  });

  it('比赛设置概况保留原有元数据与运行时间', () => {
    const html = renderToStaticMarkup(<ArenaLiveOverview detail={detail} />);
    expect(html).toContain('比赛概况');
    expect(html).toContain('每模型初始本金');
    expect(html).toContain('参赛模型');
    expect(html).toContain('选股范围');
    expect(html).toContain('曲线起点');
    expect(html).toContain('最新共同估值');
    expect(html).toContain('赛期');
  });
});
