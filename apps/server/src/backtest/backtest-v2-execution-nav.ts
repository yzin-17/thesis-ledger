import {
  DecimalValue,
  buildBacktestAnalytics,
  projectBacktestTrades,
  SimulationLedger,
  tradingCalendarFromFact,
  evaluateSignalAt,
  evaluateNumericExpression,
  numericExpressionKey,
  CnNavSimulation,
  expectedCutoffSchedule,
  navRequestFromTargetIntent,
  createRiskEvaluationAdapter,
  valueSimulationLedger,
  type BacktestSeries,
  type SimulationFillRecord,
  type SimulationTargetIntent,
  type CnNavFact,
  type CnNavSimulationEvent,
  type BooleanExpression,
  type NumericEvaluation,
  type SimulationEngineInput,
  type BacktestVerticalInput,
  type ExchangeVerticalResult,
  calendarFact,
  fxRatesFrom,
  indicatorSeriesFor,
  initialLedgerConfig,
  latestPointAt,
  numericExpressionsIn,
  rowFor,
  rowsForPurpose,
  signalArtifactFor,
  sourceSeriesKey,
  stringField,
} from './backtest-v2-execution-shared.js';
import {
  calculateNavExecutionModelFee,
  ExecutionModelUnavailableError,
  navLocalDate,
  resolveExecutionModelSegment,
  tradingDateAfter,
  tradingSessionStartAt,
  type FrozenExecutionModel,
  type FrozenNavExecutionModelSegment,
} from '@thesis-ledger/domain';

const laterTime = (left: string, right: string) =>
  Date.parse(left) >= Date.parse(right) ? left : right;
export const runCnNavVertical = (input: BacktestVerticalInput): ExchangeVerticalResult => {
  const instrument = input.strategy.executionInstrument;
  if (
    instrument.market !== 'CN' ||
    instrument.assetType !== 'fund' ||
    input.strategy.primaryTimeframe !== '1d'
  ) {
    throw new Error('NAV Fund 只支持 CN 1d');
  }
  const calendarRow = rowFor(rowsForPurpose(input.rows, 'calendar'), (row) => row.market === 'CN');
  const calendar = tradingCalendarFromFact(calendarFact(calendarRow));
  const ledgerConfig = initialLedgerConfig(input.strategy, input.runConfig);
  const executionModel = input.runConfig.executionModel;
  const navFacts = rowsForPurpose(input.rows, 'nav').map((row): CnNavFact => ({
    symbol: stringField(row, 'symbol'),
    market: 'CN',
    instrumentType: 'NAV_FUND',
    nav: typeof row.nav === 'string' ? row.nav : null,
    valuationDate: stringField(row, 'valuationDate'),
    occurredAt: stringField(row, 'occurredAt'),
    availableAt: stringField(row, 'availableAt'),
    provider: stringField(row, 'provider'),
    providerRevision: stringField(row, 'providerRevision'),
    freshness: row.freshness as CnNavFact['freshness'],
    quality: row.quality as CnNavFact['quality'],
    status: row.status as CnNavFact['status'],
    ...(typeof row.reason === 'string' ? { reason: row.reason } : {}),
  }));
  const nav = new CnNavSimulation({
    executionInstrument: ledgerConfig.executionInstrument,
    ledgerConfig,
    calendar,
    calendarVersion: input.calendarVersion,
    cutoffLocalTime: '15:00',
    timeframe: '1d',
    ...(executionModel ? { executionModel, dataAsOf: input.runConfig.dataAsOf } : {}),
  });
  const sourceSeries = new Map<string, BacktestSeries>();
  for (const source of input.strategy.signalSources) {
    const ref = signalArtifactFor(input.artifacts, source.asset.market, source.asset.symbol);
    if (!ref) continue;
    const points = (input.rows.get(ref.key) ?? []).flatMap((row) => {
      if (
        typeof row.occurredAt !== 'string' ||
        typeof row.availableAt !== 'string' ||
        typeof row.nav !== 'string'
      )
        return [];
      return [
        {
          occurredAt: row.occurredAt,
          availableAt: row.availableAt,
          value: row.nav,
          status: 'available' as const,
        },
      ];
    });
    sourceSeries.set(sourceSeriesKey(source.id, 'nav'), {
      sourceId: source.id,
      symbol: source.asset.symbol,
      market: source.asset.market,
      assetType: source.asset.assetType,
      field: 'nav',
      timeframe: source.timeframe,
      adjusted: false,
      points,
    });
  }
  const points = sourceSeries.values().next().value?.points ?? [];
  const indicatorSeries = new Map<string, BacktestSeries>();
  indicatorSeriesFor(input.strategy.entry, sourceSeries, indicatorSeries);
  indicatorSeriesFor(input.strategy.exit, sourceSeries, indicatorSeries);
  const riskAdapter = createRiskEvaluationAdapter({
    riskInputAt: (context) => {
      const position = context.positionState ?? {
        quantity: '0',
        averageCost: '0',
        holdingPeriods: 0,
        isOpen: false,
        availableAt: context.tick.occurredAt,
      };
      const price = latestPointAt(
        sourceSeries.values().next().value,
        context.tick.occurredAt,
      )?.value;
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
          ...(price === undefined ? { status: 'unavailable' as const, reason: 'NAV 缺失' } : {}),
        },
        evaluationAt: context.tick.occurredAt,
      };
    },
  });
  let positionOpenedAt: string | undefined;
  const signalInput: SimulationEngineInput = {
    runId: input.runId,
    strategy: {
      entry: input.strategy.entry,
      exit: input.strategy.exit,
      executionInstrument: input.strategy.executionInstrument,
      primaryTimeframe: '1d',
    },
    ticks: [],
    sourceSeries,
    indicatorSeries,
    risk: (context) => riskAdapter.asSimulationRisk(context),
    positionStateAt: (tick) => {
      const state = nav.snapshot().ledger.position;
      return {
        isOpen: state.quantity !== '0',
        quantity: state.quantity,
        averageCost: state.averageCost,
        holdingPeriods:
          positionOpenedAt === undefined
            ? 0
            : points.filter(
                (point) =>
                  Date.parse(point.occurredAt) >= Date.parse(positionOpenedAt!) &&
                  Date.parse(point.occurredAt) <= Date.parse(tick.occurredAt),
              ).length,
        availableAt: tick.occurredAt,
      };
    },
  };
  const rejects: ExchangeVerticalResult['rejects'][number][] = [];
  const events: { event: CnNavSimulationEvent; availableAt: string; phase: number }[] = [];
  const appliedEventIds = new Set<string>();
  let pendingSide: 'buy' | 'sell' | undefined;
  const flushEvents = (through?: string) => {
    events.sort(
      (left, right) =>
        Date.parse(left.availableAt) - Date.parse(right.availableAt) ||
        left.phase - right.phase ||
        left.event.payload.eventId.localeCompare(right.event.payload.eventId),
    );
    for (const item of events) {
      if (appliedEventIds.has(item.event.payload.eventId)) continue;
      if (through && Date.parse(item.availableAt) > Date.parse(through)) continue;
      const before = nav.snapshot().ledger.position.quantity;
      const result = nav.applyEvent(item.event, item.availableAt);
      appliedEventIds.add(item.event.payload.eventId);
      if (!result.applied) {
        const payload = item.event.payload;
        const occurredAt = 'fact' in payload ? payload.fact.occurredAt : payload.occurredAt;
        rejects.push({ reason: result.reason, code: result.code, occurredAt });
        continue;
      }
      const after = nav.snapshot().ledger.position.quantity;
      if (before === '0' && after !== '0') {
        positionOpenedAt = item.availableAt;
        pendingSide = undefined;
      } else if (before !== '0' && after === '0') {
        positionOpenedAt = undefined;
        pendingSide = undefined;
      }
    }
  };
  let edgeState: Parameters<typeof evaluateSignalAt>[2] = {};
  const previousNumeric = new Map<string, NumericEvaluation>();
  let sequence = 0;
  for (const point of points) {
    const tick = {
      occurredAt: point.availableAt,
      availableAt: point.availableAt,
      timeframe: '1d' as const,
    };
    flushEvents(tick.occurredAt);
    const evaluation = evaluateSignalAt(signalInput, tick, edgeState, sequence, previousNumeric);
    edgeState = evaluation.state;
    const position = signalInput.positionStateAt?.(tick);
    const context = {
      tick,
      sourceSeries,
      indicatorSeries,
      ...(position ? { positionState: position } : {}),
      previousNumeric,
    };
    for (const expression of [
      ...numericExpressionsIn(input.strategy.entry as BooleanExpression),
      ...numericExpressionsIn(input.strategy.exit as BooleanExpression),
    ]) {
      const value = evaluateNumericExpression(expression, context);
      if (value.status === 'available')
        previousNumeric.set(numericExpressionKey(expression), value);
    }
    const signal = evaluation.signal;
    sequence += 1;
    if (!signal || pendingSide) continue;
    const hasPosition = nav.snapshot().ledger.position.quantity !== '0';
    if ((signal.kind === 'entry' && hasPosition) || (signal.kind !== 'entry' && !hasPosition)) {
      continue;
    }
    const intent: SimulationTargetIntent = {
      intentId: `${input.runId}:nav-intent:${sequence}`,
      signalId: signal.signalId,
      executionSymbol: signal.executionSymbol,
      side: signal.kind === 'entry' ? 'buy' : 'sell',
      reason: signal.kind === 'risk' ? 'risk' : 'signal',
      occurredAt: tick.occurredAt,
      availableAt: signal.availableAt,
    };
    const request = navRequestFromTargetIntent(intent, {
      requestAt: intent.occurredAt,
      sizing: {
        rule: input.strategy.sizing,
        executionCurrency: 'CNY',
        lotSize: '0.000001',
        currentQuantity: nav.snapshot().ledger.position.quantity,
        evaluationAt: intent.occurredAt,
        ...(point.value
          ? {
              price: {
                value: point.value,
                occurredAt: point.occurredAt,
                availableAt: point.availableAt,
              },
            }
          : {}),
        equity: {
          amount: nav.snapshot().ledger.cash.CNY.settled,
          currency: 'CNY',
          occurredAt: intent.occurredAt,
          availableAt: intent.occurredAt,
        },
      },
    });
    if (!('requestId' in request)) {
      rejects.push({
        reason: request.reason,
        code: request.reasonCode,
        occurredAt: intent.occurredAt,
      });
      continue;
    }
    let modelSegment: FrozenNavExecutionModelSegment | undefined;
    if (executionModel) {
      try {
        const selected = resolveExecutionModelSegment<FrozenNavExecutionModelSegment>(
          executionModel as FrozenExecutionModel & {
            segments: readonly FrozenNavExecutionModelSegment[];
          },
          {
            expectedVersion: executionModel.version,
            symbol: intent.executionSymbol,
            market: 'CN',
            instrumentType: 'NAV_FUND',
            currency: 'CNY',
            evaluatedAt: intent.occurredAt,
            dataAsOf: input.runConfig.dataAsOf,
          },
        );
        if (selected.execution.mode !== 'nav') {
          rejects.push({
            orderId: request.requestId,
            reason: 'Exchange 执行模型不能用于 NAV',
            code: 'RULE_REJECTED',
            occurredAt: intent.occurredAt,
          });
          continue;
        }
        modelSegment = selected;
      } catch (error) {
        if (!(error instanceof ExecutionModelUnavailableError)) throw error;
        rejects.push({
          orderId: request.requestId,
          reason: error.message,
          code: 'RULE_REJECTED',
          occurredAt: intent.occurredAt,
        });
        continue;
      }
    }
    const schedule = expectedCutoffSchedule(
      intent.occurredAt,
      calendar,
      modelSegment?.execution.cutoffLocalTime ?? '15:00',
    );
    const priced = schedule
      ? navFacts.find(
          (candidate) =>
            candidate.symbol === instrument.symbol &&
            candidate.valuationDate === schedule.valuationDate,
        )
      : undefined;
    if (!schedule || !priced || priced.nav === null) {
      rejects.push({
        orderId: request.requestId,
        reason: 'NAV 尚未 available',
        code: 'NAV_DELAYED',
        occurredAt: intent.occurredAt,
      });
      continue;
    }
    pendingSide = intent.side;
    const availableAt = priced.availableAt;
    const confirmationAt = modelSegment
      ? laterTime(
          availableAt,
          tradingSessionStartAt(
            calendar,
            tradingDateAfter(
              calendar,
              schedule.valuationDate,
              modelSegment.execution.confirmationAfterTradingDays,
            ) ?? schedule.valuationDate,
          ) ?? availableAt,
        )
      : availableAt;
    events.push({
      phase: 0,
      availableAt: request.availableAt,
      event: { type: 'request', payload: request },
    });
    events.push({
      phase: 1,
      availableAt: laterTime(request.availableAt, schedule.cutoffAt),
      event: {
        type: 'cutoff',
        payload: {
          eventId: `${request.requestId}:cutoff`,
          requestId: request.requestId,
          cutoffAt: schedule.cutoffAt,
          valuationDate: schedule.valuationDate,
          occurredAt: schedule.cutoffAt,
          availableAt: schedule.cutoffAt,
        },
      },
    });
    events.push({
      phase: 2,
      availableAt,
      event: {
        type: 'nav',
        payload: {
          eventId: `${request.requestId}:nav`,
          requestId: request.requestId,
          fact: priced,
        },
      },
    });
    events.push({
      phase: 3,
      availableAt: confirmationAt,
      event: {
        type: 'confirmation',
        payload: {
          eventId: `${request.requestId}:confirmation`,
          requestId: request.requestId,
          occurredAt: confirmationAt,
          availableAt: confirmationAt,
        },
      },
    });
    let fee = DecimalValue.from(request.fee ?? '0');
    if (modelSegment) {
      const gross =
        request.requestType === 'subscribe'
          ? DecimalValue.from(request.amount ?? '0')
          : DecimalValue.from(request.shares ?? '0').times(priced.nav);
      fee = DecimalValue.from(
        calculateNavExecutionModelFee(
          request.requestType === 'subscribe'
            ? modelSegment.execution.subscriptionFee
            : modelSegment.execution.redemptionFee,
          {
            code: request.requestType === 'subscribe' ? 'subscriptionFee' : 'redemptionFee',
            side: request.requestType === 'subscribe' ? 'buy' : 'sell',
            basis:
              request.requestType === 'subscribe'
                ? 'subscriptionApplicationAmount'
                : 'redemptionGrossProceeds',
            gross: gross.toString(),
            currency: 'CNY',
          },
        ).amount,
      );
    }
    const cash =
      request.requestType === 'subscribe'
        ? DecimalValue.from(request.amount ?? '0')
            .plus(fee)
            .toString()
        : DecimalValue.from(request.shares ?? '0')
            .times(priced.nav)
            .minus(fee)
            .toString();
    if (request.requestType === 'subscribe') {
      const shareAvailableAt = modelSegment
        ? laterTime(
            confirmationAt,
            tradingSessionStartAt(
              calendar,
              tradingDateAfter(
                calendar,
                navLocalDate(confirmationAt, calendar.timezone) ?? schedule.valuationDate,
                modelSegment.execution.sellableAfterConfirmationTradingDays,
              ) ?? schedule.valuationDate,
            ) ?? confirmationAt,
          )
        : availableAt;
      const shares = DecimalValue.from(request.amount ?? '0')
        .dividedBy(priced.nav)
        .toString();
      events.push({
        phase: 4,
        availableAt: shareAvailableAt,
        event: {
          type: 'shareAvailable',
          payload: {
            eventId: `${request.requestId}:shares`,
            requestId: request.requestId,
            shares,
            occurredAt: shareAvailableAt,
            availableAt: shareAvailableAt,
          },
        },
      });
    }
    const redemptionCashAt =
      request.requestType === 'redeem' && modelSegment
        ? laterTime(
            confirmationAt,
            tradingSessionStartAt(
              calendar,
              tradingDateAfter(
                calendar,
                navLocalDate(confirmationAt, calendar.timezone) ?? schedule.valuationDate,
                modelSegment.execution
                  .redemptionReinvestableAfterConfirmationTradingDays,
              ) ?? schedule.valuationDate,
          ) ?? confirmationAt,
        )
        : availableAt;
    const subscriptionCashAt =
      request.requestType === 'subscribe' && modelSegment ? confirmationAt : availableAt;
    events.push({
      phase: 5,
      availableAt: request.requestType === 'subscribe' ? subscriptionCashAt : redemptionCashAt,
      event: {
        type: request.requestType === 'subscribe' ? 'cashSettlement' : 'redemptionCash',
        payload: {
          eventId: `${request.requestId}:cash`,
          requestId: request.requestId,
          amount: cash,
          occurredAt: request.requestType === 'subscribe' ? subscriptionCashAt : redemptionCashAt,
          availableAt: request.requestType === 'subscribe' ? subscriptionCashAt : redemptionCashAt,
        },
      },
    });
    flushEvents(tick.occurredAt);
  }
  flushEvents();
  const state = nav.snapshot();
  const fills: SimulationFillRecord[] = state.requests.flatMap((request) =>
    request.fillId && request.nav && request.confirmedShares && request.confirmationAt
      ? [
          {
            fillId: request.fillId,
            orderId: `${request.requestId}:nav`,
            executionSymbol: request.executionSymbol,
            side: request.requestType === 'subscribe' ? ('buy' as const) : ('sell' as const),
            quantity: request.confirmedShares,
            price: request.nav,
            charges: [{ amount: request.fee, currency: 'CNY' as const }],
            occurredAt: request.confirmationAt,
            availableAt: request.confirmationAt,
            reason: 'signal' as const,
          },
        ]
      : [],
  );
  const trades = projectBacktestTrades(
    fills.map((fill) => ({ ...fill, charges: [...fill.charges] })),
    { executionSymbol: instrument.symbol, currency: 'CNY' },
  );
  const firstAt = points[0]?.availableAt ?? `${input.runConfig.startDate}T00:00:00.000Z`;
  const lastAt = points.at(-1)?.availableAt ?? `${input.runConfig.endDate}T00:00:00.000Z`;
  const navValue = [...navFacts]
    .filter(
      (fact) =>
        fact.symbol === instrument.symbol &&
        fact.nav !== null &&
        Date.parse(fact.availableAt) <= Date.parse(lastAt),
    )
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
  const fxRates = fxRatesFrom(input.rows);
  const initialValuation = valueSimulationLedger(new SimulationLedger(ledgerConfig).snapshot(), {
    valuationAt: firstAt,
    policy: input.runConfig.valuationPolicy,
    prices: [],
    fxRates,
  });
  const finalValuation = valueSimulationLedger(state.ledger, {
    valuationAt: lastAt,
    policy: input.runConfig.valuationPolicy,
    prices: navValue
      ? [
          {
            symbol: instrument.symbol,
            market: 'CN',
            assetType: 'fund',
            currency: 'CNY',
            price: navValue.nav!,
            occurredAt: navValue.occurredAt,
            availableAt: navValue.availableAt,
          },
        ]
      : [],
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
    periodsPerYear: 252,
    unavailableReasons: executionModel
      ? rejects.map((reject) => `${reject.code}:${reject.reason}`)
      : [],
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
            state.ledger.cash[input.runConfig.baseCurrency].settled,
          currency: input.runConfig.baseCurrency,
        },
      },
    ],
  });
  return { fills, rejects, trades: trades.trades, analytics };
};
