import { describe, expect, it } from 'vitest';
import { SimulationLedger } from '../src/simulation-ledger.js';
import {
  createCorporateActionPort,
  type BacktestCorporateActionFact,
} from '../src/backtest-corporate-actions.js';
import {
  corporateActionCashSettlement,
  scheduledCorporateActions,
} from '../src/backtest-corporate-scheduling.js';
import { runDeterministicSimulation } from '../src/backtest-simulation.js';
import { strategy } from './backtest-simulation.fixtures.js';
import type { SimulationSettlement } from '../src/simulation-ledger.js';

const instrument = {
  symbol: '510300.SH',
  market: 'CN',
  assetType: 'etf',
  currency: 'CNY',
} as const;
const ex = '2023-01-16T01:30:00Z';
const payment = '2023-01-19T01:30:00Z';
const fact: BacktestCorporateActionFact = {
  symbol: instrument.symbol,
  market: 'CN',
  instrumentType: 'ETF',
  type: 'CASH_DIVIDEND',
  cashAmount: '0.064',
  currency: 'CNY',
  recordDate: '2023-01-13',
  effectiveDate: '2023-01-16',
  paymentDate: '2023-01-19',
  occurredAt: '2023-01-16T00:00:00+08:00',
  availableAt: '2026-10-06T18:31:16.730840Z',
  provider: 'official-dividends',
  providerRevision: 'source-test',
  accountingAt: ex,
  cashSettlementAt: payment,
  researchClock: {
    basis: 'fixed-provider-snapshot',
    dataAsOf: '2026-10-07T00:00:00Z',
    decisionAt: ex,
  },
};
function ledger() {
  return new SimulationLedger({
    executionInstrument: instrument,
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000' },
    accountingBasis: 'raw-events',
  });
}
function trade(value: SimulationLedger, id: string, side: 'buy' | 'sell', at: string) {
  const fill = {
    eventId: id,
    fillId: id,
    executionSymbol: instrument.symbol,
    side,
    quantity: '100',
    price: '4',
    charges: [],
    currency: 'CNY' as const,
    occurredAt: at,
    availableAt: at,
  };
  expect(value.applyFill(fill).applied).toBe(true);
  expect(
    value.applySettlement({
      eventId: `${id}:settle`,
      sourceEventId: id,
      occurredAt: at,
      availableAt: at,
    }).applied,
  ).toBe(true);
}
describe('固定快照现金权益与发放模型', () => {
  it('真实事件队列在除息日创建应收并在发放日结算，无未来追加成交', () => {
    const value = ledger();
    trade(value, 'record-buy', 'buy', '2023-01-13T02:00:00Z');
    const result = runDeterministicSimulation({
      runId: 'queue-run',
      strategy: { ...strategy(), executionInstrument: instrument },
      ticks: [],
      sourceSeries: new Map(),
      corporateActions: [fact],
      corporateActionPort: createCorporateActionPort(value, instrument, 'queue-run'),
      execution: {
        applyMutation: (command) => {
          if (command.type !== 'cashSettlement') return { accepted: true };
          const applied = value.applySettlement(
            command.payload as unknown as SimulationSettlement,
            payment,
          );
          return applied.applied ? { accepted: true } : { accepted: false, reason: applied.reason };
        },
      },
    });
    expect(result.events.map((item) => [item.type, item.occurredAt])).toEqual([
      ['corporateAction', ex],
      ['cashSettlement', payment],
    ]);
    expect(value.availableCash('CNY')).toBe('606.4');
    expect(result.rejects).toEqual([]);
    expect(result.fills).toEqual([]);
  });
  it('登记日前持仓建立应收，除息后卖出不丢失分红，发放前现金不可用', () => {
    const value = ledger();
    trade(value, 'record-buy', 'buy', '2023-01-13T02:00:00Z');
    const port = createCorporateActionPort(value, instrument, 'run');
    const result = port.apply(fact, ex);
    expect(result.applied).toBe(true);
    expect(value.snapshot().cash.CNY.unsettled).toBe('6.4');
    expect(value.availableCash('CNY')).toBe('600');
    trade(value, 'after-ex-sale', 'sell', '2023-01-17T02:00:00Z');
    expect(value.availableCash('CNY')).toBe('1000');
    expect(
      value.applySettlement(
        corporateActionCashSettlement(fact, result.eventId)!,
        '2023-01-18T15:00:00Z',
      ).applied,
    ).toBe(false);
    expect(
      value.applySettlement(corporateActionCashSettlement(fact, result.eventId)!, payment).applied,
    ).toBe(true);
    expect(value.availableCash('CNY')).toBe('1006.4');
    expect(value.snapshot().cash.CNY.unsettled).toBe('0');
    expect(port.apply(fact, ex).applied).toBe(false);
  });
  it('除息日/发放日才买入不获得该次分红', () => {
    const value = ledger();
    const port = createCorporateActionPort(value, instrument, 'run');
    const result = port.apply(fact, ex);
    expect(result.applied).toBe(true);
    trade(value, 'payment-buy', 'buy', payment);
    expect(
      value.applySettlement(corporateActionCashSettlement(fact, result.eventId)!, payment).applied,
    ).toBe(true);
    expect(value.availableCash('CNY')).toBe('600');
    expect(value.snapshot().cash.CNY.unsettled).toBe('0');
  });
  it('调度用研究时钟，源观察不改写；没有时钟仍按旧规则拒绝', () => {
    expect(scheduledCorporateActions([fact], 'run')[0]?.availableAt).toBe(ex);
    const legacy = { ...fact };
    delete legacy.researchClock;
    delete legacy.cashSettlementAt;
    const value = ledger();
    const port = createCorporateActionPort(value, instrument, 'run');
    expect(port.apply(legacy, ex)).toMatchObject({ applied: false, code: 'FUTURE_DATA' });
    expect(fact.availableAt).toBe('2026-10-06T18:31:16.730840Z');
  });
  it('未结算持仓不提前授予资格，晚于冻结的观察及无效现金调度拒绝', () => {
    const value = ledger();
    value.applyFill({
      eventId: 'unsettled',
      fillId: 'unsettled',
      executionSymbol: instrument.symbol,
      side: 'buy',
      quantity: '100',
      price: '4',
      charges: [],
      currency: 'CNY',
      occurredAt: '2023-01-13T02:00:00Z',
      availableAt: '2023-01-13T02:00:00Z',
    });
    const port = createCorporateActionPort(value, instrument, 'run');
    expect(port.apply(fact, ex).applied).toBe(true);
    expect(value.snapshot().cash.CNY.unsettled).toBe('-400');
    expect(() =>
      scheduledCorporateActions([{ ...fact, availableAt: '2026-10-08T00:00:00Z' }], 'run'),
    ).toThrow();
    expect(() =>
      corporateActionCashSettlement({ ...fact, cashSettlementAt: '2023-01-15T00:00:00Z' }, 'run'),
    ).toThrow();
  });
});
