import { describe, expect, it } from 'vitest';
import { runExchangeSimulation, type ExchangeSimulationRunInput } from '../src/backtest-engine.js';
import { SimulationLedger } from '../src/simulation-ledger.js';
import { cnTradingCalendar } from '../src/trading-calendar.js';
import { VersionedExecutionRules } from '../src/execution-rules.js';
import type { FrozenExecutionModel } from '../src/backtest-execution-model.js';

const dates = [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
];
const opens = [11, 13, 14, 8, 7, 10, 14, 9];
const closes = [12, 13, 8, 7, 12, 13, 8, 12];
const instrument = {
  symbol: '600519.SH',
  market: 'CN',
  assetType: 'stock',
  currency: 'CNY',
} as const;
const closeAt = (date: string) => `${date}T07:00:00.000Z`;
const openAt = (date: string) => `${date}T01:30:00.000Z`;

// 独立参考：固定投入 150，信号收盘价 12，故买入 12.5 单位；每笔佣金 0.001，分币 half-up。
// 只用整数分币计算，不调用被测引擎的信号、撮合、费用、Decimal 或估值函数。
function reference(length: number) {
  let cash = 100000n;
  let unitsTwice = 0n;
  let pending: 'buy' | 'sell' | undefined;
  const fills: Array<{ side: string; quantity: number; price: number; occurredAt: string }> = [];
  const intents: Array<{ side: string; occurredAt: string }> = [];
  for (let day = 0; day < length; day += 1) {
    if (pending) {
      const quantityTwice = pending === 'buy' ? 25n : unitsTwice;
      const turnover = (quantityTwice * BigInt(opens[day]! * 100)) / 2n;
      const fee = (turnover + 500n) / 1000n;
      cash += pending === 'buy' ? -turnover - fee : turnover - fee;
      unitsTwice = pending === 'buy' ? quantityTwice : 0n;
      fills.push({
        side: pending,
        quantity: Number(quantityTwice) / 2,
        price: opens[day]!,
        occurredAt: openAt(dates[day]!),
      });
      pending = undefined;
    }
    if (unitsTwice === 0n && closes[day]! > 10) pending = 'buy';
    else if (unitsTwice > 0n && closes[day]! < 9) pending = 'sell';
    if (pending) intents.push({ side: pending, occurredAt: closeAt(dates[day]!) });
  }
  const equity = cash + (unitsTwice * BigInt(closes[length - 1]! * 100)) / 2n;
  return {
    cash: Number(cash) / 100,
    quantity: Number(unitsTwice) / 2,
    equity: Number(equity) / 100,
    fills,
    intents,
  };
}

function engineInput(length: number, scale: number): ExchangeSimulationRunInput {
  const range = { start: dates[0]!, end: dates.at(-1)! };
  const rules = new VersionedExecutionRules({
    version: 'reference-rules',
    calendar: cnTradingCalendar,
    calendarProvider: 'fixture',
    calendarProviderRevision: '1',
    calendarAvailableAt: '2026-09-01T00:00:00Z',
    instrument: {
      symbol: instrument.symbol,
      market: 'CN',
      instrumentType: 'STOCK',
      currency: 'CNY',
      lotSize: '100',
      tickSize: '0.01',
      tradable: true,
      provider: 'fixture',
      providerRevision: '1',
      occurredAt: '2026-09-01T00:00:00Z',
      availableAt: '2026-09-01T00:00:00Z',
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
  const model: FrozenExecutionModel = {
    schemaVersion: 'execution-model-v1',
    id: 'independent-reference',
    version: '1',
    scope: {
      symbol: instrument.symbol,
      market: 'CN',
      instrumentType: 'STOCK',
      currency: 'CNY',
      timezone: 'Asia/Shanghai',
      range,
    },
    segments: [
      {
        id: 'reference',
        range,
        source: { kind: 'userConfiguration', configuredAt: '2026-09-01T00:00:00Z' },
        assumptions: [],
        fees: {
          currency: 'CNY',
          collection: 'perFillPerCharge',
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          commission: {
            treatment: 'charged',
            side: 'both',
            basis: 'turnover',
            currency: 'CNY',
            rate: '0.001',
            minimum: { kind: 'none' },
          },
          stampDuty: { treatment: 'notApplicable', reason: '独立研究用例' },
          transferFee: { treatment: 'notApplicable', reason: '独立研究用例' },
          regulatoryFee: { treatment: 'notApplicable', reason: '独立研究用例' },
          handlingFee: { treatment: 'notApplicable', reason: '独立研究用例' },
        },
        execution: {
          mode: 'exchange',
          calendarMarket: 'CN',
          reserveCashAt: 'orderAccepted',
          buyDebitAt: 'fill',
          sellableAfterTradingDays: 1,
          saleReinvestableAfterTradingDays: 0,
          price: { kind: 'noDailyLimit', reason: '归一化研究序列' },
          normalizedExecution: {
            priceCoordinate: 'continuous-decimal',
            quantityUnits: 'continuous-normalized-decimal',
            lotSizeConstraint: 'not-applied',
            tickSizeConstraint: 'not-applied',
            dailyPriceLimit: 'not-applied',
            feeBasis: 'simulatedTurnover',
          },
        },
      },
    ],
  };
  const compare = (operator: 'gt' | 'lt', value: number) => ({
    type: 'compare' as const,
    operator,
    left: { type: 'series' as const, sourceId: 'close', field: 'close' as const },
    right: { type: 'constant' as const, value: String(value * scale) },
  });
  return {
    accountingBasis: 'normalized-series',
    ledger: new SimulationLedger({
      executionInstrument: instrument,
      baseCurrency: 'CNY',
      initialCash: { CNY: '1000' },
      accountingBasis: 'normalized-series',
    }),
    simulation: {
      runId: `reference-${length}-${scale}`,
      strategy: {
        executionInstrument: instrument,
        primaryTimeframe: '1d',
        entry: compare('gt', 10),
        exit: compare('lt', 9),
      },
      ticks: dates
        .slice(0, length)
        .map((date) => ({
          occurredAt: closeAt(date),
          availableAt: closeAt(date),
          timeframe: '1d' as const,
        })),
      sourceSeries: new Map([
        [
          'close',
          {
            sourceId: 'close',
            ...instrument,
            field: 'close',
            timeframe: '1d',
            adjusted: true,
            points: dates
              .slice(0, length)
              .map((date, index) => ({
                occurredAt: closeAt(date),
                availableAt: closeAt(date),
                value: String(closes[index]! * scale),
                status: 'available' as const,
              })),
          },
        ],
      ]),
    },
    exchange: {
      rules,
      calendar: cnTradingCalendar,
      executionModel: model,
      dataAsOf: '2026-09-24T00:00:00Z',
      costs: { version: 'reference', slippageRate: '0', commissionRate: '0' },
      bars: dates
        .slice(0, length)
        .map((date, index) => ({
          openedAt: openAt(date),
          occurredAt: closeAt(date),
          availableAt: closeAt(date),
          openAvailableAt: openAt(date),
          previousCloseAvailableAt: openAt(date),
          open: String(opens[index]! * scale),
          previousClose: String((closes[index - 1] ?? 10) * scale),
        })),
      sizingForIntent: (intent, state) => ({
        accountingBasis: 'normalized-series',
        rule:
          intent.side === 'buy'
            ? { type: 'fixedAmount', amount: '150' }
            : { type: 'targetWeight', weight: '0' },
        executionCurrency: 'CNY',
        currentQuantity: state.position.quantity,
        evaluationAt: intent.occurredAt,
        price: {
          value: String(closes[dates.indexOf(intent.occurredAt.slice(0, 10))]! * scale),
          occurredAt: intent.occurredAt,
          availableAt: intent.availableAt,
        },
        equity: {
          amount: '1000',
          currency: 'CNY',
          occurredAt: intent.occurredAt,
          availableAt: intent.availableAt,
        },
      }),
    },
  };
}

describe('归一化回测独立分币参考对照', () => {
  it.each([1, 2])('价格坐标倍率 %s 的逐日信号、成交、现金和净值一致', (scale) => {
    for (let length = 1; length <= dates.length; length += 1) {
      const expected = reference(length);
      const actual = runExchangeSimulation(engineInput(length, scale));
      expect(actual.signals.map(({ kind, occurredAt }) => ({ kind, occurredAt }))).toEqual(
        expected.intents.map(({ side, occurredAt }) => ({ kind: side === 'buy' ? 'entry' : 'exit', occurredAt })),
      );
      expect(actual.targetIntents.map(({ side, occurredAt }) => ({ side, occurredAt }))).toEqual(
        expected.intents,
      );
      expect(
        actual.fills.map(({ side, quantity, price, occurredAt }) => ({
          side,
          quantity: Number(quantity) * scale,
          price: Number(price) / scale,
          occurredAt,
        })),
      ).toEqual(expected.fills);
      const cash =
        Number(actual.ledger.cash.CNY!.settled) + Number(actual.ledger.cash.CNY!.unsettled);
      const quantity = Number(actual.ledger.position.quantity) * scale;
      expect(cash).toBe(expected.cash);
      expect(quantity).toBe(expected.quantity);
      const equity = cash + quantity * closes[length - 1]!;
      expect(Math.abs(equity - expected.equity) / expected.equity).toBeLessThanOrEqual(1e-8);
      expect(actual.ledgerMutations.every((mutation) => mutation.applied)).toBe(true);
    }
  });
});
