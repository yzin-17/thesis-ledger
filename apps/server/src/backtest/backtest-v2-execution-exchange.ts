import {
  runExchangeSimulation,
  availabilityForDecision,
  type BacktestEquityPoint,
} from '@thesis-ledger/domain';
import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import {
  buildBacktestAnalytics,
  projectBacktestTrades,
  SimulationLedger,
  tradingCalendarFromFact,
  VersionedExecutionRules,
  createRiskEvaluationAdapter,
  type BacktestSeries,
  type SimulationTargetIntent,
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
  signalArtifactFor,
  sourceSeriesKey,
  stringField,
  toCorporateAction,
} from './backtest-v2-execution-shared.js';
import { buildPointInTimeIndicatorSeries } from './backtest-adjusted-indicators.js';
import { prepareEventAccountingV3 } from './backtest-event-accounting-v3.js';
import {
  annualizationFactorFromValuations,
  buildDailyValuationTicks,
  buildBacktestEquityPoint,
} from './backtest-equity-curve.js';
import { requireFrozenExecutionRules } from './backtest-market-rules.js';
import { buildBacktestSizingEquity } from './backtest-sizing-equity.js';
import { barResearchClocksV3 } from './backtest-v3-research-clock.js';
import { requireV3EventSignalVisibility } from './backtest-v3-event-signal-clock.js';

type ExchangeVerticalInput = BacktestVerticalInput;

const runConfigVersion = (runConfig: ExchangeVerticalInput['runConfig']) => {
  const parsed = runConfigSchemaV3.safeParse(runConfig);
  if (!parsed.success) {
    throw new Error('SNAPSHOT_VERSION_MISMATCH: 缺少一致的现行冻结价格协议');
  }
  return { accountingBasis: parsed.data.executionPriceProtocol.accountingBasis };
};

export const runExchangeVertical = (input: ExchangeVerticalInput): ExchangeVerticalResult => {
  const snapshotProtocol = runConfigVersion(input.runConfig);
  const isNormalizedSeries = snapshotProtocol.accountingBasis === 'normalized-series';
  const v3Config = input.runConfig;
  if (input.strategy.executionInstrument.assetType === 'fund') {
    throw new Error('NAV Fund 必须走 CN NAV simulation');
  }
  const instrument = input.strategy.executionInstrument;
  const instrumentRows = rowsForPurpose(input.rows, 'instrumentFacts');
  const instrumentRow = rowFor(
    instrumentRows,
    (row) => row.symbol === instrument.symbol && row.market === instrument.market,
  );
  const fact = instrumentFact(instrumentRow);
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
  const calendar = tradingCalendarFromFact(
    calendarFact(rowFor(calendarRows, (row) => row.market === instrument.market)),
  );
  const rules = new VersionedExecutionRules({
    version: input.marketRuleVersion,
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
  const ledgerConfig = {
    ...initialLedgerConfig(input.strategy, input.runConfig),
    accountingBasis: snapshotProtocol.accountingBasis,
  };
  const ledger = new SimulationLedger(ledgerConfig);
  const barRows = rowsForPurpose(input.rows, 'execution');
  const bars = executionBars(
    rowsAtTimeframe(barRows, input.strategy.primaryTimeframe, calendar),
    calendar,
    v3Config,
  );
  const fxRates = fxRatesFrom(input.rows);
  const sourceSeries = new Map<string, BacktestSeries>();
  for (const source of input.strategy.signalSources) {
    const binding = v3Config.priceInputBindings?.signals.find(
      (alias) => alias.sourceId === source.id,
    );
    const ref = binding
      ? input.artifacts.find((artifact) => artifact.key.endsWith('/execution/bars.parquet'))
      : signalArtifactFor(input.artifacts, source.asset.market, source.asset.symbol);
    if (ref) {
      const sourceCalendar = tradingCalendarFromFact(
        calendarFact(rowFor(calendarRows, (row) => row.market === source.asset.market)),
      );
      const rows = rowsAtTimeframe(input.rows.get(ref.key) ?? [], source.timeframe, sourceCalendar);
      for (const field of source.series) {
        sourceSeries.set(sourceSeriesKey(source.id, field), {
          sourceId: source.id,
          symbol: source.asset.symbol,
          market: source.asset.market,
          assetType: source.asset.assetType,
          field,
          timeframe: source.timeframe,
          adjusted: isNormalizedSeries,
          points: rows.flatMap((row) => {
            if (typeof row.occurredAt !== 'string' || typeof row.availableAt !== 'string')
              return [];
            const value = row[field];
            if (typeof value !== 'string') return [];
            return [
              {
                occurredAt: row.occurredAt,
                availableAt: row.availableAt,
                ...barResearchClocksV3(row, sourceCalendar, v3Config),
                value,
                status: 'available' as const,
              },
            ];
          }),
        });
      }
    }
  }
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
  const accountingActions = !isNormalizedSeries
    ? prepareEventAccountingV3(corporateActions, { calendar, bars,
        startDate: input.runConfig.startDate, endDate: input.runConfig.endDate, dataAsOf: input.runConfig.dataAsOf })
    : corporateActions;
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
  const decisionBars = executionRangeBars;
  const ticks = decisionBars.map((bar) => ({
    occurredAt: availabilityForDecision(bar)!,
    tradingDate: calendar.status(bar.occurredAt).date,
    availableAt: availabilityForDecision(bar)!,
    timeframe: input.strategy.primaryTimeframe,
  }));
  requireV3EventSignalVisibility({
      strategy: input.strategy,
      facts: corporateActions,
      ticks,
      symbol: instrument.symbol,
      market: instrument.market,
  });
  const indicatorSeries = buildPointInTimeIndicatorSeries({
    expressions: [input.strategy.entry, input.strategy.exit],
    sourceSeries,
    corporateActions: isNormalizedSeries ? [] : corporateActions,
    ticks,
  });
  const equityCurve: BacktestEquityPoint[] = [];
  const valuationUnavailableReasons: string[] = [];
  const valuationTicks = buildDailyValuationTicks({
    startDate: input.runConfig.startDate,
    endDate: input.runConfig.endDate,
    policy: input.runConfig.valuationPolicy,
    calendar,
  });
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
  let positionOpenedAt: string | undefined;
  let positionWasOpen = false;
  const positionStateAt: NonNullable<
    Parameters<typeof runExchangeSimulation>[0]['simulation']['positionStateAt']
  > = (tick) => {
    const position = ledger.snapshot().position;
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
  const simulation = runExchangeSimulation({
    simulation: {
      runId: input.runId,
      strategy: {
        entry: input.strategy.entry,
        exit: input.strategy.exit,
        executionInstrument: input.strategy.executionInstrument,
        primaryTimeframe: input.strategy.primaryTimeframe,
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
      corporateActions: isNormalizedSeries ? [] : accountingActions,
      corporateActionSignalFacts: corporateActions,
    },
    ledger,
    accountingBasis: snapshotProtocol.accountingBasis,
    exchange: {
      rules,
      calendar,
      bars,
      costs,
      ...(executionModel ? { executionModel, dataAsOf: input.runConfig.dataAsOf } : {}),
      sizingForIntent: (intent: SimulationTargetIntent, state) => {
        const next = bars.find(
          (bar) =>
            Date.parse(bar.openedAt) > Date.parse(intent.occurredAt) &&
            calendar.isTradingSession(bar.openedAt),
        );
        const openAvailability = next
          ? {
              availableAt: next.openAvailableAt,
              ...(next.openResearchClock ? { researchClock: next.openResearchClock } : {}),
            }
          : undefined;
        const evaluationAt = openAvailability
          ? availabilityForDecision(openAvailability)!
          : intent.occurredAt;
        const sizingEquity = next
          ? buildBacktestSizingEquity({
              state,
              executionCurrency: fact.currency,
              evaluationAt,
              policy: input.runConfig.valuationPolicy,
              price: {
                symbol: instrument.symbol,
                market: instrument.market,
                assetType: instrument.assetType,
                currency: fact.currency,
                price: next.open,
                occurredAt: next.openedAt,
                availableAt: next.openAvailableAt,
                ...(next.openResearchClock ? { researchClock: next.openResearchClock } : {}),
              },
              fxRates,
            })
          : undefined;
        let sizingRule = input.strategy.sizing;
        if (intent.side === 'sell') {
          if (isNormalizedSeries) sizingRule = { type: 'targetWeight', weight: '0' };
          else sizingRule = { type: 'fixedQuantity', quantity: state.position.quantity };
        }
        return {
          rule: sizingRule,
          executionCurrency: fact.currency,
          lotSize: fact.lotSize,
          currentQuantity: state.position.quantity,
          evaluationAt,
          ...(next
            ? {
                price: {
                  value: next.open,
                  occurredAt: next.openedAt,
                  availableAt: next.openAvailableAt,
                  ...(next.openResearchClock ? { researchClock: next.openResearchClock } : {}),
                },
              }
            : {}),
          ...(sizingEquity ?? {}),
        };
      },
    },
  });
  const fills = simulation.fills;
  const rejects = simulation.rejects.filter(
    (reject) => !isNormalizedSeries || reject.code !== 'CORPORATE_ACTION_IGNORED',
  );
  const trades = projectBacktestTrades(
    fills.map((fill) => ({ ...fill, charges: [...fill.charges] })),
    { executionSymbol: instrument.symbol, currency: fact.currency },
  );
  const ledgerUnavailableReasons = simulation.ledgerMutations.flatMap((mutation) =>
    mutation.applied ? [] : [`LEDGER_${mutation.code}:${mutation.reason}`],
  );
  const executionUnavailableReasons = rejects.flatMap((reject) => {
    const expiredAtRangeEnd =
      reject.code === 'DAY_EXPIRED' &&
      reject.occurredAt === ticks.at(-1)?.occurredAt;
    return expiredAtRangeEnd ? [] : [`${reject.code}:${reject.reason}`];
  });
  const unavailableReasons = [
    ...valuationUnavailableReasons,
    ...(executionModel ? ledgerUnavailableReasons : []),
    ...(executionModel ? executionUnavailableReasons : []),
    ...simulation.corporateActionResults.flatMap((result) =>
      result.applied || (isNormalizedSeries && result.code === 'CORPORATE_ACTION_IGNORED')
        ? []
        : [`CORPORATE_ACTION_REJECTED:${result.code}`],
    ),
  ];
  const analytics = buildBacktestAnalytics({
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
  return { fills, rejects, trades: trades.trades, analytics };
};

export type { ExchangeVerticalResult };
