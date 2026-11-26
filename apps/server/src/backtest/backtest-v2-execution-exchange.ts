import {
  type runExchangeSimulation,
  exchangeSimulationSteps,
  advanceBacktestComputation,
  finishBacktestComputation,
  type BacktestComputationOptions,
  projectBacktestTradesSteps,
  buildBacktestAnalyticsSteps,
  tradePlanIndicatorExpressions,
  tradePlanProtectionRules,
  dailyOrderPriceExpressions,
  RuleDiagnosticsCollector,
  strategyRuleExpressions,
  DecimalValue,
  type BacktestEquityPoint,
  type BacktestCorporateActionFact,
} from '@thesis-ledger/domain';
import { lifecycleSignalDateV3 } from './backtest-lifecycle-execution-v3.js';
import { frozenExchangeSignalSeries } from './backtest-exchange-source-series.js';
import { exchangeSessionSeriesSteps } from './backtest-session-series.js';
import { runConfigSchemaV3, priceResearchReferenceArtifactKey } from '@thesis-ledger/schemas';
import { expectedStatusRejectionV3 } from './backtest-status-rejection-availability-v3.js';
import {
  SimulationLedger,
  tradingCalendarFromFact,
  VersionedExecutionRules,
  createRiskEvaluationAdapter,
  type BacktestSeries,
  type BacktestVerticalInput,
  type ExchangeVerticalResult,
  calendarFact,
  executionRuleSnapshot,
  executionBars,
  fxRatesFrom,
  initialLedgerConfig,
  instrumentFact,
  latestPointAt,
  rowFor,
  rowsAtTimeframe,
  rowsForPurpose,
  stringField,
  toCorporateAction,
} from './backtest-v2-execution-shared.js';
import { pointInTimeIndicatorSeriesSteps } from './backtest-adjusted-indicators.js';
import { frozenAccountingActionsV3 } from './backtest-known-cash-accounting-v3.js';
import { knownCashEntitlementV3 } from './backtest-known-cash-entitlement-v3.js';
import { exchangeDecisionTicksV3 } from './backtest-exchange-clocks-v3.js';
import { tradePlanExecutionInput } from './backtest-trade-plan-execution.js';
import { cashDividendExecutionEventsV3 } from './backtest-cash-event-accounting-v3.js';
import {
  annualizationFactorFromValuations,
  buildDailyValuationTicks,
  buildBacktestEquityPoint,
} from './backtest-equity-curve.js';
import { requireFrozenExecutionRules } from './backtest-market-rules.js';
import { exchangeSizing } from './backtest-exchange-sizing.js';
import { requireV3EventSignalVisibility } from './backtest-v3-event-signal-clock.js';
import { hkResearchLotForFactV3 } from './backtest-hk-research-lot-v3.js';

type ExchangeVerticalInput = BacktestVerticalInput;

const runConfigVersion = (runConfig: ExchangeVerticalInput['runConfig']) => {
  const parsed = runConfigSchemaV3.safeParse(runConfig);
  if (!parsed.success) {
    throw new Error('SNAPSHOT_VERSION_MISMATCH: 缺少一致的现行冻结价格协议');
  }
  return { accountingBasis: parsed.data.executionPriceProtocol.accountingBasis };
};

export function* exchangeVerticalSteps(input: ExchangeVerticalInput): Generator<void, ExchangeVerticalResult, void> {
  const snapshotProtocol = runConfigVersion(input.runConfig);
  const isNormalizedSeries = snapshotProtocol.accountingBasis === 'normalized-series';
  const v3Config = input.runConfig;
  const dailyOrders = input.strategy.execution.timing === 'dailyBarOrders' ? input.strategy.execution : undefined;
  if (dailyOrders && !v3Config.dailyOrderMatching) throw new Error('日线委托缺少已冻结的模拟撮合政策');
  if (input.strategy.executionInstrument.assetType === 'fund') {
    throw new Error('NAV Fund 必须走 CN NAV simulation');
  }
  const instrument = input.strategy.executionInstrument;
  const instrumentRows = rowsForPurpose(input.rows, 'instrumentFacts');
  const instrumentRow = rowFor(
    instrumentRows,
    (row) => row.symbol === instrument.symbol && row.market === instrument.market,
  );
  const fact = instrumentFact(
    instrumentRow,
    isNormalizedSeries,
    hkResearchLotForFactV3(instrumentRow, v3Config),
  );
  const executionModel = input.runConfig.executionModel as
    | NonNullable<Parameters<typeof runExchangeSimulation>[0]['exchange']['executionModel']>
    | undefined;
  const ruleSnapshot = executionModel
    ? undefined
    : requireFrozenExecutionRules(executionRuleSnapshot(instrumentRow), input.marketRuleVersion, {
        start: input.runConfig.startDate,
        end: input.runConfig.endDate,
      });
  const calendarRows = rowsForPurpose(input.rows, 'calendar');
  const frozenCalendar = calendarFact(rowFor(calendarRows, (row) => row.market === instrument.market));
  const calendar = tradingCalendarFromFact(frozenCalendar);
  const rules = frozenExchangeRules(
    input,
    calendarRows,
    fact,
    calendar,
    executionModel,
    ruleSnapshot,
  );
  const ledgerConfig = {
    ...initialLedgerConfig(input.strategy, input.runConfig),
    accountingBasis: snapshotProtocol.accountingBasis,
  };
  const ledger = new SimulationLedger(ledgerConfig);
  const barRows = rowsForPurpose(input.rows, 'execution');
  const bars = executionBars(
    rowsAtTimeframe(barRows, input.strategy.primaryTimeframe, calendar, v3Config.priceResearch?.dailyObservationContract !== undefined),
    calendar,
    v3Config,
  );
  yield;
  const fxRates = fxRatesFrom(input.rows);
  const actualRows = input.rows.get(`${input.runId}/${priceResearchReferenceArtifactKey}`) ?? [];
  const actualBars = v3Config.priceResearch ? executionBars(rowsAtTimeframe(actualRows, input.strategy.primaryTimeframe, calendar,
    v3Config.priceResearch.dailyObservationContract !== undefined), calendar, v3Config) : [];
  yield;
  const sourceSeries = frozenExchangeSignalSeries(input, calendarRows, barRows, isNormalizedSeries);
  yield;
  const costs = {
    version: executionModel
      ? `execution-model-v1:${executionModel.id}:${executionModel.version}`
      : 'snapshot-cost-v1',
    commissionRate: executionModel ? '0' : input.strategy.cost.commissionRate,
    slippageRate: input.strategy.cost.slippageRate,
    ...(executionModel || input.strategy.cost.minimumCommission === undefined
      ? {}
      : { minimumCommission: input.strategy.cost.minimumCommission }),
  };
  const actionRows = rowsForPurpose(input.rows, 'corporateActions');
  const corporateActions = actionRows
    .filter((row) => row.kind !== 'empty-dataset')
    .map(toCorporateAction);
  const accountingActions = frozenAccountingActionsV3(v3Config, corporateActions, input.rows, {
    calendar,
    bars,
  });
  yield;
  const cashEntitlement = knownCashEntitlementV3(calendar, v3Config);
  const executionSeries: BacktestSeries = {
    sourceId: `execution:${instrument.market}:${instrument.symbol}`,
    symbol: instrument.symbol,
    market: instrument.market,
    assetType: instrument.assetType,
    field: 'close',
    timeframe: input.strategy.primaryTimeframe,
    adjusted: isNormalizedSeries,
    points: bars.map((bar) => ({
      occurredAt: bar.occurredAt,
      availableAt: bar.availableAt,
      ...(bar.researchClock ? { researchClock: bar.researchClock } : {}),
      value: bar.close,
      status: bar.status,
    })),
  };
  const valuationPriceSeries: BacktestSeries = {
    ...executionSeries,
    points: executionSeries.points.filter((point) => point.status === 'available'),
  };
  const executionRangeBars = bars.filter((bar) => {
    const tradingDate = calendar.status(bar.occurredAt).date;
    return tradingDate >= input.runConfig.startDate && tradingDate <= input.runConfig.endDate;
  });
  yield;
  const decisionBars = executionRangeBars.filter((bar) =>
    lifecycleSignalDateV3(v3Config, calendar.status(bar.occurredAt).date),
  );
  const ticks = exchangeDecisionTicksV3(
    decisionBars,
    input.strategy.primaryTimeframe,
    (at) => calendar.status(at).date,
  );
  yield;
  requireV3EventSignalVisibility({
    strategy: input.strategy,
    facts: corporateActions,
    ticks,
    symbol: instrument.symbol,
    market: instrument.market,
  });
  const regularIndicators = yield* pointInTimeIndicatorSeriesSteps({
    expressions: [input.strategy.entry, input.strategy.exit, ...tradePlanIndicatorExpressions(input.strategy.tradePlan),
      ...tradePlanProtectionRules(input.strategy.tradePlan).map(rule => rule.expression),
      ...dailyOrderPriceExpressions(input.strategy.execution).map(rule => rule.expression)],
    sourceSeries,
    corporateActions: isNormalizedSeries ? [] : corporateActions,
    ticks,
  });
  const sessions = yield* exchangeSessionSeriesSteps({
    strategy: input.strategy, sourceSeries, calendarRows, ticks, runConfig: v3Config,
  });
  const indicatorSeries = new Map([...regularIndicators, ...sessions]);
  for (const series of [...sourceSeries.values(), ...indicatorSeries.values()]) {
    for (const point of series.points) { Object.freeze(point); yield; }
    Object.freeze(series.points);
  }
  const equityCurve: BacktestEquityPoint[] = [];
  const valuationUnavailableReasons: string[] = [];
  const valuationTicks = buildDailyValuationTicks({
    startDate: input.runConfig.startDate,
    endDate: input.runConfig.endDate,
    policy: input.runConfig.valuationPolicy,
    calendar,
  });
  const riskAdapter = exchangeRiskAdapter(input, executionSeries);
  const positionStateAt = exchangePositionState(ledger, cashEntitlement, ticks);
  const ruleDiagnostics = new RuleDiagnosticsCollector(strategyRuleExpressions(input.strategy), sourceSeries);
  const simulation = yield* exchangeSimulationSteps({
    simulation: {
      observeRule: ruleDiagnostics.observe,
      runId: input.runId,
      strategy: {
        entry: input.strategy.entry,
        exit: input.strategy.exit,
        executionInstrument: input.strategy.executionInstrument,
        primaryTimeframe: input.strategy.primaryTimeframe,
        ...(input.strategy.entryTrigger ? { entryTrigger: input.strategy.entryTrigger } : {}),
        ...(input.strategy.tradePlan ? { tradePlan: input.strategy.tradePlan } : {}),
      },
      ticks,
      sourceSeries,
      indicatorSeries,
      portfolioValuation: {
        ticks: valuationTicks,
        valueAt: (tick) => {
          const point = latestPointAt(valuationPriceSeries, tick.occurredAt);
          const valuation = buildBacktestEquityPoint({
            state: ledger.snapshot(),
            valuationAt: tick.occurredAt,
            policy: input.runConfig.valuationPolicy,
            fxRates,
            ...(point?.status === 'available' && point.value !== undefined
              ? {
                  price: {
                    symbol: instrument.symbol,
                    market: instrument.market,
                    assetType: instrument.assetType,
                    currency: fact.currency,
                    price: point.value,
                    occurredAt: point.occurredAt,
                    availableAt: point.availableAt,
                    ...(point.researchClock ? { researchClock: point.researchClock } : {}),
                  },
                }
              : {}),
          });
          if (valuation.status === 'available') equityCurve.push(valuation.point);
          else valuationUnavailableReasons.push(valuation.reason);
        },
      },
      risk: (context) => riskAdapter.asSimulationRisk(context),
      positionStateAt,
      ...cashEntitlement?.checkpoint(accountingActions, () => ledger.snapshot().position.quantity),
      corporateActions: isNormalizedSeries ? [] : accountingActions,
      corporateActionSignalFacts: corporateActions,
    },
    ledger,
    accountingBasis: snapshotProtocol.accountingBasis,
    exchange: {
      ...(dailyOrders && v3Config.dailyOrderMatching ? { dailyOrders: { execution: dailyOrders, matching: v3Config.dailyOrderMatching } } : {}),
      ...tradePlanExecutionInput(input.strategy, executionSeries, frozenCalendar, v3Config?.dataAsOf),
      ...(cashEntitlement
        ? {
            cashEntitlementFor: (fact: BacktestCorporateActionFact) =>
              cashEntitlement.quantityFor(fact),
          }
        : {}),
      rules,
      calendar,
      bars,
      costs,
      ...(executionModel ? { executionModel, dataAsOf: input.runConfig.dataAsOf } : {}),
      sizingForIntent: exchangeSizing(
        input,
        bars,
        calendar,
        fact,
        fxRates,
        actualBars,
        isNormalizedSeries,
      ),
    },
  });
  const result = yield* exchangeVerticalResultSteps(input, {
    simulation,
    ledger,
    isNormalizedSeries,
    executionModel,
    equityCurve,
    valuationUnavailableReasons,
    ticks,
    fact,
  });
  return { ...result, ruleDiagnostics: ruleDiagnostics.snapshot() };
}

export const runExchangeVertical = (input: ExchangeVerticalInput) => finishBacktestComputation(exchangeVerticalSteps(input));
export const runExchangeVerticalCooperatively = (input: ExchangeVerticalInput, options: BacktestComputationOptions) => advanceBacktestComputation(exchangeVerticalSteps(input), options);

export type { ExchangeVerticalResult };

type FrozenExecutionModel =
  | NonNullable<Parameters<typeof runExchangeSimulation>[0]['exchange']['executionModel']>
  | undefined;
type ExchangeCalendar = ReturnType<typeof tradingCalendarFromFact>;

function frozenExchangeRules(
  input: ExchangeVerticalInput,
  calendarRows: ReturnType<typeof rowsForPurpose>,
  fact: ReturnType<typeof instrumentFact>,
  calendar: ExchangeCalendar,
  executionModel: FrozenExecutionModel,
  ruleSnapshot: ReturnType<typeof requireFrozenExecutionRules> | undefined,
) {
  const v3Config = input.runConfig;
  const instrument = input.strategy.executionInstrument;
  const rules = new VersionedExecutionRules({
    version: input.marketRuleVersion,
    ...(v3Config.executionPriceProtocol.cashEventResearch ||
    v3Config.executionPriceProtocol.marketRuleResearch ||
    (v3Config.executionPriceProtocol.accountingBasis === 'normalized-series' &&
      v3Config.executionPriceProtocol.history.basis === 'fixed-provider-snapshot')
      ? {
          factResearch: { basis: 'fixed-provider-snapshot' as const, dataAsOf: v3Config.dataAsOf },
        }
      : {}),
    calendar,
    calendarProvider: fact.provider,
    calendarProviderRevision: fact.providerRevision,
    calendarAvailableAt: stringField(
      rowFor(calendarRows, (row) => row.market === instrument.market),
      'availableAt',
    ),
    instrument: fact,
    order: {
      type: 'Market',
      timeInForce: 'DAY',
      executionTiming: 'nextEligibleBarOpen',
      fillPolicy: 'full-or-reject',
      longOnly: true,
    },
    price: executionModel
      ? { reference: 'previousClose' as const }
      : {
          reference: ruleSnapshot!.price.reference,
          ...(ruleSnapshot!.price.maxUpRatio === null
            ? {}
            : { maxUpRatio: ruleSnapshot!.price.maxUpRatio }),
          ...(ruleSnapshot!.price.maxDownRatio === null
            ? {}
            : { maxDownRatio: ruleSnapshot!.price.maxDownRatio }),
        },
    positionSettlement: executionModel
      ? { sellableAfterTradingDays: 0 }
      : ruleSnapshot!.positionSettlement,
    cashSettlement: executionModel
      ? { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 }
      : ruleSnapshot!.cashSettlement,
    statutoryCharges: executionModel
      ? []
      : ruleSnapshot!.statutoryCharges.map((charge) => ({
          code: charge.code,
          side: charge.side,
          rate: charge.rate,
          ...(charge.minimum === null ? {} : { minimum: charge.minimum }),
        })),
  });

  return rules;
}


function exchangeRiskAdapter(input: ExchangeVerticalInput, executionSeries: BacktestSeries) {
  const instrument = input.strategy.executionInstrument;
  const riskAdapter = createRiskEvaluationAdapter({
    riskInputAt: (context) => {
      const position = context.positionState ?? {
        quantity: '0',
        averageCost: '0',
        holdingPeriods: 0,
        isOpen: false,
        availableAt: context.tick.occurredAt,
      };
      const pricePoint = latestPointAt(executionSeries, context.tick.occurredAt);
      const price = pricePoint?.value;
      return {
        runId: input.runId,
        executionSymbol: instrument.symbol,
        rules: input.strategy.risk,
        position: {
          quantity: position.quantity,
          averageCost: position.averageCost,
          holdingPeriods: position.holdingPeriods,
          availableAt: position.availableAt,
          occurredAt: position.availableAt,
        },
        evaluation: {
          value: price ?? '0',
          occurredAt: context.tick.occurredAt,
          availableAt: context.tick.availableAt ?? context.tick.occurredAt,
          ...(pricePoint?.researchClock
            ? {
                occurredAt: pricePoint.occurredAt,
                availableAt: pricePoint.availableAt,
                researchClock: pricePoint.researchClock,
              }
            : {}),
          completed: price !== undefined,
          ...(price === undefined
            ? { status: 'unavailable' as const, reason: '执行价格缺失' }
            : {}),
        },
        evaluationAt: context.tick.occurredAt,
      };
    },
  });

  return riskAdapter;
}

function exchangePositionState(
  ledger: SimulationLedger,
  cashEntitlement: ReturnType<typeof knownCashEntitlementV3>,
  ticks: ReturnType<typeof exchangeDecisionTicksV3>,
) {
  let positionOpenedAt: string | undefined;
  let positionWasOpen = false;
  const positionStateAt: NonNullable<
    Parameters<typeof runExchangeSimulation>[0]['simulation']['positionStateAt']
  > = (tick) => {
    const position = ledger.snapshot().position;
    cashEntitlement?.captureLegacy(tick.occurredAt, position.settledQuantity);
    if (position.quantity === '0') {
      positionWasOpen = false;
      positionOpenedAt = undefined;
    } else if (!positionWasOpen) {
      positionWasOpen = true;
      positionOpenedAt = tick.occurredAt;
    }
    const holdingPeriods = positionOpenedAt
      ? ticks.filter(
          (candidate) =>
            Date.parse(candidate.occurredAt) >= Date.parse(positionOpenedAt!) &&
            Date.parse(candidate.occurredAt) <= Date.parse(tick.occurredAt),
        ).length
      : 0;
    return {
      isOpen: position.quantity !== '0',
      quantity: position.quantity,
      averageCost: position.averageCost,
      holdingPeriods,
      availableAt: tick.occurredAt,
    };
  };

  return positionStateAt;
}


function* exchangeVerticalResultSteps(
  input: ExchangeVerticalInput,
  context: {
    simulation: ReturnType<typeof runExchangeSimulation>;
    ledger: SimulationLedger;
    isNormalizedSeries: boolean;
    executionModel: FrozenExecutionModel;
    equityCurve: BacktestEquityPoint[];
    valuationUnavailableReasons: string[];
    ticks: ReturnType<typeof exchangeDecisionTicksV3>;
    fact: ReturnType<typeof instrumentFact>;
  },
): Generator<void, ExchangeVerticalResult, void> {
  const {
    simulation,
    ledger,
    isNormalizedSeries,
    executionModel,
    equityCurve,
    valuationUnavailableReasons,
    ticks,
    fact,
  } = context;
  const v3Config = input.runConfig;
  const instrument = input.strategy.executionInstrument;
  const fills = simulation.fills;
  const rejects = simulation.rejects.filter(
    (reject) => !isNormalizedSeries || reject.code !== 'CORPORATE_ACTION_IGNORED',
  );
  const trades = yield* projectBacktestTradesSteps(
    fills.map((fill) => ({ ...fill, charges: [...fill.charges] })),
    { executionSymbol: instrument.symbol, currency: fact.currency, corporateActions: simulation.corporateActionResults },
  );
  const ledgerUnavailableReasons = simulation.ledgerMutations.flatMap((mutation) =>
    mutation.applied ? [] : [`LEDGER_${mutation.code}:${mutation.reason}`],
  );
  if (ledgerUnavailableReasons.length)
    throw Object.assign(new Error(`模拟账本未接受执行结果：${ledgerUnavailableReasons.join('；')}`),
      { code: 'SIMULATION_LEDGER_ERROR' });
  const executionUnavailableReasons = rejects.flatMap((reject) => {
    if (expectedStatusRejectionV3(input.runConfig, reject)) return [];
    const expiredAtRangeEnd =
      reject.code === 'DAY_EXPIRED' && reject.occurredAt === ticks.at(-1)?.occurredAt;
    return expiredAtRangeEnd ? [] : [`${reject.code}:${reject.reason}`];
  });
  const unavailableReasons = [
    ...(simulation.tradePlan?.diagnostics ?? []),
    ...valuationUnavailableReasons,
    ...(executionModel ? ledgerUnavailableReasons : []),
    ...(executionModel ? executionUnavailableReasons : []),
    ...simulation.corporateActionResults.flatMap((result) =>
      result.applied || (isNormalizedSeries && result.code === 'CORPORATE_ACTION_IGNORED')
        ? []
        : [`CORPORATE_ACTION_REJECTED:${result.code}`],
    ),
  ];
  const computedAnalytics = yield* buildBacktestAnalyticsSteps({
    runId: input.runId,
    strategyVersionId: input.strategyVersionId,
    snapshotId: input.snapshotId,
    contentHash: input.snapshotId,
    engineVersion: input.engineVersion,
    schemaVersion: '2',
    marketRuleVersion: input.marketRuleVersion,
    calendarVersion: input.calendarVersion,
    aggregationVersion: input.aggregationVersion,
    baseCurrency: input.runConfig.baseCurrency,
    periodsPerYear: annualizationFactorFromValuations(equityCurve),
    unavailableReasons,
    trades: trades.trades,
    equityCurve,
  });
  const expected = rejects.filter((reject) => expectedStatusRejectionV3(input.runConfig, reject));
  const analytics = expected.length
    ? {
        ...computedAnalytics,
        completeness:
          computedAnalytics.completeness === 'complete'
            ? ('partial' as const)
            : computedAnalytics.completeness,
        warnings: [
          ...computedAnalytics.warnings,
          `已按冻结状态模型拒绝${expected.length}笔订单；有效成交、现金账与指标保留，未知状态仍按研究假设披露。`,
        ],
      }
    : computedAnalytics;
  return {
    fills,
    ...(simulation.dailyOrders && v3Config.dailyOrderMatching ? { dailyOrders: { ...simulation.dailyOrders, matching: v3Config.dailyOrderMatching } } : {}),
    rejects,
    trades: trades.trades,
    analytics,
    ...(v3Config.priceResearch
      ? {
          researchBalances: {
            fundsBalance: {
              amount: DecimalValue.from(ledger.snapshot().cash[v3Config.baseCurrency].settled)
                .plus(ledger.snapshot().cash[v3Config.baseCurrency].unsettled)
                .toString(),
              currency: v3Config.baseCurrency,
            },
            positionUnits: ledger.snapshot().position.quantity,
            ...(equityCurve.at(-1)
              ? {
                  simulatedPnl: {
                    currency: v3Config.baseCurrency,
                    amount: DecimalValue.from(equityCurve.at(-1)!.value.amount)
                      .minus(v3Config.initialCash[v3Config.baseCurrency]!)
                      .toString(),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...cashDividendExecutionEventsV3(input.runConfig, simulation),
  };
}
