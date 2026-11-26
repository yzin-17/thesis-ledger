import { describe, expect, it } from 'vitest';
import {
  BacktestTradeLossPause,
  type TradePlanCalendar,
} from '../src/backtest-trade-loss-pause.js';
import { tradingCalendarFromFact } from '../src/execution-rules.js';
import type { SimulationFillRecord } from '../src/backtest-simulation.js';
import { backtestTradePlanLines } from '../src/backtest-trade-plan-display.js';

const config = { completedTrades: 3, tradingDays: 2, pnlBasis: 'fillsNetOfFees' } as const;
const source = (patch: Partial<TradePlanCalendar> = {}): TradePlanCalendar => ({
  calendar: tradingCalendarFromFact({
    market: 'CN',
    timezone: 'Asia/Shanghai',
    provider: 'fixture',
    providerRevision: '1',
    availableAt: '2026-09-01T00:00:00Z',
    range: { start: '2026-09-01', end: '2026-12-01' },
    holidays: ['2026-09-15'],
    sessions: [{ startMinute: 570, endMinute: 900 }],
    sessionOverrides: [],
  }),
  availableAt: '2026-09-01T00:00:00Z',
  ...patch,
});
const at = (date: string, time = '07:00') => `${date}T${time}:00.000Z`;
let sequence = 0;
function fill(side: 'buy' | 'sell', occurredAt: string): SimulationFillRecord {
  const id = String(sequence++);
  return {
    fillId: id,
    orderId: id,
    side,
    occurredAt,
    availableAt: occurredAt,
    quantity: '100',
    price: '100',
    charges: [],
    reason: 'signal',
    executionSymbol: '600519.SH',
  };
}
function cycle(runtime: BacktestTradeLossPause, pnl: string, date = '2026-09-11') {
  runtime.accept(fill('buy', at(date, '01:35')), '100');
  runtime.accept(fill('sell', at(date)), '0', pnl);
}

describe('完整交易的成交净收益窗口', () => {
  it('分批净收益累计、加仓不清零、重复成交不重记、最后一份卖出才计一笔', () => {
    const r = new BacktestTradeLossPause(config, source(), []);
    const partial = fill('sell', at('2026-09-08'));
    r.accept(fill('buy', at('2026-09-08', '01:35')), '100');
    r.accept(partial, '60', '-2.01');
    r.accept(partial, '60', '-2.01');
    r.accept(fill('buy', at('2026-09-09', '01:35')), '100');
    expect(r.snapshot()).toMatchObject({ cycleNet: '-2.01', completedNet: [] });
    r.accept(fill('sell', at('2026-09-09')), '0', '1.99');
    expect(r.snapshot()).toMatchObject({
      active: false,
      cycleNet: '-0.02',
      completedNet: ['-0.02'],
    });
    cycle(r, '-1');
    cycle(r, '-1');
    expect(r.entryAllowed(at('2026-09-11'))).toBe(false);
  });
  it('零收益或盈利打断全亏窗口；暂停结束后旧窗口不重复启动，新平仓可启动', () => {
    const r = new BacktestTradeLossPause(config, source(), []);
    for (const pnl of ['-1', '-1', '0', '-1', '-1']) cycle(r, pnl);
    expect(r.snapshot().pausedAt).toBeUndefined();
    for (const pnl of ['1', '-1', '-1']) cycle(r, pnl);
    expect(r.snapshot().pausedAt).toBeUndefined();
    cycle(r, '-1');
    expect(r.entryAllowed(at('2026-09-17'))).toBe(true);
    expect(r.entryAllowed(at('2026-09-18'))).toBe(true);
    cycle(r, '-2', '2026-09-18');
    expect(r.entryAllowed(at('2026-09-18'))).toBe(false);
  });
  it('缺账本净收益时拒绝，不自行猜成本或费用', () => {
    const r = new BacktestTradeLossPause(config, source(), []);
    r.accept(fill('buy', at('2026-09-08')), '100');
    expect(() => r.accept(fill('sell', at('2026-09-09')), '0')).toThrow(
      'LOSS_PAUSE_NET_PNL_MISSING',
    );
    expect(r.snapshot().completedNet).toEqual([]);
  });
});

describe('冻结交易日暂停与中文', () => {
  it('平仓日不计，周末及假期跳过，盘中多根不加速，第 N+1 个交易日恢复', () => {
    const r = new BacktestTradeLossPause(config, source(), []);
    for (let n = 0; n < 3; n++) cycle(r, '-1');
    for (const date of ['2026-09-11', '2026-09-12', '2026-09-14', '2026-09-15', '2026-09-16'])
      for (const time of ['01:35', '03:00', '07:00'])
        expect(r.entryAllowed(at(date, time))).toBe(false);
    expect(r.entryAllowed(at('2026-09-17', '01:35'))).toBe(true);
  });
  it('严格时点拒绝未来来源；快照研究按明确截点读取，不能用早于决策的截点', () => {
    const diagnostics: string[] = [];
    const future = { availableAt: at('2026-09-10') };
    expect(
      new BacktestTradeLossPause(config, source(future), diagnostics).entryAllowed(
        at('2026-09-09'),
      ),
    ).toBe(false);
    expect(diagnostics.join()).toContain('LOSS_PAUSE_CALENDAR_NOT_VISIBLE');
    const r = new BacktestTradeLossPause(
      config,
      source({
        ...future,
        research: { basis: 'fixed-provider-snapshot', dataAsOf: at('2026-09-30') },
      }),
      [],
    );
    expect(r.entryAllowed(at('2026-09-09'))).toBe(true);
    expect(r.entryAllowed(at('2026-10-01'))).toBe(false);
  });
  it('缺日历或中间日期未知保留原因，不能当假期跳过', () => {
    const diagnostics: string[] = [];
    expect(
      new BacktestTradeLossPause(config, undefined, diagnostics).entryAllowed(at('2026-09-09')),
    ).toBe(false);
    const original = source();
    const calendar = {
      ...original.calendar,
      status: (date: Date | string) => {
        const s = original.calendar.status(date);
        return s.date === '2026-09-14'
          ? { ...s, open: false, reason: 'calendar-unavailable' as const }
          : s;
      },
    };
    const r = new BacktestTradeLossPause(config, source({ calendar }), diagnostics);
    for (let n = 0; n < 3; n++) cycle(r, '-1');
    expect(r.entryAllowed(at('2026-09-17'))).toBe(false);
    expect(diagnostics.join()).toContain('LOSS_PAUSE_CALENDAR_COVERAGE');
  });
  it('美国夏令时切换仍按本地交易日计数', () => {
    const calendar = tradingCalendarFromFact({
      market: 'US',
      timezone: 'America/New_York',
      provider: 'fixture',
      providerRevision: '1',
      availableAt: at('2026-09-01'),
      range: { start: '2026-09-01', end: '2026-12-01' },
      holidays: [],
      sessions: [{ startMinute: 570, endMinute: 960 }],
      sessionOverrides: [],
    });
    const r = new BacktestTradeLossPause(
      { ...config, completedTrades: 1, tradingDays: 1 },
      source({ calendar }),
      [],
    );
    r.accept(fill('buy', '2026-10-30T14:00:00Z'), '100');
    r.accept(fill('sell', '2026-10-30T19:00:00Z'), '0', '-1');
    expect(r.entryAllowed('2026-11-02T15:00:00Z')).toBe(false);
    expect(r.entryAllowed('2026-11-03T15:00:00Z')).toBe(true);
  });
  it('回读区分亏损暂停与每次平仓冷却，明确费用和现金分配', () => {
    const lines = backtestTradePlanLines({
      version: 1,
      evaluation: 'barClose',
      stages: [],
      lossPause: config,
      cooldown: { bars: 10, stopBars: 10 },
    }).join('\n');
    for (const text of [
      '最近 3 笔完整平仓交易全部净亏损',
      '随后 2 个完整交易日',
      '现金分配单独记账，不参与亏损判定',
      '普通退出 10 根',
    ])
      expect(lines).toContain(text);
  });
});
