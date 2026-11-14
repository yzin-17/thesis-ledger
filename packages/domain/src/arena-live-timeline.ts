import { marketCivilInstant } from './market-civil-clock.js';

export interface ArenaExecutionTimeline {
  phase: 'replay' | 'live';
  status: 'ready' | 'research' | 'blocked';
  originAt: string;
  cursorAt: string;
  pendingAt: string | null;
  reason: string | null;
}

export function arenaInitialTimeline(protocol: { startsOn: string | null; timeZone: string }, now: Date): ArenaExecutionTimeline {
  const at = now.toISOString();
  const start = protocol.startsOn ? marketCivilInstant(protocol.startsOn, 0, protocol.timeZone) : at;
  const originAt = start < at ? start : at;
  return { phase: start < at ? 'replay' : 'live', status: 'ready', originAt, cursorAt: originAt, pendingAt: null, reason: null };
}

export function arenaTimelineLabel(timeline: ArenaExecutionTimeline | null) {
  if (!timeline || timeline.phase === 'live') return '实时运行';
  if (timeline.status === 'blocked') return '回放待恢复';
  if (timeline.status === 'research') return '历史研究中';
  return '历史回放中';
}

export function arenaTimelineReason(reason: string | null) {
  const labels: Record<string, string> = {
    replay_calendar_unavailable: '历史交易日历尚未就绪', replay_prices_unavailable: '历史分钟价格尚未就绪',
    replay_rules_unavailable: '历史执行规则尚未就绪', replay_tools_unavailable: '历史研究资料尚未就绪',
    replay_universe_unavailable: '历史全市场标的目录尚未就绪',
    replay_research_attention: '历史研究需要处理，请查看模型账户', replay_source_unavailable: '历史资料暂不可用',
  };
  return reason ? labels[reason] ?? '历史回放暂不可用，请重试' : '';
}
