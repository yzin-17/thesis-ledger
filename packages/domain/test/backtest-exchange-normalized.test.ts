import { describe, expect, it } from 'vitest';
import {
  ExchangeMarketSimulation,
  SimulationLedger,
  type ExchangeMarketSimulationInput,
  type FrozenExecutionModel,
} from '../src/index.js';
import { symbol, order, input } from './backtest-exchange.fixtures.js';

const normalizedExecutionModel = (): FrozenExecutionModel => ({
  schemaVersion: 'execution-model-v1',
  id: 'normalized-cn-fixture',
  version: 'normalized-v1',
  scope: {
    symbol: symbol.CN,
    market: 'CN',
    instrumentType: 'STOCK',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2026-09-08', end: '2026-09-09' },
  },
  segments: [
    {
      id: 'normalized-research',
      range: { start: '2026-09-08', end: '2026-09-09' },
      source: { kind: 'researchPreset', configuredAt: '2026-09-07T00:00:00.000Z' },
      assumptions: ['连续归一化单位和模拟成交额费用'],
      fees: {
        currency: 'CNY',
        rounding: { mode: 'halfUp', decimalPlaces: 2 },
        collection: 'perFillPerCharge',
        commission: {
          treatment: 'charged',
          side: 'both',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'amount', amount: '0.05' },
        },
        stampDuty: {
          treatment: 'charged',
          side: 'sell',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.001',
          minimum: { kind: 'none' },
        },
        transferFee: { treatment: 'notApplicable', reason: '测试不收取' },
        regulatoryFee: { treatment: 'notApplicable', reason: '测试不收取' },
        handlingFee: { treatment: 'notApplicable', reason: '测试不收取' },
      },
      execution: {
        mode: 'exchange',
        calendarMarket: 'CN',
        reserveCashAt: 'orderAccepted',
        buyDebitAt: 'fill',
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: { kind: 'noDailyLimit', reason: '归一化连续价格坐标' },
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
});

const normalizedInput = (overrides: Partial<ExchangeMarketSimulationInput> = {}) =>
  input('CN', {
    accountingBasis: 'normalized-series',
    executionModel: normalizedExecutionModel(),
    dataAsOf: '2026-09-10T00:00:00.000Z',
    order: order('CN', { quantity: '1.5' }),
    costs: {
      version: 'normalized-cost-1',
      slippageRate: '0.01',
      commissionRate: '0',
      minimumCommission: { amount: '0', currency: 'CNY' },
    },
    bars: [
      {
        occurredAt: '2026-09-08T01:45:00.000Z',
        availableAt: '2026-09-08T01:45:00.000Z',
        openedAt: '2026-09-08T01:40:00.000Z',
        openAvailableAt: '2026-09-08T01:40:00.000Z',
        previousCloseAvailableAt: '2026-09-08T01:41:00.000Z',
        open: '10.103',
        previousClose: '8.9',
      },
    ],
    ...overrides,
  });

describe('ExchangeMarketSimulation normalized-series execution', () => {
  it('fills continuous units at a non-tick adjusted open without using raw price rules', () => {
    const plan = new ExchangeMarketSimulation().plan(normalizedInput());

    expect(plan.status).toBe('filled');
    if (plan.status !== 'filled') return;
    expect(plan.fill).toMatchObject({
      quantity: '1.5',
      price: '10.20403',
      occurredAt: '2026-09-08T01:40:00.000Z',
    });
    expect(plan.chargeBreakdown).toEqual([
      { code: 'commission', amount: '0.15', currency: 'CNY', source: 'executionModel' },
    ]);
    expect(plan.cashReservation).toMatchObject({ amount: '15.456045', currency: 'CNY' });
    expect(plan.ruleTrace).toMatchObject({
      accountingBasis: 'normalized-series',
      priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal',
      segmentId: 'normalized-research',
    });
    expect(plan.settlement.positionAvailableOn).toBe('2026-09-09');
  });

  it('applies model minimum fees and rejects a fill that cannot afford them', () => {
    const simulation = new ExchangeMarketSimulation();
    const unaffordable = simulation.plan(
      normalizedInput({
        order: order('CN', { quantity: '0.001' }),
        account: { settledCash: '0.06', availableQuantity: '0' },
      }),
    );
    const affordable = simulation.plan(
      normalizedInput({
        order: order('CN', { quantity: '0.001' }),
        account: { settledCash: '0.061', availableQuantity: '0' },
      }),
    );

    expect(unaffordable).toMatchObject({
      status: 'rejected',
      reject: { code: 'INSUFFICIENT_CASH' },
    });
    expect(affordable).toMatchObject({
      status: 'filled',
      fill: { quantity: '0.001', charges: [{ amount: '0.05', currency: 'CNY' }] },
      cashReservation: { amount: '0.06020403', currency: 'CNY' },
    });
  });

  it('keeps fractional normalized holdings unchanged by a second split or dividend posting', () => {
    const plan = new ExchangeMarketSimulation().plan(
      normalizedInput({
        order: order('CN', { quantity: '0.25' }),
        account: { settledCash: '20', availableQuantity: '0' },
      }),
    );
    expect(plan.status).toBe('filled');
    if (plan.status !== 'filled') return;
    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: symbol.CN,
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
      },
      baseCurrency: 'CNY',
      accountingBasis: 'normalized-series',
      initialCash: { CNY: '20' },
    });
    expect(
      ledger.reserveCash(
        plan.cashReservation!.reservationId,
        plan.cashReservation!.currency,
        plan.cashReservation!.amount,
      ),
    ).toMatchObject({ accepted: true });
    expect(ledger.applyEvent({ type: 'fill', payload: plan.ledgerFill })).toMatchObject({
      applied: true,
      state: { position: { quantity: '0.25' } },
    });
    for (const settlement of plan.settlement.ledgerSettlements) {
      expect(
        ledger.applyEvent({ type: 'settlement', payload: settlement }, settlement.availableAt),
      ).toMatchObject({
        applied: true,
      });
    }
    const beforeActions = ledger.snapshot();
    const split = ledger.applyEvent({
      type: 'split',
      payload: {
        eventId: 'normalized-exchange-split',
        executionSymbol: symbol.CN,
        ratio: '2',
        occurredAt: '2026-09-09T02:00:00.000Z',
        availableAt: '2026-09-09T02:00:00.000Z',
      },
    });
    const dividend = ledger.applyEvent({
      type: 'cashDividend',
      payload: {
        eventId: 'normalized-exchange-dividend',
        executionSymbol: symbol.CN,
        amountPerShare: '1',
        currency: 'CNY',
        occurredAt: '2026-09-09T02:00:00.000Z',
        availableAt: '2026-09-09T02:00:00.000Z',
      },
    });

    expect(split).toMatchObject({ applied: false, code: 'CORPORATE_ACTION_IGNORED' });
    expect(dividend).toMatchObject({ applied: false, code: 'CORPORATE_ACTION_IGNORED' });
    expect(ledger.snapshot()).toEqual(beforeActions);
  });

  it('fails closed on missing normalized model and preserves the long-only bound', () => {
    const withoutModel = normalizedInput();
    delete withoutModel.executionModel;
    const missingModel = new ExchangeMarketSimulation().plan(withoutModel);
    const normalizedModelOnRawBasis = new ExchangeMarketSimulation().plan(
      input('CN', {
        executionModel: normalizedExecutionModel(),
        dataAsOf: '2026-09-10T00:00:00.000Z',
      }),
    );
    const oversell = new ExchangeMarketSimulation().plan(
      normalizedInput({
        order: order('CN', { side: 'sell', quantity: '1.5' }),
        account: { settledCash: '100', availableQuantity: '1' },
      }),
    );

    expect(missingModel).toMatchObject({ status: 'rejected', reject: { code: 'RULE_REJECTED' } });
    expect(normalizedModelOnRawBasis).toMatchObject({
      status: 'rejected',
      reject: { code: 'RULE_REJECTED', reason: '归一化执行模型不能用于原始份额记账' },
    });
    expect(oversell).toMatchObject({ status: 'rejected', reject: { code: 'RULE_REJECTED' } });
  });
});
