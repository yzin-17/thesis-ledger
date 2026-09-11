import { describe, expect, it } from 'vitest';
import {
  CnNavSimulation,
  ExchangeMarketSimulation,
  SimulationLedger,
  VersionedExecutionRules,
  cnTradingCalendar,
  tradingCalendars,
  type CnNavSimulationConfig,
  type ExecutionRuleFacts,
  type ExchangeMarketSimulationInput,
  type FrozenExecutionModel,
  type SimulationLedgerConfig,
} from '../src/index.js';

const exchangeModel = (): FrozenExecutionModel => ({
  schemaVersion: 'execution-model-v1',
  id: 'cn-600519-research-2024q1',
  version: '1',
  scope: {
    symbol: '600519.SH',
    market: 'CN',
    instrumentType: 'STOCK',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2026-09-08', end: '2026-09-09' },
  },
  segments: [
    {
      id: '2026-09-08',
      range: { start: '2026-09-08', end: '2026-09-08' },
      source: { kind: 'researchPreset', configuredAt: '2026-09-10T00:00:00+08:00' },
      assumptions: ['仅用于受控研究模型测试'],
      fees: {
        currency: 'CNY',
        rounding: { mode: 'halfUp', decimalPlaces: 2 },
        collection: 'perFillPerCharge',
        commission: {
          treatment: 'charged',
          side: 'both',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.0003',
          minimum: { kind: 'amount', amount: '5' },
        },
        stampDuty: {
          treatment: 'charged',
          side: 'sell',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.0005',
          minimum: { kind: 'none' },
        },
        transferFee: {
          treatment: 'charged',
          side: 'both',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.00001',
          minimum: { kind: 'none' },
        },
        regulatoryFee: { treatment: 'includedInCommission', reason: '已包含' },
        handlingFee: { treatment: 'includedInCommission', reason: '已包含' },
      },
      execution: {
        mode: 'exchange',
        calendarMarket: 'CN',
        reserveCashAt: 'orderAccepted',
        buyDebitAt: 'fill',
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: {
          kind: 'dailyLimit',
          reference: 'previousRawClose',
          maxUpRatio: '0.1',
          maxDownRatio: '0.1',
          rounding: 'halfUpToTick',
          minimumDistanceTicks: 1,
          minimumPriceTicks: 1,
        },
      },
    },
    {
      id: '2026-09-09',
      range: { start: '2026-09-09', end: '2026-09-09' },
      source: { kind: 'researchPreset', configuredAt: '2026-09-10T00:00:00+08:00' },
      assumptions: ['第二段仅用于验证按日期选段'],
      fees: {
        currency: 'CNY',
        rounding: { mode: 'halfUp', decimalPlaces: 2 },
        collection: 'perFillPerCharge',
        commission: {
          treatment: 'charged',
          side: 'both',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.0004',
          minimum: { kind: 'amount', amount: '5' },
        },
        stampDuty: {
          treatment: 'charged',
          side: 'sell',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.0005',
          minimum: { kind: 'none' },
        },
        transferFee: {
          treatment: 'charged',
          side: 'both',
          basis: 'turnover',
          currency: 'CNY',
          rate: '0.00001',
          minimum: { kind: 'none' },
        },
        regulatoryFee: { treatment: 'includedInCommission', reason: '已包含' },
        handlingFee: { treatment: 'includedInCommission', reason: '已包含' },
      },
      execution: {
        mode: 'exchange',
        calendarMarket: 'CN',
        reserveCashAt: 'orderAccepted',
        buyDebitAt: 'fill',
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: { kind: 'noDailyLimit', reason: '受控测试' },
      },
    },
  ],
});

const exchangeRules = (): VersionedExecutionRules => {
  const facts: ExecutionRuleFacts = {
    version: 'legacy-rules-that-must-not-charge',
    calendar: tradingCalendars.CN,
    calendarProvider: 'fixture',
    calendarProviderRevision: 'calendar-1',
    calendarAvailableAt: '2026-09-01T00:00:00.000Z',
    instrument: {
      symbol: '600519.SH',
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
    price: { reference: 'previousClose', maxUpRatio: '0.2', maxDownRatio: '0.2' },
    positionSettlement: { sellableAfterTradingDays: 0 },
    cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 5 },
    statutoryCharges: [{ code: 'OLD_CHARGE', side: 'both', rate: '0.9' }],
  };
  return new VersionedExecutionRules(facts);
};

const exchangeInput = (
  overrides: Partial<ExchangeMarketSimulationInput> = {},
): ExchangeMarketSimulationInput => ({
  rules: exchangeRules(),
  calendar: tradingCalendars.CN,
  currency: 'CNY',
  bars: [
    {
      occurredAt: '2026-09-08T01:35:00.000Z',
      availableAt: '2026-09-08T01:35:00.000Z',
      openedAt: '2026-09-08T01:30:00.000Z',
      openAvailableAt: '2026-09-08T01:30:00.000Z',
      previousCloseAvailableAt: '2026-09-08T01:30:00.000Z',
      open: '10.00',
      previousClose: '9.99',
    },
  ],
  account: { settledCash: '2000', availableQuantity: '1000' },
  costs: { version: 'strategy-cost', slippageRate: '0.001', commissionRate: '0.9' },
  order: {
    intentId: 'intent-1',
    signalId: 'signal-1',
    orderId: 'order-1',
    executionSymbol: '600519.SH',
    market: 'CN',
    side: 'buy',
    reason: 'signal',
    occurredAt: '2026-09-08T01:29:00.000Z',
    availableAt: '2026-09-08T01:29:00.000Z',
    quantity: '100',
  },
  executionModel: exchangeModel(),
  dataAsOf: '2026-09-10T00:00:00.000Z',
  ...overrides,
});

const navModel = (): FrozenExecutionModel => ({
  schemaVersion: 'execution-model-v1',
  id: 'cn-fund-research',
  version: '1',
  scope: {
    symbol: 'FUND.CN',
    market: 'CN',
    instrumentType: 'NAV_FUND',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2026-09-08', end: '2026-09-15' },
  },
  segments: [
    {
      id: 'fund-2026',
      range: { start: '2026-09-08', end: '2026-09-15' },
      source: { kind: 'researchPreset', configuredAt: '2026-09-10T00:00:00+08:00' },
      assumptions: ['受控 NAV 生命周期测试'],
      fees: null,
      execution: {
        mode: 'nav',
        calendarMarket: 'CN',
        cutoffLocalTime: '14:00',
        cutoffBoundary: 'atOrAfterNextTradingDay',
        navDate: 'acceptedApplicationTradingDate',
        navAvailability: 'providerAvailableAt',
        reserveCashAt: 'orderAccepted',
        subscriptionDebitAt: 'confirmation',
        confirmationAfterTradingDays: 1,
        sellableAfterConfirmationTradingDays: 1,
        redemptionReinvestableAfterConfirmationTradingDays: 2,
        subscriptionFee: {
          treatment: 'charged',
          side: 'buy',
          basis: 'subscriptionApplicationAmount',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
        redemptionFee: {
          treatment: 'charged',
          side: 'sell',
          basis: 'redemptionGrossProceeds',
          currency: 'CNY',
          rate: '0.01',
          minimum: { kind: 'none' },
          rounding: { mode: 'halfUp', decimalPlaces: 2 },
          collection: 'perApplication',
          collectedAt: 'confirmation',
        },
      },
    },
  ],
});

const navConfig = (): CnNavSimulationConfig => {
  const ledgerConfig: SimulationLedgerConfig = {
    executionInstrument: {
      symbol: 'FUND.CN',
      market: 'CN',
      assetType: 'fund',
      currency: 'CNY',
    },
    baseCurrency: 'CNY',
    initialCash: { CNY: '1000' },
  };
  return {
    executionInstrument: ledgerConfig.executionInstrument,
    ledgerConfig,
    calendar: cnTradingCalendar,
    calendarVersion: 'cn-calendar-1',
    cutoffLocalTime: '15:00',
    timeframe: '1d',
    executionModel: navModel(),
    dataAsOf: '2026-09-30T00:00:00.000Z',
  };
};

describe('冻结 execution-model-v1 的 Runner 消费', () => {
  it('按日期分段计费，忽略旧规费，应用 tick 舍入并返回现金占款', () => {
    const plan = new ExchangeMarketSimulation().plan(exchangeInput());
    expect(plan).toMatchObject({
      status: 'filled',
      chargeBreakdown: [
        { code: 'commission', amount: '5', source: 'executionModel' },
        { code: 'transferFee', amount: '0.01', source: 'executionModel' },
      ],
      cashReservation: { amount: '1006.01' },
    });
    if (plan.status !== 'filled') return;
    expect(plan.fill.price).toBe('10.01');
    expect(plan.fill.charges.map((charge) => charge.amount)).toEqual(['5', '0.01']);
    expect(plan.ledgerFill.cashReservationId).toBe('order-1:cash-reservation');

    const later = new ExchangeMarketSimulation().plan(
      exchangeInput({
        bars: [
          {
            ...exchangeInput().bars[0]!,
            openedAt: '2026-09-09T01:30:00.000Z',
            occurredAt: '2026-09-09T01:35:00.000Z',
            availableAt: '2026-09-09T01:35:00.000Z',
            openAvailableAt: '2026-09-09T01:30:00.000Z',
            previousCloseAvailableAt: '2026-09-09T01:30:00.000Z',
          },
        ],
        order: {
          ...exchangeInput().order,
          orderId: 'order-2',
          occurredAt: '2026-09-09T01:29:00.000Z',
          availableAt: '2026-09-09T01:29:00.000Z',
        },
      }),
    );
    expect(later).toMatchObject({
      status: 'filled',
      chargeBreakdown: [
        expect.objectContaining({ code: 'commission', amount: '5' }),
        expect.objectContaining({ code: 'transferFee', amount: '0.01' }),
      ],
    });
  });

  it('用模型占款防止现金复用，并按模型的 CN 可卖与卖出款再投资时点交收', () => {
    const buy = new ExchangeMarketSimulation().plan(exchangeInput());
    expect(buy.status).toBe('filled');
    if (buy.status !== 'filled') return;
    const ledger = new SimulationLedger({
      executionInstrument: {
        symbol: '600519.SH',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
      },
      baseCurrency: 'CNY',
      initialCash: { CNY: '2000' },
    });
    expect(
      ledger.reserveCash(buy.cashReservation!.reservationId, 'CNY', buy.cashReservation!.amount),
    ).toMatchObject({ accepted: true });
    expect(ledger.availableCash('CNY')).toBe('993.99');
    expect(ledger.applyFill(buy.ledgerFill)).toMatchObject({ applied: true });
    for (const settlement of buy.settlement.ledgerSettlements) {
      expect(ledger.applySettlement(settlement, settlement.availableAt)).toMatchObject({
        applied: true,
      });
    }
    const earlySell = new ExchangeMarketSimulation().plan(
      exchangeInput({
        order: {
          ...exchangeInput().order,
          orderId: 'sell-early',
          side: 'sell',
        },
        account: { settledCash: '993.99', availableQuantity: '1000', acquiredOn: '2026-09-08' },
      }),
    );
    expect(earlySell).toMatchObject({ status: 'rejected', reject: { code: 'RULE_REJECTED' } });

    const sell = new ExchangeMarketSimulation().plan(
      exchangeInput({
        bars: [
          {
            ...exchangeInput().bars[0]!,
            openedAt: '2026-09-09T01:30:00.000Z',
            occurredAt: '2026-09-09T01:35:00.000Z',
            availableAt: '2026-09-09T01:35:00.000Z',
            openAvailableAt: '2026-09-09T01:30:00.000Z',
            previousCloseAvailableAt: '2026-09-09T01:30:00.000Z',
            open: '11.00',
            previousClose: '10.00',
          },
        ],
        order: {
          ...exchangeInput().order,
          orderId: 'sell-1',
          side: 'sell',
          occurredAt: '2026-09-09T01:29:00.000Z',
          availableAt: '2026-09-09T01:29:00.000Z',
        },
        account: { settledCash: '993.99', availableQuantity: '1000', acquiredOn: '2026-09-08' },
      }),
    );
    expect(sell).toMatchObject({ status: 'filled', settlement: { cashAvailableOn: '2026-09-09' } });
  });

  it('按冻结 NAV 生命周期执行申购和赎回，模型费用不采纳请求旧费用', () => {
    const simulation = new CnNavSimulation(navConfig());
    const requestAt = '2026-09-08T05:00:00.000Z';
    expect(
      simulation.submitRequest({
        eventId: 'nav-1:request',
        requestId: 'nav-1',
        requestType: 'subscribe',
        executionSymbol: 'FUND.CN',
        requestAt,
        amount: '100',
        fee: '999',
        occurredAt: requestAt,
        availableAt: requestAt,
      }),
    ).toMatchObject({ applied: true });
    expect(simulation.snapshot().requests[0]).toMatchObject({ fee: '1' });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'nav-1:cutoff',
          requestId: 'nav-1',
          cutoffAt: '2026-09-08T14:00:00+08:00',
          valuationDate: '2026-09-08',
          occurredAt: '2026-09-08T14:00:00+08:00',
          availableAt: '2026-09-08T14:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'nav',
        payload: {
          eventId: 'nav-1:fact',
          requestId: 'nav-1',
          fact: {
            symbol: 'FUND.CN',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            nav: '10',
            valuationDate: '2026-09-08',
            occurredAt: '2026-09-08T23:00:00Z',
            availableAt: '2026-09-09T01:00:00Z',
            provider: 'fixture',
            providerRevision: 'nav-1',
            freshness: 'delayed',
            quality: 'complete',
            status: 'supported',
          },
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'confirmation',
        payload: {
          eventId: 'nav-1:confirmation',
          requestId: 'nav-1',
          occurredAt: '2026-09-09T02:00:00Z',
          availableAt: '2026-09-09T02:00:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'shareAvailable',
        payload: {
          eventId: 'nav-1:shares-early',
          requestId: 'nav-1',
          shares: '10',
          occurredAt: '2026-09-09T03:00:00Z',
          availableAt: '2026-09-09T03:00:00Z',
        },
      }),
    ).toMatchObject({ applied: false, code: 'NAV_DELAYED' });
    expect(
      simulation.applyEvent({
        type: 'shareAvailable',
        payload: {
          eventId: 'nav-1:shares',
          requestId: 'nav-1',
          shares: '10',
          occurredAt: '2026-09-10T01:30:00Z',
          availableAt: '2026-09-10T01:30:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'cashSettlement',
        payload: {
          eventId: 'nav-1:cash',
          requestId: 'nav-1',
          amount: '101',
          occurredAt: '2026-09-09T02:00:00Z',
          availableAt: '2026-09-09T02:00:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(simulation.snapshot().requests[0]).toMatchObject({ status: 'settled' });

    const redemptionRequestAt = '2026-09-11T05:00:00.000Z';
    expect(
      simulation.submitRequest({
        eventId: 'nav-2:request',
        requestId: 'nav-2',
        requestType: 'redeem',
        executionSymbol: 'FUND.CN',
        requestAt: redemptionRequestAt,
        shares: '5',
        fee: '999',
        occurredAt: redemptionRequestAt,
        availableAt: redemptionRequestAt,
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'cutoff',
        payload: {
          eventId: 'nav-2:cutoff',
          requestId: 'nav-2',
          cutoffAt: '2026-09-11T14:00:00+08:00',
          valuationDate: '2026-09-11',
          occurredAt: '2026-09-11T14:00:00+08:00',
          availableAt: '2026-09-11T14:00:00+08:00',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'nav',
        payload: {
          eventId: 'nav-2:fact',
          requestId: 'nav-2',
          fact: {
            symbol: 'FUND.CN',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            nav: '10.5',
            valuationDate: '2026-09-11',
            occurredAt: '2026-09-11T23:00:00Z',
            availableAt: '2026-09-14T01:00:00Z',
            provider: 'fixture',
            providerRevision: 'nav-2',
            freshness: 'delayed',
            quality: 'complete',
            status: 'supported',
          },
        },
      }),
    ).toMatchObject({ applied: true });
    expect(
      simulation.applyEvent({
        type: 'confirmation',
        payload: {
          eventId: 'nav-2:confirmation',
          requestId: 'nav-2',
          occurredAt: '2026-09-14T02:00:00Z',
          availableAt: '2026-09-14T02:00:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(simulation.snapshot().requests[1]).toMatchObject({
      fee: '0.53',
      expectedCashSettlement: '51.97',
    });
    expect(
      simulation.applyEvent({
        type: 'redemptionCash',
        payload: {
          eventId: 'nav-2:cash',
          requestId: 'nav-2',
          amount: '51.97',
          occurredAt: '2026-09-16T01:30:00Z',
          availableAt: '2026-09-16T01:30:00Z',
        },
      }),
    ).toMatchObject({ applied: true });
    expect(simulation.snapshot()).toMatchObject({
      ledger: {
        cash: { CNY: { settled: '950.97', unsettled: '0' } },
        position: { quantity: '5', settledQuantity: '5' },
      },
    });
  });
});
