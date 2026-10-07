import { describe, expect, it } from 'vitest';
import {
  alignSeriesAt,
  availabilityForDecision,
  buildSeriesVariantsAt,
  evaluateBooleanExpression,
  evaluateIndicator,
  evaluateSignalAt,
  computeSizing,
  evaluateRiskAt,
  valueSimulationLedger,
  SimulationLedger,
  mergeBacktestAvailability,
  type BacktestSeries,
  type BacktestSeriesPoint,
  type SimulationEngineInput,
} from '../src/index.js';

const observedAt = '2026-09-25T00:00:00Z';
const dataAsOf = '2026-09-25T01:00:00Z';
const point = (date: string, value = '2'): BacktestSeriesPoint => ({
  occurredAt: `${date}T00:00:00Z`,
  availableAt: observedAt,
  researchClock: { basis: 'fixed-provider-snapshot', dataAsOf, decisionAt: `${date}T07:00:00Z` },
  value,
  status: 'available',
});
const series = (points: readonly BacktestSeriesPoint[]): BacktestSeries => ({
  sourceId: 'close',
  symbol: '159516.SZ',
  market: 'CN',
  assetType: 'etf',
  field: 'close',
  timeframe: '1d',
  adjusted: true,
  points,
});
const comparison = {
  type: 'compare',
  operator: 'gt',
  left: { type: 'series', sourceId: 'close', field: 'close' },
  right: { type: 'constant', value: '1' },
} as const;

describe('固定供应商快照的双时钟', () => {
  it('只在显式历史收盘时刻可见，并保留真实观测时间和原始输入', () => {
    const value = point('2026-05-18');
    const input = series([value]);
    expect(alignSeriesAt(input, ['2026-05-18T01:30:00Z'])[0]?.status).toBe('unavailable');
    const aligned = alignSeriesAt(input, ['2026-05-18T07:00:00Z'])[0];
    expect(aligned?.point).toBe(value);
    expect(aligned?.point?.availableAt).toBe(observedAt);
    expect(
      buildSeriesVariantsAt(input, [], '2026-05-18T07:00:00Z').raw.points[0]?.availableAt,
    ).toBe(observedAt);
  });

  it('没有研究标签时保留严格历史可见性，晚于冻结截点的修订不可用', () => {
    const original = point('2026-05-18');
    const strict = { ...original };
    delete strict.researchClock;
    expect(alignSeriesAt(series([strict]), ['2026-05-18T07:00:00Z'])[0]?.status).toBe(
      'unavailable',
    );
    const late = { ...original, availableAt: '2026-09-25T02:00:00Z' };
    expect(availabilityForDecision(late)).toBeUndefined();
    expect(alignSeriesAt(series([late]), ['2026-05-18T07:00:00Z'])[0]?.status).toBe('unavailable');
  });

  it('未来发生的 Bar 不因较早决策标签而泄漏', () => {
    const future = { ...point('2026-05-19'), researchClock: point('2026-05-18').researchClock };
    expect(alignSeriesAt(series([future]), ['2026-05-18T07:00:00Z'])[0]?.status).toBe(
      'unavailable',
    );
  });

  it('指标同时传播观测与决策时间，窗口内任何更晚输入都保留', () => {
    const first = { ...point('2026-05-18', '2'), availableAt: '2026-09-25T00:30:00Z' };
    const second = point('2026-05-19', '4');
    const result = evaluateIndicator('MA', [first, second], { period: 2 });
    expect(result.points[1]).toMatchObject({
      value: '3',
      availableAt: first.availableAt,
      researchClock: { dataAsOf, decisionAt: '2026-05-19T07:00:00Z' },
    });
  });

  it('表达式保留真实来源观测，模拟信号在历史决策时钟生成', () => {
    const input: SimulationEngineInput = {
      runId: 'research-clock',
      strategy: {
        executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf' },
        primaryTimeframe: '1d',
        entry: comparison,
        exit: { type: 'not', expression: comparison },
      },
      ticks: [{ occurredAt: '2026-05-18T07:00:00Z' }],
      sourceSeries: new Map([['close', series([point('2026-05-18')])]]),
    };
    const evaluation = evaluateSignalAt(input, input.ticks[0]!, {}, 1);
    expect(evaluation.entry).toMatchObject({ value: true, availableAt: observedAt });
    expect(evaluation.signal?.availableAt).toBe('2026-05-18T07:00:00Z');
    const combined = evaluateBooleanExpression(
      { type: 'all', conditions: [comparison, { type: 'positionState', field: 'isOpen' }] },
      {
        tick: input.ticks[0]!,
        sourceSeries: input.sourceSeries,
        positionState: {
          isOpen: true,
          quantity: '1',
          averageCost: '1',
          holdingPeriods: 0,
          availableAt: '2026-05-19T07:00:00Z',
        },
      },
    );
    if (combined.status !== 'available') throw new Error('Expected available expression');
    expect(availabilityForDecision(combined)).toBe('2026-05-19T07:00:00Z');
  });

  it('拒绝混用不同冻结时点', () => {
    const original = point('2026-05-18');
    const other = {
      ...original,
      researchClock: { ...original.researchClock!, dataAsOf: '2026-09-26T01:00:00Z' },
    };
    expect(() => mergeBacktestAvailability([original, other])).toThrow('dataAsOf 不一致');
  });

  it('定仓与风控消费显式价格时钟，派生事件按决策时间生成', () => {
    const evaluationAt = '2026-05-18T07:00:00Z';
    const price = point('2026-05-18', '9');
    const sizing = computeSizing({
      rule: { type: 'fixedAmount', amount: '90' },
      executionCurrency: 'CNY',
      lotSize: '1',
      currentQuantity: '0',
      evaluationAt,
      price: { ...price, value: '9' },
    });
    expect(sizing).toMatchObject({
      status: 'available',
      normalizedQuantity: '10',
      availableAt: evaluationAt,
    });
    const risk = evaluateRiskAt({
      runId: 'clock-risk',
      executionSymbol: '159516.SZ',
      rules: [{ type: 'fixedStop', percent: '0.1' }],
      position: { quantity: '10', averageCost: '10', holdingPeriods: 1 },
      evaluation: { ...price, value: '9', completed: true },
      evaluationAt,
    });
    expect(risk).toMatchObject({
      status: 'available',
      occurredAt: evaluationAt,
      availableAt: evaluationAt,
      intent: { side: 'sell', occurredAt: evaluationAt },
    });
    expect(price.availableAt).toBe(observedAt);
  });

  it('估值遵循相同截点和收盘约束，严格价格仍不可用于更早的估值', () => {
    const ledger = new SimulationLedger({
      executionInstrument: { symbol: '159516.SZ', market: 'CN', assetType: 'etf', currency: 'CNY' },
      baseCurrency: 'CNY',
      initialCash: { CNY: '100' },
    });
    const snapshot = ledger.snapshot();
    const state = { ...snapshot, position: { ...snapshot.position, quantity: '2' } };
    const value = point('2026-05-18');
    const input = {
      valuationAt: '2026-05-18T07:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      } as const,
      prices: [
        {
          ...value,
          symbol: '159516.SZ',
          market: 'CN' as const,
          assetType: 'etf' as const,
          currency: 'CNY' as const,
          price: '2',
        },
      ],
      fxRates: [],
    };
    expect(valueSimulationLedger(state, input)).toMatchObject({
      status: 'available',
      baseCurrencyValue: '104',
    });
    expect(
      valueSimulationLedger(state, { ...input, valuationAt: '2026-05-18T01:30:00Z' }).status,
    ).toBe('partial');
    const strict = { ...input.prices[0]! };
    delete strict.researchClock;
    expect(valueSimulationLedger(state, { ...input, prices: [strict] }).status).toBe('partial');
  });
});
