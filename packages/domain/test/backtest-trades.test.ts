import { describe, expect, it } from 'vitest';
import { backtestTradeMetrics, projectBacktestTrades, type SimulationFill } from '../src/index.js';

const fill = (overrides: Partial<SimulationFill> = {}): SimulationFill => ({
  fillId: 'fill-1',
  executionSymbol: '600519.SH',
  side: 'buy',
  quantity: '10',
  price: '10',
  charges: [],
  occurredAt: '2025-01-01T00:00:00Z',
  reason: 'signal',
  ...overrides,
});

const options = { executionSymbol: '600519.SH', currency: 'CNY' as const };

describe('backtest trade projection', () => {
  it('aggregates add and reduce fills into one closed long lifecycle', () => {
    const result = projectBacktestTrades(
      [
        fill({
          fillId: 'buy-1',
          quantity: '10',
          price: '10',
          charges: [{ amount: '1', currency: 'CNY' }],
        }),
        fill({
          fillId: 'buy-2',
          quantity: '5',
          price: '12',
          occurredAt: '2025-01-02T00:00:00Z',
          charges: [{ amount: '1', currency: 'CNY' }],
        }),
        fill({
          fillId: 'sell-1',
          side: 'sell',
          quantity: '8',
          price: '15',
          occurredAt: '2025-01-03T00:00:00Z',
          reason: 'signal',
          charges: [{ amount: '2', currency: 'CNY' }],
        }),
        fill({
          fillId: 'sell-2',
          side: 'sell',
          quantity: '7',
          price: '16',
          occurredAt: '2025-01-04T00:00:00Z',
          reason: 'risk',
          charges: [{ amount: '2', currency: 'CNY' }],
        }),
      ],
      options,
    );
    expect(result).toMatchObject({ source: 'BACKTEST', status: 'complete', openPositions: [] });
    expect(result.trades).toEqual([
      expect.objectContaining({
        openedAt: '2025-01-01T00:00:00Z',
        closedAt: '2025-01-04T00:00:00Z',
        entryQuantity: '15',
        exitQuantity: '15',
        entryValue: { amount: '160', currency: 'CNY' },
        exitValue: { amount: '232', currency: 'CNY' },
        realizedPnl: { amount: '66', currency: 'CNY' },
        returnRate: '0.4125',
        closeReason: 'risk',
        fillIds: ['buy-1', 'buy-2', 'sell-1', 'sell-2'],
        source: 'BACKTEST',
      }),
    ]);
  });

  it('keeps an end-date open position open and out of closed metrics', () => {
    const result = projectBacktestTrades(
      [fill({ fillId: 'open', quantity: '3', price: '10' })],
      options,
    );
    expect(result.trades).toEqual([]);
    expect(result.openPositions).toEqual([
      { executionSymbol: '600519.SH', quantity: '3', fillIds: ['open'] },
    ]);
    expect(backtestTradeMetrics(result.trades)).toMatchObject({
      tradeCount: { status: 'available', value: '0' },
      winRate: { status: 'unavailable', reason: 'NO_CLOSED_TRADES' },
      profitFactor: { status: 'unavailable', reason: 'NO_CLOSED_TRADES' },
    });
  });

  it('computes Decimal win rate and profit factor only from closed trades', () => {
    const fills: SimulationFill[] = [
      fill({ fillId: 'buy-a', quantity: '1', price: '10', occurredAt: '2025-01-01T00:00:00Z' }),
      fill({
        fillId: 'sell-a',
        side: 'sell',
        quantity: '1',
        price: '20',
        occurredAt: '2025-01-02T00:00:00Z',
      }),
      fill({ fillId: 'buy-b', quantity: '1', price: '10', occurredAt: '2025-01-03T00:00:00Z' }),
      fill({
        fillId: 'sell-b',
        side: 'sell',
        quantity: '1',
        price: '5',
        occurredAt: '2025-01-04T00:00:00Z',
      }),
      fill({ fillId: 'buy-c', quantity: '1', price: '10', occurredAt: '2025-01-05T00:00:00Z' }),
      fill({
        fillId: 'sell-c',
        side: 'sell',
        quantity: '1',
        price: '10',
        occurredAt: '2025-01-06T00:00:00Z',
      }),
    ];
    const result = projectBacktestTrades(fills, options);
    expect(result.trades).toHaveLength(3);
    expect(backtestTradeMetrics(result.trades)).toMatchObject({
      tradeCount: { status: 'available', value: '3' },
      winRate: { status: 'available', value: '0.33333333333333333333' },
      profitFactor: { status: 'available', value: '2' },
    });
  });

  it('returns stable warnings and does not fabricate trades for invalid lifecycle input', () => {
    const result = projectBacktestTrades(
      [
        fill({ fillId: 'orphan-sell', side: 'sell', occurredAt: '2024-12-31T00:00:00Z' }),
        fill({ fillId: 'duplicate', quantity: '2' }),
        fill({ fillId: 'duplicate', quantity: '2', occurredAt: '2025-01-02T00:00:00Z' }),
        fill({ fillId: 'wrong-currency', charges: [{ amount: '1', currency: 'USD' }] }),
      ],
      options,
    );
    expect(result.status).toBe('partial');
    expect(result.trades).toHaveLength(0);
    expect(result.warnings).toEqual([
      'orphan-sell:SELL_WITHOUT_OPEN_POSITION',
      'wrong-currency:费用币种 USD 与执行币种 CNY 不一致',
      'DUPLICATE_FILL:duplicate',
    ]);
  });
});
