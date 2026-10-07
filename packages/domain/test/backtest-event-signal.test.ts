import { describe, expect, it } from 'vitest';
import { evaluateBooleanExpression } from '../src/backtest-simulation-evaluator.js';
import type { BacktestCorporateActionFact } from '../src/backtest-corporate-actions.js';
import type { SimulationExpressionContext } from '../src/backtest-simulation.js';
import { DeterministicSimulationEngine } from '../src/backtest-simulation.js';

const fact: BacktestCorporateActionFact = {
  symbol: '510300.SH', market: 'CN', instrumentType: 'ETF', type: 'CASH_DIVIDEND',
  cashAmount: '0.1', currency: 'CNY', effectiveDate: '2025-06-18',
  occurredAt: '2025-06-18T00:00:00+08:00', availableAt: '2025-06-01T00:00:00Z',
  strategyVisibility: { kind: 'announcement', announcedAt: '2025-06-01T00:00:00Z' },
  provider: 'fixture', providerRevision: 'r1',
};
function evaluate(facts: readonly BacktestCorporateActionFact[], date = '2025-06-18') {
  const context: SimulationExpressionContext = {
    tick: { occurredAt: `${date}T07:00:00Z`, tradingDate: date }, sourceSeries: new Map(),
    corporateActionSignals: { facts, symbol: fact.symbol, market: fact.market },
  };
  return evaluateBooleanExpression({ type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' }, context);
}

describe('生效日事件信号', () => {
  it('窗口前已公告事件只在生效交易日匹配', () => {
    expect(evaluate([fact])).toMatchObject({ status: 'available', value: true });
    expect(evaluate([fact], '2025-06-17')).toMatchObject({ status: 'available', value: false });
    expect(evaluate([fact], '2025-06-19')).toMatchObject({ status: 'available', value: false });
  });

  it('完整空集合和其他证券不会生成信号', () => {
    expect(evaluate([])).toMatchObject({ status: 'available', value: false });
    expect(evaluate([{ ...fact, symbol: '159516.SZ' }])).toMatchObject({ status: 'available', value: false });
  });

  it('不从 occurredAt 或 availableAt 推断缺失的生效日或可见性', () => {
    const missingDate = { ...fact };
    delete missingDate.effectiveDate;
    const missingVisibility = { ...fact };
    delete missingVisibility.strategyVisibility;
    expect(evaluate([missingDate])).toMatchObject({ status: 'unavailable' });
    expect(evaluate([missingVisibility])).toMatchObject({ status: 'unavailable' });
  });

  it('未来公告和未来观测均不可用', () => {
    expect(evaluate([{ ...fact, strategyVisibility: { kind: 'announcement', announcedAt: '2025-06-18T08:00:00Z' } }]))
      .toMatchObject({ status: 'unavailable' });
    expect(evaluate([{ ...fact, availableAt: '2026-06-18T00:00:00Z' }]))
      .toMatchObject({ status: 'unavailable' });
  });

  it('保守日级可见性在同日不能使用，次交易日可用', () => {
    const prior = { ...fact, strategyVisibility: { kind: 'conservative-day' as const, visibleDate: '2025-06-17' } };
    expect(evaluate([prior])).toMatchObject({ status: 'available', value: true });
    expect(evaluate([{ ...prior, strategyVisibility: { kind: 'conservative-day', visibleDate: '2025-06-18' } }]))
      .toMatchObject({ status: 'unavailable' });
  });

  it('引擎传递事件信号上下文，信号事实不会自动加入记账队列', () => {
    const result = new DeterministicSimulationEngine().run({
      runId: 'event-signal-only',
      strategy: {
        executionInstrument: { symbol: fact.symbol, market: fact.market, assetType: 'etf' },
        primaryTimeframe: '1d', entry: { type: 'corporateActionEvent', eventType: 'CASH_DIVIDEND' },
        exit: { type: 'positionState', field: 'isOpen' },
      },
      ticks: [{ occurredAt: '2025-06-18T07:00:00Z', tradingDate: '2025-06-18' }],
      sourceSeries: new Map(), corporateActionSignalFacts: [fact],
      positionState: { isOpen: false, quantity: '0', averageCost: '0', holdingPeriods: 0, availableAt: '2025-01-01T00:00:00Z' },
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.kind).toBe('entry');
    expect(result.corporateActionResults).toEqual([]);
    expect(result.events.some((event) => event.type === 'corporateAction')).toBe(false);
  });

  it('价格研究时钟不会放松事件 PIT', () => {
    const observedLater = { ...fact, availableAt: '2026-01-01T00:00:00Z' };
    expect(evaluate([observedLater])).toMatchObject({ status: 'unavailable' });
  });
});
