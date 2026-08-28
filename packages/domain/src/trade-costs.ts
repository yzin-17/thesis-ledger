import type { DecimalString, ExecutionChargeV2, LedgerEventV2 } from './ledger-v2.js';
import { DecimalValue } from './decimal.js';
import {
  projectTradeProjections,
  selectEffectiveLedgerEvents,
  type TradeCloseAllocation,
  type TradeCostIssueCode,
  type TradeCostMethod,
  type TradeCostStrategyRevision,
  type TradeProjection,
  type TradeProjectionOptions,
} from './trade-projection.js';

type EffectiveLedgerEvent = Exclude<LedgerEventV2, { revisionAction: 'VOID' }>;

export interface TradeCostProjectionOptions extends TradeProjectionOptions {
  costStrategyRevisionsByAccountId: Readonly<Record<string, readonly TradeCostStrategyRevision[]>>;
}

export type TradeCostProjectionErrorCode =
  'TRADE_COST_STRATEGY_REQUIRED' | 'TRADE_COST_ALLOCATION_FAILED';

export class TradeCostProjectionError extends Error {
  constructor(
    readonly code: TradeCostProjectionErrorCode,
    message: string,
    readonly accountId: string,
    readonly symbol: string,
    readonly eventId?: string,
  ) {
    super(message);
    this.name = 'TradeCostProjectionError';
  }
}

type FeeLineState = {
  charge: ExecutionChargeV2;
  remainingAmount: DecimalValue;
};

type CostSourceState = {
  source: TradeCloseAllocation['source'];
  eventId: string;
  factId: string;
  currency: string;
  quantity: DecimalValue;
  remainingQuantity: DecimalValue;
  rawCost: DecimalValue | null;
  remainingRawCost: DecimalValue | null;
  estimated: boolean;
  charges: FeeLineState[];
};

type SourceAllocation = {
  source: CostSourceState;
  quantity: DecimalValue;
  originalCost: DecimalValue | null;
  allocatedBuyCharges: ExecutionChargeV2[];
};

type MutableTradeCost = {
  strategyRevision: TradeCostStrategyRevision;
  sources: CostSourceState[];
  closeSlices: Map<string, TradeProjection['closeSlices'][number]>;
  grossRealizedPnl: DecimalValue | null;
  netRealizedPnl: DecimalValue | null;
  returnDenominator: DecimalValue | null;
  estimated: boolean;
  issues: Set<TradeCostIssueCode>;
};

const decimal = (value: DecimalString) => DecimalValue.from(value);
const zero = () => decimal('0');

const copyCharges = (charges: readonly ExecutionChargeV2[]) =>
  charges.map((charge) => ({ ...charge }));

const sumCharges = (charges: readonly ExecutionChargeV2[], currency: string) =>
  charges
    .filter((charge) => charge.currency === currency)
    .reduce((total, charge) => total.plus(charge.amount), zero());

const hasCurrencyMismatch = (charges: readonly ExecutionChargeV2[], currency: string) =>
  charges.some((charge) => charge.currency !== currency);

const addIssue = (state: MutableTradeCost, issue: TradeCostIssueCode) => {
  state.issues.add(issue);
};

const compareStrategyRevision = (
  left: TradeCostStrategyRevision,
  right: TradeCostStrategyRevision,
) => left.effectiveAt.localeCompare(right.effectiveAt) || left.id.localeCompare(right.id);

const selectStrategyRevision = (trade: TradeProjection, options: TradeCostProjectionOptions) => {
  const revisions = options.costStrategyRevisionsByAccountId[trade.accountId];
  const ordered = [...(revisions ?? [])].sort(compareStrategyRevision);
  if (ordered.length === 0)
    throw new TradeCostProjectionError(
      'TRADE_COST_STRATEGY_REQUIRED',
      `缺少账户成本策略 Revision: ${trade.accountId}`,
      trade.accountId,
      trade.symbol,
    );

  const boundary = trade.openedAt ?? trade.earliestEvidenceAt;
  if (boundary === null) return ordered[0]!;
  const effectiveRevision = ordered.filter((revision) => revision.effectiveAt <= boundary).at(-1);
  if (!effectiveRevision)
    throw new TradeCostProjectionError(
      'TRADE_COST_STRATEGY_REQUIRED',
      `Trade 开始时没有生效的成本策略 Revision: ${trade.id}`,
      trade.accountId,
      trade.symbol,
    );
  return effectiveRevision;
};

const createTradeCost = (
  trade: TradeProjection,
  options: TradeCostProjectionOptions,
): MutableTradeCost => ({
  strategyRevision: selectStrategyRevision(trade, options),
  sources: [],
  closeSlices: new Map(),
  grossRealizedPnl: zero(),
  netRealizedPnl: zero(),
  returnDenominator: zero(),
  estimated: false,
  issues: new Set(),
});

const createChargeStates = (charges: readonly ExecutionChargeV2[]) =>
  charges.map((charge) => ({
    charge: { ...charge },
    remainingAmount: decimal(charge.amount),
  }));

const createExecutionSource = (
  event: Extract<EffectiveLedgerEvent, { type: 'BUY_EXECUTION' }>,
): CostSourceState => {
  const quantity = decimal(event.payload.quantity);
  return {
    source: 'ENTRY_LEG',
    eventId: event.eventId,
    factId: event.factId,
    currency: event.payload.currency,
    quantity,
    remainingQuantity: quantity,
    rawCost: quantity.times(event.payload.price),
    remainingRawCost: quantity.times(event.payload.price),
    estimated: false,
    charges: createChargeStates(event.payload.charges),
  };
};

const createBaselineSource = (input: {
  event: Extract<EffectiveLedgerEvent, { type: 'POSITION_BASELINE_OBSERVATION' }>;
  quantity: DecimalValue;
  state: MutableTradeCost;
}) => {
  const { event, quantity, state } = input;
  const averageCost =
    event.payload.averageCost === undefined ? null : decimal(event.payload.averageCost);
  if (quantity.isPositive()) {
    if (averageCost === null) addIssue(state, 'BASELINE_COST_UNKNOWN');
    if (event.payload.costIncludesFees === 'UNKNOWN')
      addIssue(state, 'BASELINE_COST_SCOPE_UNKNOWN');
    state.estimated = true;
  }
  return {
    source: 'BASELINE_COMPONENT' as const,
    eventId: event.eventId,
    factId: event.factId,
    currency: event.payload.currency,
    quantity,
    remainingQuantity: quantity,
    rawCost: averageCost === null ? null : quantity.times(averageCost),
    remainingRawCost: averageCost === null ? null : quantity.times(averageCost),
    estimated: true,
    charges: [],
  } satisfies CostSourceState;
};

const currentQuantity = (state: MutableTradeCost) =>
  state.sources.reduce((total, source) => total.plus(source.remainingQuantity), zero());

const baselineSources = (state: MutableTradeCost) =>
  state.sources.filter((source) => source.source === 'BASELINE_COMPONENT');

const executionSources = (state: MutableTradeCost) =>
  state.sources.filter((source) => source.source !== 'BASELINE_COMPONENT');

const remainingQuantityOf = (sources: readonly CostSourceState[]) =>
  sources.reduce((total, source) => total.plus(source.remainingQuantity), zero());

const remainingCostOf = (sources: readonly CostSourceState[], currency: string) => {
  let total = zero();
  for (const source of sources) {
    if (source.remainingQuantity.isZero()) continue;
    if (source.currency !== currency || source.remainingRawCost === null) return null;
    total = total.plus(source.remainingRawCost);
  }
  return total;
};

const revalueBaselineSources = (input: {
  event: Extract<EffectiveLedgerEvent, { type: 'POSITION_BASELINE_OBSERVATION' }>;
  state: MutableTradeCost;
  observedQuantity: DecimalValue;
}) => {
  const { event, state, observedQuantity } = input;
  const baselines = baselineSources(state);
  const executions = executionSources(state);
  const baselineQuantity = observedQuantity.minus(remainingQuantityOf(executions));
  if (baselineQuantity.isNegative()) return;

  const averageCost =
    event.payload.averageCost === undefined ? null : decimal(event.payload.averageCost);
  if (averageCost === null) return;

  const executionCost = remainingCostOf(executions, event.payload.currency);
  if (executionCost === null) {
    state.estimated = true;
    addIssue(state, 'BASELINE_COST_UNKNOWN');
    if (executions.some((source) => source.currency !== event.payload.currency))
      addIssue(state, 'TRADE_CURRENCY_MISMATCH');
    return;
  }

  const observedCost = observedQuantity.times(averageCost);
  const targetBaselineCost = observedCost.minus(executionCost);
  if (targetBaselineCost.isNegative()) {
    state.estimated = true;
    addIssue(state, 'BASELINE_COST_CONFLICT');
    return;
  }
  if (baselineQuantity.isZero()) {
    if (!targetBaselineCost.isZero()) {
      state.estimated = true;
      addIssue(state, 'BASELINE_COST_CONFLICT');
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

const addExecutionSource = (
  event: Extract<EffectiveLedgerEvent, { type: 'BUY_EXECUTION' }>,
  state: MutableTradeCost,
) => {
  const source = createExecutionSource(event);
  state.sources.push(source);
  if (hasCurrencyMismatch(event.payload.charges, event.payload.currency)) {
    addIssue(state, 'FEE_CURRENCY_MISMATCH');
  }
};

const addBaselineSource = (
  event: Extract<EffectiveLedgerEvent, { type: 'POSITION_BASELINE_OBSERVATION' }>,
  state: MutableTradeCost,
) => {
  const observedQuantity = decimal(event.payload.quantity);
  if (observedQuantity.isZero()) {
    for (const source of state.sources) {
      source.remainingQuantity = zero();
      source.remainingRawCost = source.remainingRawCost === null ? null : zero();
      for (const charge of source.charges) charge.remainingAmount = zero();
    }
    return;
  }

  const difference = observedQuantity.minus(currentQuantity(state));
  const quantity = difference.isNegative() ? zero() : difference;
  if (quantity.isPositive()) state.sources.push(createBaselineSource({ event, quantity, state }));
  revalueBaselineSources({ event, state, observedQuantity });
};

const corporateActionMultiplier = (
  event: Extract<EffectiveLedgerEvent, { type: 'BONUS_SHARE' | 'SPLIT' | 'MERGE' }>,
  before: DecimalValue,
) => {
  if (event.type === 'BONUS_SHARE') {
    const bonusQuantity = decimal(event.payload.quantity);
    return before.plus(bonusQuantity).dividedBy(before);
  }
  return decimal(event.payload.toUnits).dividedBy(event.payload.fromUnits);
};

const scaleSources = (
  event: Extract<EffectiveLedgerEvent, { type: 'BONUS_SHARE' | 'SPLIT' | 'MERGE' }>,
  state: MutableTradeCost,
) => {
  const before = currentQuantity(state);
  if (before.isZero()) return;
  const multiplier = corporateActionMultiplier(event, before);
  for (const source of state.sources) {
    source.quantity = source.quantity.times(multiplier);
    source.remainingQuantity = source.remainingQuantity.times(multiplier);
  }
};

const consumeAmount = (input: {
  remainingAmount: DecimalValue;
  quantity: DecimalValue;
  sourceQuantity: DecimalValue;
}) => {
  const { remainingAmount, quantity, sourceQuantity } = input;
  if (quantity.compareTo(sourceQuantity) === 0) return remainingAmount;
  return remainingAmount.times(quantity).dividedBy(sourceQuantity);
};

const consumeSource = (source: CostSourceState, quantity: DecimalValue): SourceAllocation => {
  const sourceQuantity = source.remainingQuantity;
  const originalCost =
    source.remainingRawCost === null
      ? null
      : consumeAmount({
          remainingAmount: source.remainingRawCost,
          quantity,
          sourceQuantity,
        });
  if (source.remainingRawCost !== null && originalCost !== null)
    source.remainingRawCost = source.remainingRawCost.minus(originalCost);

  const allocatedBuyCharges = source.charges.map((line) => {
    const amount = consumeAmount({
      remainingAmount: line.remainingAmount,
      quantity,
      sourceQuantity,
    });
    line.remainingAmount = line.remainingAmount.minus(amount);
    return { ...line.charge, amount: amount.toString() };
  });
  source.remainingQuantity = source.remainingQuantity.minus(quantity);
  return { source, quantity, originalCost, allocatedBuyCharges };
};

const minQuantity = (left: DecimalValue, right: DecimalValue) =>
  left.compareTo(right) <= 0 ? left : right;

const allocateFifo = (state: MutableTradeCost, quantity: DecimalValue) => {
  const allocations: SourceAllocation[] = [];
  let remaining = quantity;
  for (const source of state.sources) {
    if (remaining.isZero() || source.remainingQuantity.isZero()) continue;
    const consumed = minQuantity(source.remainingQuantity, remaining);
    allocations.push(consumeSource(source, consumed));
    remaining = remaining.minus(consumed);
  }
  return { allocations, remaining };
};

const allocateAverage = (state: MutableTradeCost, quantity: DecimalValue) => {
  const sources = state.sources.filter((source) => source.remainingQuantity.isPositive());
  const totalQuantity = sources.reduce(
    (total, source) => total.plus(source.remainingQuantity),
    zero(),
  );
  const consumptions = sources.map(() => zero());
  let remaining = quantity;
  for (const [index, source] of sources.entries()) {
    if (remaining.isZero()) break;
    const proportional = quantity.times(source.remainingQuantity).dividedBy(totalQuantity);
    consumptions[index] = minQuantity(
      proportional,
      minQuantity(source.remainingQuantity, remaining),
    );
    remaining = remaining.minus(consumptions[index]);
  }
  for (let index = sources.length - 1; index >= 0 && remaining.isPositive(); index -= 1) {
    const source = sources[index]!;
    const available = source.remainingQuantity.minus(consumptions[index]!);
    const additional = minQuantity(available, remaining);
    consumptions[index] = consumptions[index]!.plus(additional);
    remaining = remaining.minus(additional);
  }
  const allocations: SourceAllocation[] = [];
  for (const [index, source] of sources.entries()) {
    if (consumptions[index]!.isZero()) continue;
    allocations.push(consumeSource(source, consumptions[index]!));
  }
  return { allocations, remaining };
};

const allocateSources = (
  state: MutableTradeCost,
  method: TradeCostMethod,
  quantity: DecimalValue,
  trade: TradeProjection,
  event: EffectiveLedgerEvent,
) => {
  const result =
    method === 'FIFO' ? allocateFifo(state, quantity) : allocateAverage(state, quantity);
  if (!result.remaining.isZero())
    throw new TradeCostProjectionError(
      'TRADE_COST_ALLOCATION_FAILED',
      `成本来源不足以分配卖出数量: ${trade.symbol}`,
      trade.accountId,
      trade.symbol,
      event.eventId,
    );
  return result.allocations;
};

const sumAllocationCosts = (allocations: readonly SourceAllocation[], currency: string) => {
  if (
    allocations.some(
      (allocation) => allocation.originalCost === null || allocation.source.currency !== currency,
    )
  )
    return null;
  return allocations.reduce((total, allocation) => total.plus(allocation.originalCost!), zero());
};

const allocatedChargesCurrency = (allocations: readonly SourceAllocation[], currency: string) =>
  allocations.reduce(
    (total, allocation) => total.plus(sumCharges(allocation.allocatedBuyCharges, currency)),
    zero(),
  );

const hasAllocationFeeCurrencyMismatch = (
  allocations: readonly SourceAllocation[],
  currency: string,
) =>
  allocations.some((allocation) => hasCurrencyMismatch(allocation.allocatedBuyCharges, currency));

const hasTradeCurrencyMismatch = (allocations: readonly SourceAllocation[], currency: string) =>
  allocations.some((allocation) => allocation.source.currency !== currency);

const combine = (current: DecimalValue | null, next: DecimalValue | null) =>
  current === null || next === null ? null : current.plus(next);

const processSell = (
  event: Extract<EffectiveLedgerEvent, { type: 'SELL_EXECUTION' }>,
  trade: TradeProjection,
  state: MutableTradeCost,
) => {
  const quantity = decimal(event.payload.quantity);
  const allocations = allocateSources(state, state.strategyRevision.method, quantity, trade, event);
  const currency = event.payload.currency;
  const rawCost = sumAllocationCosts(allocations, currency);
  const feeCurrencyMismatch =
    hasAllocationFeeCurrencyMismatch(allocations, currency) ||
    hasCurrencyMismatch(event.payload.charges, currency);
  const tradeCurrencyMismatch = hasTradeCurrencyMismatch(allocations, currency);
  if (feeCurrencyMismatch) {
    addIssue(state, 'FEE_CURRENCY_MISMATCH');
  }
  if (tradeCurrencyMismatch) addIssue(state, 'TRADE_CURRENCY_MISMATCH');
  const sliceEstimated = allocations.some((allocation) => allocation.source.estimated);
  if (sliceEstimated) state.estimated = true;

  const sellValue = quantity.times(event.payload.price);
  const grossRealizedPnl =
    rawCost === null || tradeCurrencyMismatch ? null : sellValue.minus(rawCost);
  const buyFees = allocatedChargesCurrency(allocations, currency);
  const sellFees = sumCharges(event.payload.charges, currency);
  const netRealizedPnl =
    grossRealizedPnl === null || feeCurrencyMismatch
      ? null
      : grossRealizedPnl.minus(buyFees).minus(sellFees);
  const returnDenominator =
    rawCost === null || tradeCurrencyMismatch || feeCurrencyMismatch ? null : rawCost.plus(buyFees);
  const realizedNetReturnRate =
    netRealizedPnl === null || returnDenominator === null || returnDenominator.isZero()
      ? null
      : netRealizedPnl.dividedBy(returnDenominator);
  state.grossRealizedPnl = combine(state.grossRealizedPnl, grossRealizedPnl);
  state.netRealizedPnl = combine(state.netRealizedPnl, netRealizedPnl);
  state.returnDenominator = combine(state.returnDenominator, returnDenominator);

  const baseSlice = trade.closeSlices.find((slice) => slice.factId === event.factId);
  if (!baseSlice) return;
  state.closeSlices.set(event.factId, {
    ...baseSlice,
    allocations: allocations.map((allocation) => ({
      source: allocation.source.source,
      sourceEventId: allocation.source.eventId,
      sourceFactId: allocation.source.factId,
      quantity: allocation.quantity.toString(),
      originalCost: allocation.originalCost?.toString() ?? null,
      allocatedBuyCharges: allocation.allocatedBuyCharges,
    })),
    charges: copyCharges(event.payload.charges),
    grossRealizedPnl: grossRealizedPnl?.toString() ?? null,
    netRealizedPnl: netRealizedPnl?.toString() ?? null,
    realizedNetReturnRate: realizedNetReturnRate?.toString() ?? null,
    ...(sliceEstimated ? { costEstimated: true } : {}),
  });
};

const eventTradeMaps = (trades: readonly TradeProjection[]) => {
  const tradeByFact = new Map<string, TradeProjection>();
  for (const trade of trades) {
    for (const source of trade.entryLegs) tradeByFact.set(source.factId, trade);
    for (const source of trade.baselineComponents) tradeByFact.set(source.factId, trade);
    for (const source of trade.evidenceSources) tradeByFact.set(source.factId, trade);
    for (const slice of trade.closeSlices) tradeByFact.set(slice.factId, trade);
  }
  return tradeByFact;
};

const processEvent = (input: {
  event: EffectiveLedgerEvent;
  trade: TradeProjection;
  state: MutableTradeCost;
}) => {
  const { event, trade, state } = input;
  if (event.type === 'BUY_EXECUTION') {
    addExecutionSource(event, state);
    return;
  }
  if (event.type === 'POSITION_BASELINE_OBSERVATION') {
    addBaselineSource(event, state);
    return;
  }
  if (event.type === 'SELL_EXECUTION') {
    processSell(event, trade, state);
    return;
  }
  if (event.type === 'BONUS_SHARE' || event.type === 'SPLIT' || event.type === 'MERGE')
    scaleSources(event, state);
};

const enrichTrade = (trade: TradeProjection, state: MutableTradeCost): TradeProjection => {
  const sourceByFact = new Map<string, CostSourceState>(
    state.sources.map((source) => [source.factId, source]),
  );
  const entryLegs = trade.entryLegs.map((entryLeg) => {
    const source = sourceByFact.get(entryLeg.factId);
    if (!source) return entryLeg;
    return {
      ...entryLeg,
      charges: source.charges.map((line) => ({ ...line.charge })),
      rawCost: source.rawCost?.toString() ?? null,
      remainingCost: source.remainingRawCost?.toString() ?? null,
      ...(source.estimated ? { rawCostEstimated: true } : {}),
    };
  });
  const baselineComponents = trade.baselineComponents.map((component) => {
    const source = sourceByFact.get(component.factId);
    if (!source) return component;
    return {
      ...component,
      rawCost: source.rawCost?.toString() ?? null,
      remainingCost: source.remainingRawCost?.toString() ?? null,
      ...(source.estimated ? { rawCostEstimated: true } : {}),
    };
  });
  const closeSlices = trade.closeSlices.map(
    (slice) => state.closeSlices.get(slice.factId) ?? slice,
  );
  const realizedNetReturnRate =
    state.netRealizedPnl === null ||
    state.returnDenominator === null ||
    state.returnDenominator.isZero()
      ? null
      : state.netRealizedPnl.dividedBy(state.returnDenominator);
  return {
    ...trade,
    entryLegs,
    baselineComponents,
    closeSlices,
    costStrategyRevision: state.strategyRevision,
    grossRealizedPnl: state.grossRealizedPnl?.toString() ?? null,
    netRealizedPnl: state.netRealizedPnl?.toString() ?? null,
    realizedNetReturnRate: realizedNetReturnRate?.toString() ?? null,
    costEstimated: state.estimated,
    costIssues: [...state.issues].sort(),
  };
};

export const projectTradeCostProjections = (
  events: readonly LedgerEventV2[],
  options: TradeCostProjectionOptions,
): TradeProjection[] => {
  const trades = projectTradeProjections(events, options);
  const states = new Map<string, MutableTradeCost>();
  for (const trade of trades) states.set(trade.id, createTradeCost(trade, options));

  const tradeByFact = eventTradeMaps(trades);
  for (const event of selectEffectiveLedgerEvents(events)) {
    const trade = tradeByFact.get(event.factId);
    if (!trade) continue;
    const state = states.get(trade.id);
    if (!state) continue;
    processEvent({ event, trade, state });
  }
  return trades.map((trade) => enrichTrade(trade, states.get(trade.id)!));
};
