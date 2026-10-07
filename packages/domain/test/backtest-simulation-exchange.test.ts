import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ExchangeMarketSimulation,
  runExchangeSimulation,
  type SimulationTargetIntent,
} from '../src/index.js';
import type { BacktestCorporateActionFact } from '../src/backtest-corporate-actions.js';
import type { FrozenExecutionModel } from '../src/backtest-execution-model.js';
import { type SimulationLedgerState } from '../src/simulation-ledger.js';
import type { SimulationSettlement } from '../src/simulation-ledger.js';
import type { SimulationFillRecord } from '../src/backtest-simulation.js';
import {
  sourceSeries,
  compare,
  strategy,
  normalizedExecutionAssumptions,
  exchangeBar,
  exchangeRunInput,
  frozenExchangeExecutionModel,
  frozenNormalizedExecutionModel,
} from './backtest-simulation.fixtures.js';

describe('Domain Exchange execution composition', () => {
  it('preserves raw Exchange fill parity and consumes cash reservation', () => {
    const input = exchangeRunInput();
    const result = runExchangeSimulation(input);
    const fill = result.fills[0];
    const eventTypes = result.events.map((event) => event.type);

    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'signalEvaluation',
        'targetIntent',
        'orderValidation',
        'simulationFill',
        'cashSettlement',
      ]),
    );
    expect(fill).toMatchObject({ quantity: '200', price: '10.1' });
    expect(eventTypes.indexOf('signalEvaluation')).toBeLessThan(eventTypes.indexOf('targetIntent'));
    expect(eventTypes.indexOf('targetIntent')).toBeLessThan(eventTypes.indexOf('orderValidation'));
    expect(eventTypes.indexOf('orderValidation')).toBeLessThan(
      eventTypes.indexOf('simulationFill'),
    );
    expect(fill?.occurredAt).toBe('2026-09-08T01:40:00.000Z');
    expect(fill?.occurredAt).not.toBe('2026-09-08T01:35:00.000Z');
    const intent = result.targetIntents[0]!;
    const directPlan = new ExchangeMarketSimulation().plan({
      accountingBasis: 'raw-events',
      rules: input.exchange.rules,
      calendar: input.exchange.calendar,
      currency: 'CNY',
      bars: input.exchange.bars,
      account: { settledCash: '5000', availableQuantity: '0' },
      costs: input.exchange.costs,
      order: {
        ...intent,
        orderId: `${intent.intentId}:order`,
        market: 'CN',
        orderType: 'Market',
        timeInForce: 'DAY',
        executionTiming: 'nextEligibleBarOpen',
        quantity: '200',
      },
    });
    expect(directPlan.status).toBe('filled');
    if (directPlan.status === 'filled') expect(fill).toEqual(directPlan.fill);
    expect(result.ledger).toMatchObject({
      position: { quantity: '200', settledQuantity: '200', unsettledQuantity: '0' },
      cash: { CNY: { settled: '2980', unsettled: '0' } },
    });
    expect(result.ledgerMutations.every((mutation) => mutation.applied)).toBe(true);
    expect(input.ledger.availableCash('CNY')).toBe('2980');
    expect(result.rejects).toEqual([]);
  });

  it('keeps a final DAY order unfilled when no next eligible open exists', () => {
    const result = runExchangeSimulation(
      exchangeRunInput({
        bars: [exchangeBar('2026-09-08T01:30:00.000Z', '2026-09-08T01:35:00.000Z', '10', '9.9')],
      }),
    );

    expect(result.fills).toEqual([]);
    expect(result.rejects).toMatchObject([{ code: 'DAY_EXPIRED' }]);
    expect(result.ledger.cash.CNY.settled).toBe('5000');
    expect(result.ledger.position.quantity).toBe('0');
  });

  it('settles a T+0 buy before validating a same-day sell', () => {
    const run = exchangeRunInput();
    const executionModel = frozenExchangeExecutionModel(0);
    const signalAt = ['2026-09-08T01:35:00.000Z', '2026-09-08T01:45:00.000Z'] as const;
    const result = runExchangeSimulation({
      ...run,
      simulation: {
        ...run.simulation,
        ticks: signalAt.map((occurredAt) => ({
          occurredAt,
          availableAt: occurredAt,
          timeframe: '5m' as const,
        })),
        sourceSeries: new Map([
          [
            'close',
            {
              ...sourceSeries([]),
              timeframe: '5m' as const,
              adjusted: true,
              points: [
                {
                  occurredAt: signalAt[0],
                  availableAt: signalAt[0],
                  value: '11',
                  status: 'available' as const,
                },
                {
                  occurredAt: signalAt[1],
                  availableAt: signalAt[1],
                  value: '-1',
                  status: 'available' as const,
                },
              ],
            },
          ],
        ]),
      },
      exchange: {
        ...run.exchange,
        bars: [
          exchangeBar('2026-09-08T01:30:00.000Z', '2026-09-08T01:35:00.000Z', '10', '9.9'),
          exchangeBar('2026-09-08T01:40:00.000Z', '2026-09-08T01:45:00.000Z', '10.1', '10'),
          exchangeBar('2026-09-08T01:50:00.000Z', '2026-09-08T01:55:00.000Z', '10.2', '10.1'),
        ],
        executionModel,
        dataAsOf: '2026-09-09T00:00:00.000Z',
      },
    });

    expect(result.fills.map((fill) => fill.side)).toEqual(['buy', 'sell']);
    expect(result.rejects).toEqual([]);
    expect(result.ledgerMutations).toHaveLength(4);
    expect(result.ledgerMutations.every((mutation) => mutation.applied)).toBe(true);
    expect(result.events.filter((event) => event.type === 'cashSettlement')).toHaveLength(2);
    expect(result.ledger.position).toMatchObject({
      quantity: '0',
      settledQuantity: '0',
      unsettledQuantity: '0',
    });
  });

  it('plans a T+1 sell for its target open and applies same-time position settlement first', () => {
    const run = exchangeRunInput();
    const signalAt = ['2026-09-08T07:00:00.000Z', '2026-09-09T07:00:00.000Z'] as const;
    const result = runExchangeSimulation({
      ...run,
      simulation: {
        ...run.simulation,
        ticks: signalAt.map((occurredAt) => ({
          occurredAt,
          availableAt: occurredAt,
          timeframe: '5m' as const,
        })),
        sourceSeries: new Map([
          [
            'close',
            {
              ...sourceSeries([]),
              timeframe: '5m' as const,
              adjusted: true,
              points: [
                {
                  occurredAt: signalAt[0],
                  availableAt: signalAt[0],
                  value: '11',
                  status: 'available' as const,
                },
                {
                  occurredAt: signalAt[1],
                  availableAt: signalAt[1],
                  value: '-1',
                  status: 'available' as const,
                },
              ],
            },
          ],
        ]),
      },
      exchange: {
        ...run.exchange,
        bars: [
          exchangeBar('2026-09-08T01:30:00.000Z', '2026-09-08T07:00:00.000Z', '10', '9.9'),
          exchangeBar('2026-09-09T01:30:00.000Z', '2026-09-09T07:00:00.000Z', '10.1', '10'),
          exchangeBar('2026-09-10T01:30:00.000Z', '2026-09-10T07:00:00.000Z', '10.2', '10.1'),
        ],
        executionModel: frozenExchangeExecutionModel(1),
        dataAsOf: '2026-09-11T00:00:00.000Z',
      },
    });

    const positionSettlementIndex = result.events.findIndex(
      (event) =>
        event.type === 'cashSettlement' &&
        (event.payload as SimulationSettlement).kind === 'position',
    );
    const sellFillIndex = result.events.findIndex(
      (event) =>
        event.type === 'simulationFill' && (event.payload as SimulationFillRecord).side === 'sell',
    );

    expect(result.fills.map((fill) => [fill.side, fill.occurredAt])).toEqual([
      ['buy', '2026-09-09T01:30:00.000Z'],
      ['sell', '2026-09-10T01:30:00.000Z'],
    ]);
    expect(result.rejects).toEqual([]);
    expect(positionSettlementIndex).toBeGreaterThanOrEqual(0);
    expect(positionSettlementIndex).toBeLessThan(sellFillIndex);
    expect(result.ledgerMutations).toHaveLength(5);
    expect(result.ledgerMutations.every((mutation) => mutation.applied)).toBe(true);
    expect(result.ledger.position).toMatchObject({
      quantity: '0',
      settledQuantity: '0',
      unsettledQuantity: '0',
    });
  });

  it('rejects a T+1 sell whose DAY target open precedes position settlement', () => {
    const run = exchangeRunInput();
    const signalAt = ['2026-09-08T07:00:00.000Z', '2026-09-09T01:35:00.000Z'] as const;
    const result = runExchangeSimulation({
      ...run,
      simulation: {
        ...run.simulation,
        ticks: signalAt.map((occurredAt) => ({
          occurredAt,
          availableAt: occurredAt,
          timeframe: '5m' as const,
        })),
        sourceSeries: new Map([
          [
            'close',
            {
              ...sourceSeries([]),
              timeframe: '5m' as const,
              adjusted: true,
              points: [
                {
                  occurredAt: signalAt[0],
                  availableAt: signalAt[0],
                  value: '11',
                  status: 'available' as const,
                },
                {
                  occurredAt: signalAt[1],
                  availableAt: signalAt[1],
                  value: '-1',
                  status: 'available' as const,
                },
              ],
            },
          ],
        ]),
      },
      exchange: {
        ...run.exchange,
        bars: [
          exchangeBar('2026-09-08T01:30:00.000Z', '2026-09-08T07:00:00.000Z', '10', '9.9'),
          exchangeBar('2026-09-09T01:30:00.000Z', '2026-09-09T07:00:00.000Z', '10.1', '10'),
          exchangeBar('2026-09-09T01:40:00.000Z', '2026-09-09T01:45:00.000Z', '10.2', '10.1'),
          exchangeBar('2026-09-10T01:30:00.000Z', '2026-09-10T07:00:00.000Z', '10.3', '10.2'),
        ],
        executionModel: frozenExchangeExecutionModel(1),
        dataAsOf: '2026-09-11T00:00:00.000Z',
      },
    });

    expect(result.fills.map((fill) => fill.side)).toEqual(['buy']);
    expect(result.rejects).toMatchObject([
      {
        code: 'RULE_REJECTED',
        inputFacts: expect.arrayContaining(['reasonCode=INSUFFICIENT_POSITION']),
      },
    ]);
    expect(result.ledger.position).toMatchObject({
      quantity: '200',
      settledQuantity: '200',
      unsettledQuantity: '0',
    });
  });

  it('projects unsettled shares after an applied split before their target settlement', () => {
    const split: BacktestCorporateActionFact = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      type: 'SPLIT',
      ratio: '2',
      occurredAt: '2026-09-09T07:30:00.000Z',
      availableAt: '2026-09-09T07:30:00.000Z',
      provider: 'fixture',
      providerRevision: 'actions-1',
    };
    const run = exchangeRunInput({ accountingBasis: 'raw-events', corporateActions: [split] });
    const signalAt = ['2026-09-08T07:00:00.000Z', '2026-09-09T07:40:00.000Z'] as const;
    const result = runExchangeSimulation({
      ...run,
      simulation: {
        ...run.simulation,
        ticks: signalAt.map((occurredAt) => ({
          occurredAt,
          availableAt: occurredAt,
          timeframe: '5m' as const,
        })),
        sourceSeries: new Map([
          [
            'close',
            {
              ...sourceSeries([]),
              timeframe: '5m' as const,
              adjusted: false,
              points: [
                {
                  occurredAt: signalAt[0],
                  availableAt: signalAt[0],
                  value: '11',
                  status: 'available' as const,
                },
                {
                  occurredAt: signalAt[1],
                  availableAt: signalAt[1],
                  value: '-1',
                  status: 'available' as const,
                },
              ],
            },
          ],
        ]),
      },
      exchange: {
        ...run.exchange,
        bars: [
          exchangeBar('2026-09-08T01:30:00.000Z', '2026-09-08T07:00:00.000Z', '10', '9.9'),
          exchangeBar('2026-09-09T01:30:00.000Z', '2026-09-09T07:00:00.000Z', '10.1', '10'),
          exchangeBar('2026-09-10T01:30:00.000Z', '2026-09-10T07:00:00.000Z', '10.2', '10.1'),
        ],
        executionModel: frozenExchangeExecutionModel(1),
        dataAsOf: '2026-09-11T00:00:00.000Z',
      },
    });

    expect(result.corporateActionResults).toMatchObject([{ applied: true, published: true }]);
    expect(result.fills.map((fill) => [fill.side, fill.quantity])).toEqual([
      ['buy', '200'],
      ['sell', '400'],
    ]);
    expect(result.rejects).toEqual([]);
    expect(result.ledger.position).toMatchObject({
      quantity: '0',
      settledQuantity: '0',
      unsettledQuantity: '0',
    });
  });

  it('sizes a qfq normalized run from its frozen segment, reserves cash, ignores split and dividend postings, and preserves T+1 execution order', () => {
    const qfqSnapshot = JSON.parse(
      readFileSync(
        new URL('../../schemas/fixtures/execution-price.normalized-snapshot.json', import.meta.url),
        'utf8',
      ),
    ) as {
      priceBasis: { adjustment: string; quantityBasis: string; dividendMeaning: string };
      accountingBasis: string;
    };
    expect(qfqSnapshot).toMatchObject({
      priceBasis: {
        adjustment: 'qfq',
        quantityBasis: 'normalized-units',
        dividendMeaning: 'provider-defined',
      },
      accountingBasis: 'normalized-series',
    });
    const split: BacktestCorporateActionFact = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      type: 'SPLIT',
      ratio: '2',
      occurredAt: '2026-09-09T07:30:00.000Z',
      availableAt: '2026-09-09T07:30:00.000Z',
      provider: 'qfq-golden-fixture',
      providerRevision: 'qfq-snapshot-1',
    };
    const dividend: BacktestCorporateActionFact = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      type: 'CASH_DIVIDEND',
      cashAmount: '0.088',
      currency: 'CNY',
      occurredAt: '2026-09-09T07:35:00.000Z',
      availableAt: '2026-09-09T07:35:00.000Z',
      provider: 'qfq-golden-fixture',
      providerRevision: 'qfq-snapshot-1',
    };
    const run = exchangeRunInput({
      accountingBasis: 'normalized-series',
      corporateActions: [split, dividend],
    });
    const signalAt = ['2026-09-08T07:00:00.000Z', '2026-09-09T07:50:00.000Z'] as const;
    const input = {
      ...run,
      simulation: {
        ...run.simulation,
        strategy: { ...strategy(compare('gt', '5')), primaryTimeframe: '5m' as const },
        ticks: signalAt.map((occurredAt) => ({
          occurredAt,
          availableAt: occurredAt,
          timeframe: '5m' as const,
        })),
        sourceSeries: new Map([
          [
            'close',
            {
              ...sourceSeries([]),
              timeframe: '5m' as const,
              adjusted: true,
              points: [
                {
                  occurredAt: signalAt[0],
                  availableAt: signalAt[0],
                  value: '6',
                  status: 'available' as const,
                },
                {
                  occurredAt: signalAt[1],
                  availableAt: signalAt[1],
                  value: '-1',
                  status: 'available' as const,
                },
              ],
            },
          ],
        ]),
      },
      exchange: {
        ...run.exchange,
        bars: [
          exchangeBar('2026-09-09T01:30:00.000Z', '2026-09-09T01:35:00.000Z', '5', '5'),
          exchangeBar('2026-09-10T01:30:00.000Z', '2026-09-10T01:35:00.000Z', '5', '5'),
        ],
        executionModel: frozenNormalizedExecutionModel(1),
        dataAsOf: '2026-09-11T00:00:00.000Z',
        sizingForIntent: (
          intent: { side: 'buy' | 'sell'; occurredAt: string; availableAt: string },
          state: { position: { quantity: string } },
        ) => ({
          accountingBasis: 'normalized-series' as const,
          rule:
            intent.side === 'buy'
              ? ({ type: 'fixedAmount', amount: '500' } as const)
              : ({ type: 'targetWeight', weight: '0.5' } as const),
          executionCurrency: 'CNY' as const,
          currentQuantity: state.position.quantity,
          evaluationAt: intent.occurredAt,
          price: {
            value: '5',
            occurredAt: intent.occurredAt,
            availableAt: intent.availableAt,
          },
          ...(intent.side === 'sell'
            ? {
                equity: {
                  amount: '500',
                  currency: 'CNY' as const,
                  occurredAt: intent.occurredAt,
                  availableAt: intent.availableAt,
                },
              }
            : {}),
        }),
      },
    };
    const result = runExchangeSimulation(input);

    const positionSettlementIndex = result.events.findIndex(
      (event) =>
        event.type === 'cashSettlement' &&
        (event.payload as SimulationSettlement).kind === 'position',
    );
    const sellFillIndex = result.events.findIndex(
      (event) =>
        event.type === 'simulationFill' && (event.payload as SimulationFillRecord).side === 'sell',
    );

    expect(
      result.fills.map((fill) => [fill.side, fill.quantity, fill.price, fill.occurredAt]),
    ).toEqual([
      ['buy', '100', '5', '2026-09-09T01:30:00.000Z'],
      ['sell', '50', '5', '2026-09-10T01:30:00.000Z'],
    ]);
    expect(positionSettlementIndex).toBeGreaterThanOrEqual(0);
    expect(positionSettlementIndex).toBeLessThan(sellFillIndex);
    expect(result.corporateActionResults).toMatchObject([
      { applied: false, code: 'CORPORATE_ACTION_IGNORED' },
      { applied: false, code: 'CORPORATE_ACTION_IGNORED' },
    ]);
    expect(result.ledgerMutations.every((mutation) => mutation.applied)).toBe(true);
    expect(result.ledger).toMatchObject({
      position: { quantity: '50' },
      cash: { CNY: { settled: '4750', unsettled: '0' } },
    });
  });

  it('fails closed when normalized sizing has no frozen applicable segment', () => {
    const run = exchangeRunInput({ accountingBasis: 'normalized-series' });
    const sizingForIntent = (intent: SimulationTargetIntent, state: SimulationLedgerState) => ({
      accountingBasis: 'normalized-series' as const,
      normalizedExecution: normalizedExecutionAssumptions,
      rule: { type: 'fixedAmount' as const, amount: '500' },
      executionCurrency: 'CNY' as const,
      currentQuantity: state.position.quantity,
      evaluationAt: intent.occurredAt,
      price: {
        value: '5',
        occurredAt: intent.occurredAt,
        availableAt: intent.availableAt,
      },
    });
    const runWithModel = (executionModel?: FrozenExecutionModel) =>
      runExchangeSimulation({
        ...run,
        exchange: {
          ...run.exchange,
          ...(executionModel ? { executionModel, dataAsOf: '2026-09-11T00:00:00.000Z' } : {}),
          sizingForIntent,
        },
      });
    const normalizedModel = frozenNormalizedExecutionModel(0);
    const outsideRange = {
      start: '2026-09-09',
      end: '2026-09-10',
    };
    const nonApplicableModel: FrozenExecutionModel = {
      ...normalizedModel,
      scope: { ...normalizedModel.scope, range: outsideRange },
      segments: normalizedModel.segments.map((segment) => ({ ...segment, range: outsideRange })),
    };
    const results = [
      runWithModel(),
      runWithModel(frozenExchangeExecutionModel(0)),
      runWithModel(nonApplicableModel),
    ];

    for (const result of results) {
      expect(result.fills).toEqual([]);
      expect(result.rejects).toMatchObject([
        {
          code: 'RULE_REJECTED',
          reason: '缺少有效的归一化执行研究假设',
          inputFacts: ['normalizedExecution=missing-or-incompatible'],
        },
      ]);
      expect(result.ledger.cash.CNY.settled).toBe('5000');
    }
  });

  it('rejects raw and normalized sizing basis mismatches', () => {
    const run = exchangeRunInput({ accountingBasis: 'raw-events' });
    expect(() =>
      runExchangeSimulation({
        ...run,
        exchange: {
          ...run.exchange,
          sizingForIntent: (intent, state) => ({
            accountingBasis: 'normalized-series',
            rule: { type: 'fixedAmount', amount: '500' },
            executionCurrency: 'CNY',
            currentQuantity: state.position.quantity,
            evaluationAt: intent.occurredAt,
            price: {
              value: '5',
              occurredAt: intent.occurredAt,
              availableAt: intent.availableAt,
            },
          }),
        },
      }),
    ).toThrow('Sizing 与 ExchangeSimulationRunInput 的 accountingBasis 不一致');
  });
});
