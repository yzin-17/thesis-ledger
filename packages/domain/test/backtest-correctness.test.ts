import { describe, expect, it } from 'vitest';
import { runBacktest, type BacktestBar, type BacktestStrategy } from '../src/backtest-engine.js';

const cost = {
  commissionRate: 0,
  minimumCommission: 0,
  stampDutyRate: 0,
  slippageRate: 0,
};

const strategy = (overrides: Partial<BacktestStrategy> = {}): BacktestStrategy => ({
  universe: { symbols: ['A'], asOf: '2025-01-01T00:00:00Z' },
  entrySignals: [{ indicator: 'close', operator: 'gt', value: 0 }],
  exitSignals: [{ indicator: 'close', operator: 'lt', value: 0 }],
  stopLoss: { type: 'fixed', value: 0.5 },
  sizing: { type: 'fixed', value: 1_000 },
  execution: { price: 'close', tPlusOne: false, lotSize: 1 },
  cost,
  ...overrides,
});

const bar = (symbol: string, date: string, close: number, open = close): BacktestBar => ({
  symbol,
  date,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
});

const run = (currentStrategy: BacktestStrategy, bars: BacktestBar[]) =>
  runBacktest({
    strategy: currentStrategy,
    bars,
    start: '2025-01-01',
    end:
      bars
        .map((item) => item.date)
        .sort()
        .at(-1) ?? '2025-01-01',
    dataAsOf: '2025-02-01T00:00:00Z',
    initialCash: 20_000,
  });

describe('Backtest correctness regressions', () => {
  it('crossesAbove only fires on a real transition and not on the first/already-above bar', () => {
    const currentStrategy = strategy({
      entrySignals: [{ indicator: 'close', operator: 'crossesAbove', value: 10 }],
    });
    const result = run(currentStrategy, [
      bar('A', '2025-01-01', 11),
      bar('A', '2025-01-02', 9),
      bar('A', '2025-01-03', 11),
      bar('A', '2025-01-04', 12),
    ]);
    expect(result.trades.filter((trade) => trade.side === 'buy')).toMatchObject([
      { date: '2025-01-03', price: 11 },
    ]);
  });

  it('crossesBelow keeps the same transition semantics inside expression trees', () => {
    const currentStrategy = strategy({
      entryCondition: { indicator: 'close', operator: 'crossesBelow', value: 10 },
    });
    const result = run(currentStrategy, [
      bar('A', '2025-01-01', 9),
      bar('A', '2025-01-02', 11),
      bar('A', '2025-01-03', 9),
    ]);
    expect(result.trades.filter((trade) => trade.side === 'buy')).toMatchObject([
      { date: '2025-01-03', price: 9 },
    ]);
  });

  it('nextOpen executes on the next tradable bar open and never fabricates a final-bar fill', () => {
    const currentStrategy = strategy({
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 10 }],
      execution: { price: 'nextOpen', tPlusOne: false, lotSize: 1 },
    });
    const result = run(currentStrategy, [
      bar('A', '2025-01-01', 11, 9),
      { ...bar('A', '2025-01-02', 13, 12), suspended: true },
      bar('A', '2025-01-03', 14, 13),
    ]);
    expect(result.trades.filter((trade) => trade.side === 'buy')).toMatchObject([
      { date: '2025-01-03', price: 13 },
    ]);

    const noNextBar = run(currentStrategy, [bar('A', '2025-01-01', 11, 9)]);
    expect(noNextBar.trades).toHaveLength(0);
  });

  it('produces one equity point per date and is independent of input symbol order', () => {
    const currentStrategy = strategy({
      universe: { symbols: ['A', 'B'], asOf: '2025-01-01T00:00:00Z' },
      sizing: { type: 'fixed', value: 1_000 },
    });
    const bars = [
      bar('B', '2025-01-01', 20),
      bar('A', '2025-01-01', 10),
      bar('B', '2025-01-02', 16),
      bar('A', '2025-01-02', 11),
    ];
    const forward = run(currentStrategy, bars);
    const reversed = run(currentStrategy, [...bars].reverse());
    expect(forward.equityCurve).toEqual([
      { date: '2025-01-01', value: 20_000 },
      { date: '2025-01-02', value: 19_900 },
    ]);
    expect(reversed.equityCurve).toEqual(forward.equityCurve);
    expect(reversed.trades).toEqual(forward.trades);
  });

  it('values existing holdings with their own symbol prices for maxPositionWeight', () => {
    const currentStrategy = strategy({
      universe: { symbols: ['A', 'B'], asOf: '2025-01-01T00:00:00Z' },
      sizing: { type: 'fixed', value: 5_000 },
      riskConstraints: [{ kind: 'maxPositionWeight', threshold: 0.3 }],
    });
    const result = run(currentStrategy, [bar('A', '2025-01-01', 100), bar('B', '2025-01-01', 10)]);
    expect(result.trades.filter((trade) => trade.side === 'buy')).toHaveLength(2);
    expect(result.rejectedOrders).toHaveLength(0);
  });

  it('computes realized trade PnL and holding days from both entry and exit legs', () => {
    const currentStrategy = strategy({
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
      exitSignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
      cost: { ...cost, minimumCommission: 5 },
    });
    const result = run(currentStrategy, [bar('A', '2025-01-01', 10), bar('A', '2025-01-02', 10)]);
    expect(result.metrics).toMatchObject({
      tradeCount: 1,
      tradeWinRate: 0,
      profitLossRatio: 0,
      averageHoldingDays: 1,
    });
    expect(result.metrics.turnover).toBe(1_000);
  });
});
