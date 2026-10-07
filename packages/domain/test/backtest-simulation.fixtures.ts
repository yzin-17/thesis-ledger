import { type SimulationEngineInput } from '../src/index.js';
import type { BacktestSeries } from '../src/backtest-series.js';
import type { BacktestCorporateActionFact } from '../src/backtest-corporate-actions.js';
import type { ExchangeBarFact } from '../src/backtest-exchange.js';
import type { FrozenExecutionModel, FrozenExchangeExecutionModelSegment } from '../src/backtest-execution-model.js';
import { SimulationLedger } from '../src/simulation-ledger.js';
import { cnTradingCalendar } from '../src/trading-calendar.js';
import { VersionedExecutionRules, type ExecutionRuleFacts } from '../src/execution-rules.js';

export const point = (date: string, value: string, availableAt = `${date}T00:00:00Z`) => ({
  occurredAt: `${date}T00:00:00Z`,
  availableAt,
  value,
  status: 'available' as const,
});

export const sourceSeries = (points: BacktestSeries['points']) => ({
  sourceId: 'close',
  symbol: '600519.SH',
  market: 'CN' as const,
  assetType: 'stock' as const,
  field: 'close' as const,
  timeframe: '1d' as const,
  adjusted: false,
  points,
});

export const compare = (operator: 'eq' | 'gt' | 'lt', right: string) => ({
  type: 'compare' as const,
  operator,
  left: { type: 'series' as const, sourceId: 'close', field: 'close' as const },
  right: { type: 'constant' as const, value: right },
});

export const strategy = (entry = compare('gt', '10')) => ({
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
  entry,
  exit: compare('lt', '0'),
});

export const normalizedExecutionAssumptions = {
  priceCoordinate: 'continuous-decimal',
  quantityUnits: 'continuous-normalized-decimal',
  lotSizeConstraint: 'not-applied',
  tickSizeConstraint: 'not-applied',
  dailyPriceLimit: 'not-applied',
  feeBasis: 'simulatedTurnover',
} as const;

export const baseInput = (
  overrides: Partial<SimulationEngineInput> = {},
): SimulationEngineInput => ({
  runId: 'run-1',
  strategy: strategy(),
  ticks: [{ occurredAt: '2025-01-01T00:00:00Z' }],
  sourceSeries: new Map([['close', sourceSeries([point('2025-01-01', '11')])]]),
  ...overrides,
});

export const exchangeRules = () =>
  new VersionedExecutionRules({
    version: 'cn-execution-1',
    calendar: cnTradingCalendar,
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
    price: { reference: 'previousClose', maxUpRatio: '0.1', maxDownRatio: '0.1' },
    positionSettlement: { sellableAfterTradingDays: 1 },
    cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
    statutoryCharges: [],
  } satisfies ExecutionRuleFacts);

export const exchangeBar = (
  openedAt: string,
  occurredAt: string,
  open: string,
  previousClose: string,
): ExchangeBarFact => ({
  occurredAt,
  availableAt: occurredAt,
  openedAt,
  openAvailableAt: openedAt,
  previousCloseAvailableAt: openedAt,
  open,
  previousClose,
});

export const exchangeRunInput = (
  options: {
    bars?: readonly ExchangeBarFact[];
    accountingBasis?: 'raw-events' | 'normalized-series';
    corporateActions?: readonly BacktestCorporateActionFact[];
  } = {},
) => {
  const accountingBasis = options.accountingBasis ?? 'raw-events';
  const signalAt = '2026-09-08T01:35:00.000Z';
  const ledger = new SimulationLedger({
    executionInstrument: {
      symbol: '600519.SH',
      market: 'CN',
      assetType: 'stock',
      currency: 'CNY',
    },
    baseCurrency: 'CNY',
    initialCash: { CNY: '5000' },
    accountingBasis,
  });
  return {
    simulation: {
      runId: 'exchange-run',
      strategy: { ...strategy(), primaryTimeframe: '5m' as const },
      ticks: [{ occurredAt: signalAt, availableAt: signalAt, timeframe: '5m' as const }],
      sourceSeries: new Map([
        [
          'close',
          {
            ...sourceSeries([
              {
                occurredAt: signalAt,
                availableAt: signalAt,
                value: '11',
                status: 'available' as const,
              },
            ]),
            timeframe: '5m' as const,
            adjusted: false,
          },
        ],
      ]),
      ...(options.corporateActions ? { corporateActions: options.corporateActions } : {}),
    },
    ledger,
    accountingBasis,
    exchange: {
      rules: exchangeRules(),
      calendar: cnTradingCalendar,
      bars: options.bars ?? [
        exchangeBar('2026-09-08T01:30:00.000Z', '2026-09-08T01:35:00.000Z', '10', '9.9'),
        exchangeBar('2026-09-08T01:40:00.000Z', '2026-09-08T01:45:00.000Z', '10.1', '10'),
      ],
      costs: { version: 'cost-1', slippageRate: '0', commissionRate: '0' },
      sizingForIntent: (
        intent: { side: 'buy' | 'sell'; occurredAt: string },
        state: {
          position: { quantity: string };
        },
      ) => ({
        rule: {
          type: 'fixedQuantity' as const,
          quantity: intent.side === 'sell' ? state.position.quantity : '200',
        },
        executionCurrency: 'CNY' as const,
        lotSize: '100',
        currentQuantity: state.position.quantity,
        evaluationAt: intent.occurredAt,
      }),
    },
  };
};

export const frozenExchangeExecutionModel = (
  sellableAfterTradingDays: number,
): Omit<FrozenExecutionModel, 'segments'> & { segments: FrozenExchangeExecutionModelSegment[] } => ({
  schemaVersion: 'execution-model-v1',
  id: `cn-t${sellableAfterTradingDays}-test`,
  version: '1',
  scope: {
    symbol: '600519.SH',
    market: 'CN',
    instrumentType: 'STOCK',
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    range: { start: '2026-09-08', end: '2026-09-10' },
  },
  segments: [
    {
      id: `t${sellableAfterTradingDays}`,
      range: { start: '2026-09-08', end: '2026-09-10' },
      source: { kind: 'userConfiguration', configuredAt: '2026-09-01T00:00:00.000Z' },
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
          rate: '0',
          minimum: { kind: 'none' },
        },
        stampDuty: { treatment: 'notApplicable', reason: '测试不收取印花税' },
        transferFee: { treatment: 'notApplicable', reason: '测试不收取过户费' },
        regulatoryFee: { treatment: 'notApplicable', reason: '测试不收取规费' },
        handlingFee: { treatment: 'notApplicable', reason: '测试不收取经手费' },
      },
      execution: {
        mode: 'exchange',
        calendarMarket: 'CN',
        reserveCashAt: 'orderAccepted',
        buyDebitAt: 'fill',
        sellableAfterTradingDays,
        saleReinvestableAfterTradingDays: 0,
        price: { kind: 'noDailyLimit', reason: '测试模型不限制涨跌幅' },
      },
    },
  ],
});

export const frozenNormalizedExecutionModel = (
  sellableAfterTradingDays: number,
): FrozenExecutionModel => {
  const model = frozenExchangeExecutionModel(sellableAfterTradingDays);
  return {
    ...model,
    id: `${model.id}-normalized`,
    segments: model.segments.map((segment) => {
      if (segment.execution.mode !== 'exchange') throw new Error('fixture 必须使用场内模型');
      return {
        ...segment,
        execution: {
          ...segment.execution,
          normalizedExecution: normalizedExecutionAssumptions,
        },
      };
    }),
  };
};
