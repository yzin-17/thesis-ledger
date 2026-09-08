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

  it('updates a trailing stop peak before evaluating the drawdown', () => {
    const currentStrategy = strategy({
      stopLoss: { type: 'trailing', value: 0.1 },
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    });
    const result = run(currentStrategy, [
      bar('A', '2025-01-01', 10),
      bar('A', '2025-01-02', 12),
      bar('A', '2025-01-03', 10.8),
    ]);
    expect(
      result.trades.map((trade) => ({ date: trade.date, side: trade.side, reason: trade.reason })),
    ).toEqual([
      { date: '2025-01-01', side: 'buy', reason: 'signal' },
      { date: '2025-01-03', side: 'sell', reason: 'stop' },
    ]);
  });

  it('does not trigger an ATR stop until fourteen true ranges are available', () => {
    const currentStrategy = strategy({
      stopLoss: { type: 'atr', value: 1 },
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    });
    const bars = [
      bar('A', '2025-01-01', 10),
      ...Array.from({ length: 12 }, (_, index) =>
        bar('A', `2025-01-${String(index + 2).padStart(2, '0')}`, 10),
      ),
      bar('A', '2025-01-14', 8.9),
    ];
    const result = run(currentStrategy, bars);
    expect(result.trades.filter((trade) => trade.reason === 'stop')).toHaveLength(0);
    expect(result.warnings).toContain('ATR 止损样本不足，未触发');
  });

  it('uses a fourteen-period ATR distance once enough history exists', () => {
    const currentStrategy = strategy({
      stopLoss: { type: 'atr', value: 1 },
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    });
    const bars = [
      bar('A', '2025-01-01', 10),
      ...Array.from({ length: 13 }, (_, index) =>
        bar('A', `2025-01-${String(index + 2).padStart(2, '0')}`, 10),
      ),
      bar('A', '2025-01-15', 8.9),
      bar('A', '2025-01-16', 8.5),
    ];
    const result = run(currentStrategy, bars);
    expect(result.trades.find((trade) => trade.side === 'sell')).toMatchObject({
      date: '2025-01-15',
      reason: 'stop',
    });
  });

  it('activates a trailing take profit only after the holding has been profitable', () => {
    const currentStrategy = strategy({
      stopLoss: { type: 'fixed', value: 0.5 },
      takeProfit: { type: 'trailing', value: 0.1 },
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    });
    const result = run(currentStrategy, [
      bar('A', '2025-01-01', 10),
      bar('A', '2025-01-02', 9.5),
      bar('A', '2025-01-03', 12),
      bar('A', '2025-01-04', 10.8),
    ]);
    expect(result.trades.find((trade) => trade.side === 'sell')).toMatchObject({
      date: '2025-01-04',
      reason: 'takeprofit',
    });
  });

  it('sizes risk positions from risk budget divided by the stop distance', () => {
    const currentStrategy = strategy({
      stopLoss: { type: 'fixed', value: 0.1 },
      sizing: { type: 'risk', value: 0.01 },
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    });
    const result = run(currentStrategy, [bar('A', '2025-01-01', 100)]);
    expect(result.trades.find((trade) => trade.side === 'buy')).toMatchObject({
      quantity: 20,
      price: 100,
    });
  });

  it('rejects a risk position when no positive stop distance can be calculated', () => {
    const currentStrategy = strategy({
      stopLoss: { type: 'fixed', value: 0 },
      sizing: { type: 'risk', value: 0.01 },
      entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    });
    const result = run(currentStrategy, [bar('A', '2025-01-01', 100)]);
    expect(result.trades).toHaveLength(0);
    expect(result.rejectedOrders[0]?.reason).toBe('缺少可计算的止损距离');
  });

  it('continues the main backtest and explains when benchmark bars are unavailable', () => {
    const result = run(strategy({ benchmark: 'B' }), [
      bar('A', '2025-01-01', 10),
      bar('A', '2025-01-02', 10),
    ]);
    expect(result.finalValue).toBeGreaterThan(0);
    expect(result.warnings).toContain('基准行情不可用，已跳过基准比较');
  });

  it('aligns benchmark comparison by shared dates and filters symbol and point-in-time data', () => {
    const benchmarkBars: BacktestBar[] = [
      bar('B', '2025-01-01', 10),
      bar('B', '2025-01-02', 11),
      bar('B', '2025-01-03', 10),
      { ...bar('B', '2025-01-04', 20), availableAt: '2025-03-01T00:00:00Z' },
      bar('OTHER', '2025-01-02', 100),
    ];
    const aligned = runBacktestWithBenchmark(benchmarkBars);
    expect(aligned.benchmark).toMatchObject({
      strategyReturn: expect.any(Number),
      benchmarkReturn: expect.any(Number),
      excessReturn: expect.any(Number),
    });
  });
});

const runBacktestWithBenchmark = (benchmarkBars: BacktestBar[]) =>
  runBacktest({
    strategy: strategy({ benchmark: 'B' }),
    bars: [bar('A', '2025-01-01', 10), bar('A', '2025-01-02', 11), bar('A', '2025-01-03', 12)],
    start: '2025-01-01',
    end: '2025-01-03',
    dataAsOf: '2025-02-01T00:00:00Z',
    initialCash: 20_000,
    benchmarkBars,
  });
