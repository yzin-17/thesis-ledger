import type { BacktestEquityPoint } from '@thesis-ledger/domain';
import {
  createCorporateActionPort,
  createExchangeSizingAdapter,
  buildBacktestAnalytics,
  projectBacktestTrades,
  SimulationLedger,
  tradingCalendarFromFact,
  VersionedExecutionRules,
  runDeterministicSimulation,
  createRiskEvaluationAdapter,
  type BacktestSeries,
  type SimulationFillRecord,
  type SimulationSettlement,
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
import {
  annualizationFactorFromValuations,
  buildDailyValuationTicks,
  buildBacktestEquityPoint,
} from './backtest-equity-curve.js';
import { requireFrozenExecutionRules } from './backtest-market-rules.js';
import { buildBacktestSizingEquity } from './backtest-sizing-equity.js';

export const runExchangeVertical = (input: BacktestVerticalInput): ExchangeVerticalResult => {
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
  const executionModel = input.runConfig.executionModel;
  const ruleSnapshot = executionModel
    ? undefined
    : requireFrozenExecutionRules(
        executionRuleSnapshot(instrumentRow),
        input.marketRuleVersion,
        { start: input.runConfig.startDate, end: input.runConfig.endDate },
      );
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
  const ledgerConfig = initialLedgerConfig(input.strategy, input.runConfig);
  const ledger = new SimulationLedger(ledgerConfig);
  const barRows = rowsForPurpose(input.rows, 'execution');
  const bars = executionBars(rowsAtTimeframe(barRows, input.strategy.primaryTimeframe, calendar));
  const fxRates = fxRatesFrom(input.rows);
  const sourceSeries = new Map<string, BacktestSeries>();
  for (const source of input.strategy.signalSources) {
    const ref = signalArtifactFor(input.artifacts, source.asset.market, source.asset.symbol);
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
          adjusted: false,
          points: rows.flatMap((row) => {
            if (typeof row.occurredAt !== 'string' || typeof row.availableAt !== 'string')
              return [];
            const value = row[field];
            if (typeof value !== 'string') return [];
            return [
              {
                occurredAt: row.occurredAt,
                availableAt: row.availableAt,
                value,
                status: 'available' as const,
              },
            ];
          }),
        });
      }
    }
  }
  const adapter = createExchangeSizingAdapter({
    sizingForIntent: (intent: SimulationTargetIntent) => {
      const next = bars.find((bar) => Date.parse(bar.openedAt) > Date.parse(intent.occurredAt));
      const state = ledger.snapshot();
      const evaluationAt = next?.openAvailableAt ?? intent.occurredAt;
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
            },
            fxRates,
          })
        : undefined;
      return {
        rule: input.strategy.sizing,
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
              },
            }
          : {}),
        ...(sizingEquity ?? {}),
      };
    },
    orderDefaults: () => ({
      market: instrument.market,
      orderType: 'Market' as const,
      timeInForce: 'DAY' as const,
      executionTiming: 'nextEligibleBarOpen' as const,
    }),
    exchangeInputForOrder: () => ({
      rules,
      calendar,
      currency: fact.currency,
      bars,
      account: {
        settledCash: ledger.availableCash(fact.currency),
        availableQuantity: executionModel
          ? ledger.snapshot().position.quantity
          : ledger.snapshot().position.settledQuantity,
        ...(executionModel && positionOpenedAt
          ? { acquiredOn: calendar.status(positionOpenedAt).date }
          : {}),
      },
      costs: {
        version: executionModel
          ? `execution-model-v1:${executionModel.id}:${executionModel.version}`
          : 'snapshot-cost-v1',
        commissionRate: executionModel ? '0' : input.strategy.cost.commissionRate,
        slippageRate: input.strategy.cost.slippageRate,
        ...(executionModel || input.strategy.cost.minimumCommission === undefined
          ? {}
          : { minimumCommission: input.strategy.cost.minimumCommission }),
      },
      ...(executionModel ? { executionModel, dataAsOf: input.runConfig.dataAsOf } : {}),
    }),
    reserveCashForOrder: (_order, plan) => {
      if (!plan.cashReservation) return { accepted: true };
      const reservation = ledger.reserveCash(
        plan.cashReservation.reservationId,
        plan.cashReservation.currency,
        plan.cashReservation.amount,
      );
      if (reservation.accepted) return { accepted: true };
      return {
        accepted: false,
        code: reservation.code,
        reason: reservation.reason,
        inputFacts: [
          `cash.currency=${plan.cashReservation.currency}`,
          `cash.required=${plan.cashReservation.amount}`,
        ],
      };
    },
  });
  const actionRows = rowsForPurpose(input.rows, 'corporateActions');
  const corporateActions = actionRows.map(toCorporateAction);
  const executionSeries: BacktestSeries = {
    sourceId: `execution:${instrument.market}:${instrument.symbol}`,
    symbol: instrument.symbol,
    market: instrument.market,
    assetType: instrument.assetType,
    field: 'close',
    timeframe: input.strategy.primaryTimeframe,
    adjusted: false,
    points: bars.map((bar) => ({
      occurredAt: bar.occurredAt,
      availableAt: bar.availableAt,
      value: bar.close,
      status: bar.status,
    })),
  };
  const valuationPriceSeries: BacktestSeries = {
    ...executionSeries,
    points: executionSeries.points.filter((point) => point.status === 'available'),
  };
  const ticks = bars
    .filter((bar) => {
      const tradingDate = calendar.status(bar.occurredAt).date;
      return tradingDate >= input.runConfig.startDate && tradingDate <= input.runConfig.endDate;
    })
    .map((bar) => ({
      occurredAt: bar.availableAt,
      availableAt: bar.availableAt,
      timeframe: input.strategy.primaryTimeframe,
    }));
  const indicatorSeries = buildPointInTimeIndicatorSeries({
    expressions: [input.strategy.entry, input.strategy.exit],
    sourceSeries,
    corporateActions,
    ticks,
  });
  const equityCurve: BacktestEquityPoint[] = [];
  const valuationUnavailableReasons: string[] = [];
  const ledgerUnavailableReasons: string[] = [];
  const valuationTicks = buildDailyValuationTicks({
    startDate: input.runConfig.startDate,
    endDate: input.runConfig.endDate,
    policy: input.runConfig.valuationPolicy,
    calendar,
  });
  let positionOpenedAt: string | undefined;
  const riskAdapter = createRiskEvaluationAdapter({
    riskInputAt: (context) => {
      const position = context.positionState ?? {
        quantity: '0',
        averageCost: '0',
        holdingPeriods: 0,
        isOpen: false,
        availableAt: context.tick.occurredAt,
      };
      const price = latestPointAt(executionSeries, context.tick.occurredAt)?.value;
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
          completed: price !== undefined,
          ...(price === undefined
            ? { status: 'unavailable' as const, reason: '执行价格缺失' }
            : {}),
        },
        evaluationAt: context.tick.occurredAt,
      };
    },
  });
  const simulation = runDeterministicSimulation({
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
                },
              }
            : {}),
        });
        if (valuation.status === 'available') equityCurve.push(valuation.point);
        else valuationUnavailableReasons.push(valuation.reason);
      },
    },
    risk: (context) => riskAdapter.asSimulationRisk(context),
    positionStateAt: (tick) => {
      const state = ledger.snapshot().position;
      const holdingPeriods =
        positionOpenedAt === undefined
          ? 0
          : ticks.filter(
              (candidate) =>
                Date.parse(candidate.occurredAt) >= Date.parse(positionOpenedAt!) &&
                Date.parse(candidate.occurredAt) <= Date.parse(tick.occurredAt),
            ).length;
      return {
        isOpen: state.quantity !== '0',
        quantity: state.quantity,
        averageCost: state.averageCost,
        holdingPeriods,
        availableAt: tick.occurredAt,
      };
    },
    corporateActions,
    corporateActionPort: createCorporateActionPort(
      ledger,
      ledgerConfig.executionInstrument,
      input.runId,
    ),
    execution: {
      ...adapter.port,
      onMutation: (mutation: { type: string; payload: Record<string, unknown> }) => {
        if (mutation.type === 'simulationFill') {
          const fill = mutation.payload as unknown as SimulationFillRecord;
          const plan = adapter.planFor(`${fill.orderId}`);
          const result =
            plan?.status === 'filled'
              ? ledger.applyEvent({ type: 'fill', payload: plan.ledgerFill }, fill.availableAt)
              : undefined;
          if (result && !result.applied) {
            ledgerUnavailableReasons.push(`LEDGER_${result.code}:${result.reason}`);
            if (plan?.status === 'filled' && plan.cashReservation) {
              ledger.releaseCash(plan.cashReservation.reservationId);
            }
          }
          if (result?.applied && fill.side === 'buy' && positionOpenedAt === undefined)
            positionOpenedAt = fill.occurredAt;
          if (result?.applied && fill.side === 'sell' && ledger.snapshot().position.quantity === '0')
            positionOpenedAt = undefined;
        } else if (mutation.type === 'cashSettlement') {
          const settlement = mutation.payload as unknown as SimulationSettlement;
          const result = ledger.applyEvent(
            { type: 'settlement', payload: settlement },
            settlement.availableAt,
          );
          if (!result.applied)
            ledgerUnavailableReasons.push(`LEDGER_${result.code}:${result.reason}`);
        }
      },
      scheduledMutationsForFill: (fill: SimulationFillRecord) => {
        const plan = adapter.planFor(fill.orderId);
        if (!plan || plan.status !== 'filled') return [];
        return plan.settlement.ledgerSettlements.map((settlement: SimulationSettlement) => ({
          type: 'cashSettlement' as const,
          eventId: settlement.eventId,
          occurredAt: settlement.occurredAt,
          availableAt: settlement.availableAt,
          payload: settlement as unknown as Record<string, unknown>,
        }));
      },
    },
  });
  const fills = simulation.fills;
  const trades = projectBacktestTrades(
    fills.map((fill) => ({ ...fill, charges: [...fill.charges] })),
    { executionSymbol: instrument.symbol, currency: fact.currency },
  );
  const unavailableReasons = [
    ...valuationUnavailableReasons,
    ...(executionModel ? ledgerUnavailableReasons : []),
    ...(executionModel
      ? simulation.rejects.map((reject) => `${reject.code}:${reject.reason}`)
      : []),
    ...simulation.corporateActionResults.flatMap((result) =>
      result.applied ? [] : [`CORPORATE_ACTION_REJECTED:${result.code}`],
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
  return { fills, rejects: simulation.rejects, trades: trades.trades, analytics };
};

export type { ExchangeVerticalResult };
