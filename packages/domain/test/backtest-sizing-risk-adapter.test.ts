import { describe, expect, it } from 'vitest';
import {
  createExchangeSizingAdapter,
  createRiskEvaluationAdapter,
  navRequestFromTargetIntent,
} from '../src/backtest-sizing-risk-adapter.js';
import {
  DeterministicSimulationEngine,
  type SimulationTargetIntent,
} from '../src/backtest-simulation.js';
import { cnTradingCalendar } from '../src/trading-calendar.js';
import { VersionedExecutionRules, type ExecutionRuleFacts } from '../src/execution-rules.js';
import { CnNavSimulation, type CnNavSimulationConfig } from '../src/nav-simulation.js';
import type { ExchangeMarketSimulationInput } from '../src/backtest-exchange.js';

const symbol = '600000.SH';
const intent = (side: 'buy' | 'sell' = 'buy'): SimulationTargetIntent => ({
  intentId: `intent-${side}`,
  signalId: `signal-${side}`,
  executionSymbol: symbol,
  side,
  reason: side === 'sell' ? 'risk' : 'signal',
  occurredAt: '2026-09-08T01:35:00.000Z',
  availableAt: '2026-09-08T01:35:00.000Z',
});

const rulesFacts = (): ExecutionRuleFacts => ({
  version: 'cn-execution-1',
  calendar: cnTradingCalendar,
  calendarProvider: 'fixture',
  calendarProviderRevision: 'calendar-1',
  calendarAvailableAt: '2026-09-01T00:00:00.000Z',
  instrument: {
    symbol,
    market: 'CN',
    instrumentType: 'STOCK',
    currency: 'CNY',
    lotSize: '100',
    tickSize: '0.01',
    tradable: true,
    provider: 'fixture',
    providerRevision: 'instrument-1',
    occurredAt: '2026-09-01T00:00:00.000Z',
    availableAt: '2026-09-01T00:00:00.000Z',
  },
  order: {
    type: 'Market',
    timeInForce: 'DAY',
    executionTiming: 'nextEligibleBarOpen',
    fillPolicy: 'full-or-reject',
    longOnly: true,
  },
  price: { reference: 'previousClose', maxUpRatio: '0.1', maxDownRatio: '0.1' },
  positionSettlement: { sellableAfterTradingDays: 1 },
  cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
  statutoryCharges: [],
});

const exchangeInput = (): Omit<ExchangeMarketSimulationInput, 'order'> => {
  const facts = rulesFacts();
  const rules = new VersionedExecutionRules(facts);
  return {
    rules,
    calendar: cnTradingCalendar,
    currency: 'CNY',
    bars: [
      {
        occurredAt: '2026-09-08T01:35:00.000Z',
        availableAt: '2026-09-08T01:35:00.000Z',
        openedAt: '2026-09-08T01:30:00.000Z',
        openAvailableAt: '2026-09-08T01:30:00.000Z',
        previousCloseAvailableAt: '2026-09-08T01:30:00.000Z',
        open: '10',
        previousClose: '9.9',
      },
      {
        occurredAt: '2026-09-08T01:45:00.000Z',
        availableAt: '2026-09-08T01:45:00.000Z',
        openedAt: '2026-09-08T01:40:00.000Z',
        openAvailableAt: '2026-09-08T01:40:00.000Z',
        previousCloseAvailableAt: '2026-09-08T01:40:00.000Z',
        open: '10.1',
        previousClose: '10',
      },
    ],
    account: { settledCash: '100000', availableQuantity: '1000' },
    costs: {
      version: 'cost-1',
      slippageRate: '0',
      commissionRate: '0',
      minimumCommission: { amount: '0', currency: 'CNY' },
    },
  };
};

const exchangeAdapter = () =>
  createExchangeSizingAdapter({
    sizingForIntent: (value) => ({
      rule: { type: 'fixedQuantity', quantity: '150' },
      executionCurrency: 'CNY',
      lotSize: '100',
      currentQuantity: '0',
      evaluationAt: value.occurredAt,
    }),
    orderDefaults: () => ({ market: 'CN' }),
    exchangeInputForOrder: exchangeInput,
  });

describe('T10 sizing/risk execution adapters', () => {
  it('feeds Decimal-normalized sizing into T5 and T8 next eligible open', () => {
    const adapter = exchangeAdapter();
    const result = new DeterministicSimulationEngine().run({
      runId: 'run-exchange',
      strategy: {
        executionInstrument: { symbol, market: 'CN', assetType: 'stock' },
        primaryTimeframe: '1d',
        entry: {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'close', field: 'close' },
          right: { type: 'constant', value: '10' },
        },
        exit: {
          type: 'compare',
          operator: 'lt',
          left: { type: 'series', sourceId: 'close', field: 'close' },
          right: { type: 'constant', value: '0' },
        },
      },
      ticks: [{ occurredAt: '2026-09-08T01:35:00.000Z' }],
      sourceSeries: new Map([
        [
          'close',
          {
            sourceId: 'close',
            symbol,
            market: 'CN',
            assetType: 'stock',
            field: 'close',
            timeframe: '1d',
            adjusted: false,
            points: [
              {
                occurredAt: '2026-09-08T01:35:00.000Z',
                availableAt: '2026-09-08T01:35:00.000Z',
                value: '11',
                status: 'available',
              },
            ],
          },
        ],
      ]),
      execution: adapter.port,
    });

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toMatchObject({
      quantity: '100',
      occurredAt: '2026-09-08T01:40:00.000Z',
    });
    expect(adapter.sizingFor(result.fills[0]!.orderId)).toMatchObject({
      status: 'available',
      normalizedQuantity: '100',
    });
    expect(adapter.planFor(result.fills[0]!.orderId)).toMatchObject({ status: 'filled' });
  });

  it('turns completed risk level conditions into a stable risk TargetIntent for Exchange', () => {
    const risk = createRiskEvaluationAdapter({
      riskInputAt: (context) => ({
        runId: 'run-risk',
        executionSymbol: symbol,
        rules: [{ type: 'fixedStop', percent: '0.1' }],
        position: {
          quantity: '100',
          averageCost: '10',
          holdingPeriods: 1,
          availableAt: '2026-09-08T01:00:00.000Z',
        },
        evaluation: {
          value: '9',
          occurredAt: context.tick.occurredAt,
          availableAt: context.tick.availableAt ?? context.tick.occurredAt,
          completed: true,
        },
        evaluationAt: context.tick.occurredAt,
      }),
    });
    const context = {
      tick: { occurredAt: '2026-09-08T01:35:00.000Z' },
      sourceSeries: new Map(),
    };
    const result = risk.evaluate(context);
    expect(result).toMatchObject({ status: 'available', intent: { side: 'sell', reason: 'risk' } });
    expect(risk.asSimulationRisk(context)).toMatchObject({ value: true });
    if (result.status !== 'available' || !result.intent) return;
    const adapter = exchangeAdapter();
    const order = adapter.port.toOrder!(result.intent);
    expect(order).toMatchObject({ side: 'sell', quantity: '100' });
    expect(adapter.port.validateOrder!(order)).toMatchObject({ accepted: true });
    expect(adapter.port.createFill!(order)).toMatchObject({
      side: 'sell',
      occurredAt: '2026-09-08T01:40:00.000Z',
    });
    expect(risk.evaluate(context)).toEqual(result);
  });

  it('maps NAV buy/sell intents to amount/shares without Exchange orders', () => {
    const buy = navRequestFromTargetIntent(intent('buy'), {
      requestAt: '2026-09-08T06:00:00.000Z',
      sizing: {
        rule: { type: 'fixedAmount', amount: '1000' },
        executionCurrency: 'CNY',
        lotSize: '1',
        currentQuantity: '0',
        evaluationAt: '2026-09-08T06:00:00.000Z',
        price: {
          value: '10',
          occurredAt: '2026-09-08T05:00:00.000Z',
          availableAt: '2026-09-08T05:30:00.000Z',
        },
      },
    });
    const sell = navRequestFromTargetIntent(intent('sell'), {
      requestAt: '2026-09-08T06:00:00.000Z',
      sizing: {
        rule: { type: 'fixedQuantity', quantity: '5' },
        executionCurrency: 'CNY',
        lotSize: '1',
        currentQuantity: '5',
        evaluationAt: '2026-09-08T06:00:00.000Z',
      },
    });

    expect(buy).toMatchObject({ requestType: 'subscribe', amount: '1000' });
    expect(sell).toMatchObject({ requestType: 'redeem', shares: '5' });
    expect('market' in buy).toBe(false);
  });

  it('lets the NAV adapter request enter the isolated CN NAV simulation', () => {
    const request = navRequestFromTargetIntent(intent('buy'), {
      requestAt: '2026-09-08T06:00:00.000Z',
      sizing: {
        rule: { type: 'fixedAmount', amount: '100' },
        executionCurrency: 'CNY',
        lotSize: '1',
        currentQuantity: '0',
        evaluationAt: '2026-09-08T06:00:00.000Z',
        price: {
          value: '10',
          occurredAt: '2026-09-08T05:00:00Z',
          availableAt: '2026-09-08T05:30:00Z',
        },
      },
    });
    expect(request).toMatchObject({ requestType: 'subscribe', amount: '100' });
    if (!('requestType' in request)) return;
    const config: CnNavSimulationConfig = {
      executionInstrument: { symbol: 'FUND.CN', market: 'CN', assetType: 'fund', currency: 'CNY' },
      ledgerConfig: {
        executionInstrument: {
          symbol: 'FUND.CN',
          market: 'CN',
          assetType: 'fund',
          currency: 'CNY',
        },
        baseCurrency: 'CNY',
        initialCash: { CNY: '1000' },
      },
      calendar: cnTradingCalendar,
      calendarVersion: 'cn-calendar-1',
      cutoffLocalTime: '15:00',
      timeframe: '1d',
    };
    const simulation = new CnNavSimulation(config);
    expect(simulation.submitRequest({ ...request, executionSymbol: 'FUND.CN' })).toMatchObject({
      applied: true,
    });
    expect(simulation.snapshot().requests[0]).toMatchObject({
      requestType: 'subscribe',
      requestedAmount: '100',
    });
  });
});
