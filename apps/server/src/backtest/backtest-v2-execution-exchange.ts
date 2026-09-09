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
  valueSimulationLedger,
  type BacktestSeries,
  type SimulationFillRecord,
  type SimulationSettlement,
  type SimulationTargetIntent,
  type BacktestVerticalInput,
  type ExchangeVerticalResult,
  calendarFact,
  executionBars,
  fxRatesFrom,
  indicatorSeriesFor,
  initialLedgerConfig,
  instrumentFact,
  latestPointAt,
  rowFor,
  rowsAtTimeframe,
  rowsForPurpose,
  signalArtifactFor,
  stringField,
  toCorporateAction,
} from './backtest-v2-execution-shared.js';
export const runExchangeVertical = (input: BacktestVerticalInput): ExchangeVerticalResult => {
  if (input.strategy.executionInstrument.assetType === 'fund') {
    throw new Error('NAV Fund 必须走 CN NAV simulation');
  }
  const instrument = input.strategy.executionInstrument;
  const instrumentRows = rowsForPurpose(input.rows, 'instrumentFacts');
  const fact = instrumentFact(
    rowFor(
      instrumentRows,
      (row) => row.symbol === instrument.symbol && row.market === instrument.market,
    ),
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
    price: { reference: 'previousClose' },
    positionSettlement: { sellableAfterTradingDays: instrument.market === 'CN' ? 1 : 0 },
    cashSettlement: {
      buyDebitAfterTradingDays: 0,
      sellCreditAfterTradingDays: instrument.market === 'CN' ? 1 : 0,
    },
    statutoryCharges: [],
  });
  const ledgerConfig = initialLedgerConfig(input.strategy, input.runConfig);
  const ledger = new SimulationLedger(ledgerConfig);
  const barRows = rowsForPurpose(input.rows, 'execution');
  const bars = executionBars(rowsAtTimeframe(barRows, input.strategy.primaryTimeframe, calendar));
  const sourceSeries = new Map<string, BacktestSeries>();
  for (const source of input.strategy.signalSources) {
    const ref = signalArtifactFor(input.artifacts, source.asset.market, source.asset.symbol);
    if (ref) {
      const sourceCalendar = tradingCalendarFromFact(
        calendarFact(rowFor(calendarRows, (row) => row.market === source.asset.market)),
      );
      const rows = rowsAtTimeframe(input.rows.get(ref.key) ?? [], source.timeframe, sourceCalendar);
      sourceSeries.set(source.id, {
        sourceId: source.id,
        symbol: source.asset.symbol,
        market: source.asset.market,
        assetType: source.asset.assetType,
        field: source.series[0] ?? 'close',
        timeframe: source.timeframe,
        adjusted: false,
        points: rows.flatMap((row) => {
          if (typeof row.occurredAt !== 'string' || typeof row.availableAt !== 'string') return [];
          const value = row[source.series[0] ?? 'close'];
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
  const adapter = createExchangeSizingAdapter({
    sizingForIntent: (intent: SimulationTargetIntent) => {
      const next = bars.find((bar) => Date.parse(bar.openedAt) > Date.parse(intent.occurredAt));
      const state = ledger.snapshot();
      return {
        rule: input.strategy.sizing,
        executionCurrency: fact.currency,
        lotSize: fact.lotSize,
        currentQuantity: state.position.quantity,
        evaluationAt: next?.openAvailableAt ?? intent.occurredAt,
        ...(next
          ? {
              price: {
                value: next.open,
                occurredAt: next.openedAt,
                availableAt: next.openAvailableAt,
              },
            }
          : {}),
        equity: {
          amount: state.cash[fact.currency].settled,
          currency: fact.currency,
          occurredAt: intent.occurredAt,
          availableAt: intent.occurredAt,
        },
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
        availableQuantity: ledger.snapshot().position.settledQuantity,
      },
      costs: {
        version: 'snapshot-cost-v1',
        commissionRate: input.strategy.cost.commissionRate,
        slippageRate: input.strategy.cost.slippageRate,
        ...(input.strategy.cost.minimumCommission === undefined
          ? {}
          : { minimumCommission: input.strategy.cost.minimumCommission }),
      },
    }),
  });
  const actionRows = rowsForPurpose(input.rows, 'corporateActions');
  const corporateActions = actionRows.map(toCorporateAction);
  const executionSource = input.strategy.signalSources.find(
    (source) =>
      source.asset.symbol === instrument.symbol && source.asset.market === instrument.market,
  );
  const executionSeries = executionSource ? sourceSeries.get(executionSource.id) : undefined;
  const ticks = (
    executionSeries?.points ??
    bars.map((bar) => ({ occurredAt: bar.occurredAt, availableAt: bar.availableAt }))
  ).map((point) => ({
    occurredAt: point.availableAt,
    availableAt: point.availableAt,
    timeframe: input.strategy.primaryTimeframe,
  }));
  const indicatorSeries = new Map<string, BacktestSeries>();
  indicatorSeriesFor(input.strategy.entry, sourceSeries, indicatorSeries);
  indicatorSeriesFor(input.strategy.exit, sourceSeries, indicatorSeries);
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
          if (plan?.status === 'filled')
            ledger.applyEvent({ type: 'fill', payload: plan.ledgerFill }, fill.availableAt);
          if (fill.side === 'buy' && positionOpenedAt === undefined)
            positionOpenedAt = fill.occurredAt;
          if (fill.side === 'sell' && ledger.snapshot().position.quantity === '0')
            positionOpenedAt = undefined;
        } else if (mutation.type === 'cashSettlement') {
          const settlement = mutation.payload as unknown as SimulationSettlement;
          ledger.applyEvent({ type: 'settlement', payload: settlement }, settlement.availableAt);
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
  const firstAt = ticks[0]?.occurredAt ?? `${input.runConfig.startDate}T00:00:00.000Z`;
  const lastAt = ticks.at(-1)?.occurredAt ?? `${input.runConfig.endDate}T00:00:00.000Z`;
  const finalPrice = bars.at(-1)?.open ?? '0';
  const fxRates = fxRatesFrom(input.rows);
  const initialValuation = valueSimulationLedger(new SimulationLedger(ledgerConfig).snapshot(), {
    valuationAt: firstAt,
    policy: input.runConfig.valuationPolicy,
    prices: [],
    fxRates,
  });
  const finalValuation = valueSimulationLedger(ledger.snapshot(), {
    valuationAt: lastAt,
    policy: input.runConfig.valuationPolicy,
    prices: [
      {
        symbol: instrument.symbol,
        market: instrument.market,
        assetType: instrument.assetType,
        currency: fact.currency,
        price: finalPrice,
        occurredAt: lastAt,
        availableAt: lastAt,
      },
    ],
    fxRates,
  });
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
    periodsPerYear: input.strategy.primaryTimeframe === '1d' ? 252 : 252 * 6.5 * 60,
    trades: trades.trades,
    equityCurve: [
      {
        occurredAt: firstAt,
        value: {
          amount:
            initialValuation.baseCurrencyValue ??
            input.runConfig.initialCash[input.runConfig.baseCurrency] ??
            '0',
          currency: input.runConfig.baseCurrency,
        },
      },
      {
        occurredAt: lastAt,
        value: {
          amount:
            finalValuation.baseCurrencyValue ??
            ledger.snapshot().cash[input.runConfig.baseCurrency].settled,
          currency: input.runConfig.baseCurrency,
        },
      },
    ],
  });
  return { fills, rejects: simulation.rejects, trades: trades.trades, analytics };
};

export type { ExchangeVerticalResult };
