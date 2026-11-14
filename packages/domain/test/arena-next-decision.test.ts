import { describe, expect, it } from 'vitest';
import { arenaHasDueTimeWakeup, arenaNextDecisionLabel, arenaNextDecisionNote } from '../src/arena-live-account.js';
import { arenaManualDecisionNotice } from '../src/arena-live-display.js';
import type { ArenaPaperWakeup } from '../src/arena-live-types.js';

const time = (at: string): ArenaPaperWakeup => ({
  id: at, condition: { kind: 'time', at },
  createdAt: '2026-11-12T00:00:00Z', firedAt: null,
});
const event: ArenaPaperWakeup = {
  id: 'price', condition: { kind: 'price', symbol: 'AAPL.US', operator: 'gte', price: '100' },
  createdAt: '2026-11-12T00:00:00Z', firedAt: null,
};
const base = {
  wakeups: [] as ArenaPaperWakeup[], matchState: 'running' as const,
  agentState: 'waiting' as const, timeZone: 'Asia/Shanghai',
  clockAt: '2026-11-13T00:00:00Z',
};

describe('自主竞技场下一次模型决策时间', () => {
  it('到期且未消费的时间预约会阻止重复手动触发，未来时间与事件预约仍允许提前研究', () => {
    const clockAt = '2026-11-13T17:04:00Z';
    expect(arenaHasDueTimeWakeup([time(clockAt), event], clockAt)).toBe(true);
    expect(arenaHasDueTimeWakeup([time('2026-11-13T17:03:00Z')], clockAt)).toBe(true);
    expect(arenaHasDueTimeWakeup([time('2026-11-13T17:30:00Z'), event], clockAt)).toBe(false);
    expect(arenaHasDueTimeWakeup([event], clockAt)).toBe(false);
    expect(arenaHasDueTimeWakeup([{ ...time(clockAt), firedAt: clockAt }], clockAt)).toBe(false);
    // 回放使用回放游标，不能用机器的真实当前时间认定预约到期
    expect(arenaHasDueTimeWakeup([time('2026-01-02T07:00:00Z')], '2026-01-01T07:00:00Z')).toBe(false);
  });
  it('预约已受理、已存在预约及盘前调研都提供明确反馈', () => {
    const first = arenaManualDecisionNotice('scheduled', 'market_closed');
    expect(first).toContain('已安排一次决策预约');
    expect(first).toContain('市场未开放也可以研究');
    expect(first).toContain('新委托和成交仍须开市');
    const again = arenaManualDecisionNotice('already_scheduled', 'market_closed');
    expect(again).toContain('已有待执行的决策预约');
    expect(again).toContain('未重复提交');
    expect(arenaManualDecisionNotice('scheduled', 'calendar_unavailable')).toContain('日历暂不可用不妨碍研究');
    expect(arenaManualDecisionNotice('scheduled', null)).toContain('调度程序尝试执行');
    expect(arenaManualDecisionNotice('already_in_progress', null)).toContain('无需重复预约');
  });

  it('按最早未触发时间及比赛市场时区显示，事件可能提前', () => {
    const text = arenaNextDecisionLabel({ ...base, wakeups: [
      time('2026-11-15T07:00:00Z'), event,
      { ...time('2026-11-13T05:00:00Z'), firedAt: '2026-11-13T05:00:00Z' },
      time('2026-11-14T07:00:00Z'),
    ] });
    expect(text).toContain('2026/11/14');
    expect(text).toContain('15:00');
    expect(text).toContain('Asia/Shanghai');
    expect(text).toContain('事件也可能提前触发');
  });
  it('已到期时间等待研究调度而非等待开市；暂停提示恢复；事件不存在固定时间', () => {
    expect(arenaNextDecisionLabel({ ...base, wakeups: [time('2026-11-12T07:00:00Z')] }))
      .toContain('等待研究调度');
    expect(arenaNextDecisionLabel({ ...base, matchState: 'paused', wakeups: [time('2026-11-12T07:00:00Z')] }))
      .toContain('恢复后');
    expect(arenaNextDecisionLabel({ ...base, wakeups: [event] })).toContain('时间不固定');
  });
  it('使用回放游标判断到期，而不是机器真实时间；研究中及结束按状态显示', () => {
    expect(arenaNextDecisionLabel({
      ...base, wakeups: [time('2026-01-02T07:00:00Z')], clockAt: '2026-01-01T07:00:00Z',
    })).not.toContain('已到期');
    expect(arenaNextDecisionLabel({ ...base, agentState: 'researching' })).toBe('正在决策');
    expect(arenaNextDecisionLabel({ ...base, pending: true })).toBe('已触发，等待模型执行');
    expect(arenaNextDecisionLabel({ ...base, matchState: 'ended' })).toBe('比赛已结束');
    expect(arenaNextDecisionLabel({ ...base, wakeups: [] })).toBe('尚未预约');
  });
  it('状态说明与预约时间分离，避免账户页重复展示同一时刻', () => {
    // 未来时间预约返回 null，由调用方直接展示本地时区的预约时间
    expect(arenaNextDecisionNote({ ...base, wakeups: [time('2099-11-15T07:00:00Z'), event] })).toBeNull();
    expect(arenaNextDecisionNote({ ...base, agentState: 'researching' })).toBe('正在决策');
    expect(arenaNextDecisionNote({ ...base, wakeups: [time('2026-11-12T07:00:00Z')] }))
      .toBe('预约已到期（等待研究调度）');
    expect(arenaNextDecisionNote({ ...base, matchState: 'paused', wakeups: [time('2026-11-12T07:00:00Z')] }))
      .toBe('预约已到期（恢复后等待研究调度）');
    expect(arenaNextDecisionNote({ ...base, wakeups: [event] })).toContain('时间不固定');
    expect(arenaNextDecisionNote({ ...base, wakeups: [] })).toBe('尚未预约');
  });
});
