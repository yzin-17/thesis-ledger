import { DecimalValue } from './decimal.js';
import { journalReviewObjectTimes, journalReviewWindow } from './journal-review.js';
import type {
  JournalAnalysisInput,
  JournalAnalysisSlice,
  JournalDecimalMetric,
  JournalMetricUnit,
} from './journal-analysis-contract.js';

export function journalMetric(
  value: string | DecimalValue | null,
  unit: JournalMetricUnit,
  currency: string | null = null,
  missingEvidence: string[] = ['VALUE_MISSING'],
): JournalDecimalMetric {
  if (value === null)
    return { status: 'INSUFFICIENT_EVIDENCE', value: null, unit, currency, missingEvidence };
  return {
    status: 'AVAILABLE',
    value: DecimalValue.from(value).toString(),
    unit,
    currency,
    missingEvidence: [],
  };
}

export function journalMetricDifference(
  actual: JournalDecimalMetric,
  planned: JournalDecimalMetric,
) {
  if (actual.value === null || planned.value === null)
    return journalMetric(null, actual.unit, actual.currency, [
      ...actual.missingEvidence,
      ...planned.missingEvidence,
    ]);
  return journalMetric(
    DecimalValue.from(actual.value).minus(planned.value),
    actual.unit,
    actual.currency,
  );
}

export function journalAnalysisScope(input: JournalAnalysisInput) {
  const times = journalReviewObjectTimes(input.trade, input.reference);
  const reference = input.reference;
  const slices =
    reference.reviewObjectType === 'TRADE_CYCLE'
      ? input.trade.closeSlices
      : input.trade.closeSlices.filter((row) => row.id === reference.closeSliceId);
  const currencies = new Set(slices.map((row) => row.currency));
  const currency = currencies.size === 1 ? slices[0]!.currency : null;
  const time =
    input.reference.reviewObjectType === 'TRADE_CYCLE' ? times.effectiveClosedAt : times.executedAt;
  const corporate = input.trade.corporateActions.some((row) => {
    if (
      input.reference.reviewObjectType === 'TRADE_CYCLE' ||
      row.occurredAt === null ||
      time === null
    )
      return true;
    const actionTime = journalReviewWindow({ start: row.occurredAt }).startEpochSeconds!;
    const endTime = journalReviewWindow({ start: time }).startEpochSeconds!;
    return DecimalValue.from(actionTime).compareTo(endTime) <= 0;
  });
  return { slices, currency, time, corporate, times };
}

function weightedPrice(
  rows: readonly { price: string | null; quantity: string; currency: string }[],
) {
  const currencies = new Set(rows.map((row) => row.currency));
  const currency = currencies.size === 1 ? rows[0]!.currency : null;
  if (rows.length === 0) return journalMetric(null, 'PRICE', currency, ['EXECUTION_PRICE_MISSING']);
  if (currency === null) return journalMetric(null, 'PRICE', null, ['FX_MISSING']);
  if (rows.some((row) => row.price === null))
    return journalMetric(null, 'PRICE', currency, ['EXECUTION_PRICE_MISSING']);
  const quantity = rows.reduce((total, row) => total.plus(row.quantity), DecimalValue.from('0'));
  if (!quantity.isPositive())
    return journalMetric(null, 'PRICE', currency, ['EXECUTION_QUANTITY_MISSING']);
  const value = rows.reduce(
    (total, row) => total.plus(DecimalValue.from(row.price!).times(row.quantity)),
    DecimalValue.from('0'),
  );
  return journalMetric(value.dividedBy(quantity), 'PRICE', currency);
}

function entryPrice(input: JournalAnalysisInput, scope: ReturnType<typeof journalAnalysisScope>) {
  if (scope.corporate)
    return journalMetric(null, 'PRICE', scope.currency, ['CORPORATE_ACTION_PRICE_BASIS']);
  if (input.reference.reviewObjectType === 'TRADE_CYCLE') {
    if (input.trade.baselineComponents.some((row) => DecimalValue.from(row.quantity).isPositive()))
      return journalMetric(null, 'PRICE', scope.currency, ['BASELINE_NOT_EXECUTION']);
    return weightedPrice(
      input.trade.entryLegs.map((row) => ({ ...row, quantity: row.originalQuantity })),
    );
  }
  const allocations = scope.slices[0]!.allocations;
  if (allocations.some((row) => row.source === 'BASELINE_COMPONENT'))
    return journalMetric(null, 'PRICE', scope.currency, ['BASELINE_NOT_EXECUTION']);
  const entries = new Map(input.trade.entryLegs.map((row) => [row.factId, row]));
  if (allocations.some((row) => !entries.has(row.sourceFactId)))
    return journalMetric(null, 'PRICE', scope.currency, ['ENTRY_SOURCE_MISSING']);
  return weightedPrice(
    allocations.map((row) => ({ ...entries.get(row.sourceFactId)!, quantity: row.quantity })),
  );
}

function holdingDays(input: JournalAnalysisInput, time: string | null) {
  if (input.trade.openedAt === null)
    return journalMetric(null, 'DAYS', null, ['UNKNOWN_OPENED_AT']);
  if (time === null) return journalMetric(null, 'DAYS', null, ['EXIT_TIME_MISSING']);
  const start = journalReviewWindow({ start: input.trade.openedAt }).startEpochSeconds!;
  const end = journalReviewWindow({ start: time }).startEpochSeconds!;
  const duration = DecimalValue.from(end).minus(start);
  if (duration.isNegative()) return journalMetric(null, 'DAYS', null, ['TIME_ORDER_CONFLICT']);
  return journalMetric(duration.dividedBy('86400'), 'DAYS');
}

export function journalPlannedActualMetrics(
  input: JournalAnalysisInput,
  scope: ReturnType<typeof journalAnalysisScope>,
) {
  const actualEntryPrice = entryPrice(input, scope);
  let actualExitPrice: JournalDecimalMetric;
  if (input.reference.reviewObjectType === 'TRADE_CYCLE' && scope.corporate)
    actualExitPrice = journalMetric(null, 'PRICE', scope.currency, [
      'CORPORATE_ACTION_PRICE_BASIS',
    ]);
  else actualExitPrice = weightedPrice(scope.slices);
  const plannedEntryPrice = journalMetric(
    input.plan?.plannedEntry ?? null,
    'PRICE',
    actualEntryPrice.currency,
    ['PLANNED_ENTRY_MISSING'],
  );
  const plannedExitPrice = journalMetric(
    input.plan?.plannedExit ?? null,
    'PRICE',
    actualExitPrice.currency,
    ['PLANNED_EXIT_MISSING'],
  );
  const actualHoldingDays = holdingDays(input, scope.time);
  const plannedHoldingDays = journalMetric(
    input.plan?.expectedHoldingDays?.toString() ?? null,
    'DAYS',
    null,
    ['PLANNED_HOLDING_DAYS_MISSING'],
  );
  const stopPrice = journalMetric(input.plan?.stopLoss ?? null, 'PRICE', actualExitPrice.currency, [
    'PLANNED_STOP_MISSING',
  ]);
  let entryPriceDeviationRatio = journalMetric(null, 'RATIO', null, [
    ...actualEntryPrice.missingEvidence,
    ...plannedEntryPrice.missingEvidence,
  ]);
  if (plannedEntryPrice.value !== null && !DecimalValue.from(plannedEntryPrice.value).isPositive())
    entryPriceDeviationRatio = journalMetric(null, 'RATIO', null, ['PLANNED_ENTRY_NON_POSITIVE']);
  else if (plannedEntryPrice.value !== null && actualEntryPrice.value !== null)
    entryPriceDeviationRatio = journalMetric(
      DecimalValue.from(actualEntryPrice.value).dividedBy(plannedEntryPrice.value).minus('1'),
      'RATIO',
    );
  let stopExitDeviation = journalMetricDifference(actualExitPrice, stopPrice);
  let exitPriceDeviation = journalMetricDifference(actualExitPrice, plannedExitPrice);
  if (scope.corporate) {
    stopExitDeviation = journalMetric(null, 'PRICE', actualExitPrice.currency, [
      'CORPORATE_ACTION_PRICE_BASIS',
    ]);
    exitPriceDeviation = journalMetric(null, 'PRICE', actualExitPrice.currency, [
      'CORPORATE_ACTION_PRICE_BASIS',
    ]);
  }
  if (stopPrice.value !== null && !DecimalValue.from(stopPrice.value).isPositive())
    stopExitDeviation = journalMetric(null, 'PRICE', actualExitPrice.currency, [
      'STOP_PRICE_NON_POSITIVE',
    ]);
  return {
    actualEntryPrice,
    actualExitPrice,
    plannedEntryPrice,
    plannedExitPrice,
    entryPriceDeviation: journalMetricDifference(actualEntryPrice, plannedEntryPrice),
    entryPriceDeviationRatio,
    exitPriceDeviation,
    actualHoldingDays,
    plannedHoldingDays,
    holdingDayDeviation: journalMetricDifference(actualHoldingDays, plannedHoldingDays),
    plannedStopPrice: stopPrice,
    stopExitDeviation,
  };
}

export function journalCounterfactual(
  input: JournalAnalysisInput,
  slices: readonly JournalAnalysisSlice[],
  actualPnl: JournalDecimalMetric,
  currency: string | null,
  corporate: boolean,
) {
  const missing = [...actualPnl.missingEvidence];
  const stop = input.plan?.stopLoss ?? null;
  if (stop === null) missing.push('PLANNED_STOP_MISSING');
  else if (!DecimalValue.from(stop).isPositive()) missing.push('STOP_PRICE_NON_POSITIVE');
  if (corporate) missing.push('CORPORATE_ACTION_PRICE_BASIS');
  if (slices.length === 0 || slices.some((row) => row.price === null))
    missing.push('EXECUTION_PRICE_MISSING');
  if (missing.length > 0 || actualPnl.value === null)
    return journalMetric(null, 'AMOUNT', currency, missing);
  const delta = slices.reduce(
    (value, row) => value.plus(DecimalValue.from(stop!).minus(row.price!).times(row.quantity)),
    DecimalValue.from('0'),
  );
  return journalMetric(DecimalValue.from(actualPnl.value).plus(delta), 'AMOUNT', currency);
}
