import type { LedgerEvent } from './ledger-contract.js';
import { DecimalValue } from './decimal.js';
import { baselineObservationReductions } from './baseline-observation-remainders.js';
import type { TradeCostIssueCode } from './trade-projection.js';

type BaselineObservation = Extract<
  Exclude<LedgerEvent, { revisionAction: 'VOID' }>,
  { type: 'POSITION_BASELINE_OBSERVATION' }
>;

type BaselineCostSource = {
  source: 'ENTRY_LEG' | 'BASELINE_COMPONENT';
  currency: string;
  remainingQuantity: DecimalValue;
  rawCost: DecimalValue | null;
  remainingRawCost: DecimalValue | null;
};

type BaselineCostState = {
  sources: BaselineCostSource[];
  estimated: boolean;
  issues: Set<TradeCostIssueCode>;
};

const zero = () => DecimalValue.from('0');
const remainingQuantityOf = (sources: readonly BaselineCostSource[]) =>
  sources.reduce((total, source) => total.plus(source.remainingQuantity), zero());

const remainingCostOf = (sources: readonly BaselineCostSource[], currency: string) => {
  let total = zero();
  for (const source of sources) {
    if (source.remainingQuantity.isZero()) continue;
    if (source.currency !== currency || source.remainingRawCost === null) return null;
    total = total.plus(source.remainingRawCost);
  }
  return total;
};

export const reduceBaselineCostRemainders = (
  state: BaselineCostState,
  observedQuantity: DecimalValue,
) => {
  for (const reduction of baselineObservationReductions(state.sources, observedQuantity)) {
    const source = state.sources[reduction.sourceIndex]!;
    const consumedCost =
      source.rawCost === null || source.remainingRawCost === null
        ? null
        : source.rawCost.minus(source.remainingRawCost);
    const remainingCost =
      source.remainingRawCost === null
        ? null
        : source.remainingRawCost
            .times(reduction.remainingQuantity)
            .dividedBy(source.remainingQuantity);
    source.remainingQuantity = reduction.remainingQuantity;
    source.remainingRawCost = remainingCost;
    source.rawCost =
      consumedCost === null || remainingCost === null ? null : consumedCost.plus(remainingCost);
  }
};

export const revalueBaselineSources = (input: {
  event: BaselineObservation;
  state: BaselineCostState;
  observedQuantity: DecimalValue;
}) => {
  const { event, state, observedQuantity } = input;
  const baselines = state.sources.filter((source) => source.source === 'BASELINE_COMPONENT');
  const executions = state.sources.filter((source) => source.source !== 'BASELINE_COMPONENT');
  const baselineQuantity = observedQuantity.minus(remainingQuantityOf(executions));
  if (baselineQuantity.isNegative()) return;

  const averageCost =
    event.payload.averageCost === undefined ? null : DecimalValue.from(event.payload.averageCost);
  if (averageCost === null) return;

  const executionCost = remainingCostOf(executions, event.payload.currency);
  if (executionCost === null) {
    state.estimated = true;
    state.issues.add('BASELINE_COST_UNKNOWN');
    if (executions.some((source) => source.currency !== event.payload.currency))
      state.issues.add('TRADE_CURRENCY_MISMATCH');
    return;
  }

  const observedCost = observedQuantity.times(averageCost);
  const targetBaselineCost = observedCost.minus(executionCost);
  if (targetBaselineCost.isNegative()) {
    state.estimated = true;
    state.issues.add('BASELINE_COST_CONFLICT');
    return;
  }
  if (baselineQuantity.isZero()) {
    if (!targetBaselineCost.isZero()) {
      state.estimated = true;
      state.issues.add('BASELINE_COST_CONFLICT');
    }
    return;
  }
  if (baselines.length === 0) return;

  const activeBaselines = baselines.filter((source) => source.remainingQuantity.isPositive());
  if (activeBaselines.length === 0) return;

  let allocated = zero();
  for (const [index, source] of activeBaselines.entries()) {
    const isLast = index === activeBaselines.length - 1;
    const remainingCost = isLast
      ? targetBaselineCost.minus(allocated)
      : targetBaselineCost.times(source.remainingQuantity).dividedBy(baselineQuantity);
    const consumedCost =
      source.rawCost === null || source.remainingRawCost === null
        ? null
        : source.rawCost.minus(source.remainingRawCost);
    source.remainingRawCost = remainingCost;
    source.rawCost = consumedCost === null ? remainingCost : consumedCost.plus(remainingCost);
    allocated = allocated.plus(remainingCost);
  }
  for (const source of baselines) {
    if (source.remainingQuantity.isZero() && source.remainingRawCost !== null)
      source.remainingRawCost = zero();
  }
};
