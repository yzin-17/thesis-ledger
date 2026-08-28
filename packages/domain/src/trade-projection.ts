import type {
  DecimalString,
  ExecutionChargeV2,
  LedgerEventV2,
  LedgerEventSourceV2,
} from './ledger-v2.js';
import { DecimalValue } from './decimal.js';

export type TradeAccountMode = 'actual' | 'shadow';
export type TradeLifecycle = 'ACTIVE' | 'ENDED';
export type TradeExitProgress = 'NONE' | 'PARTIAL' | 'FULL';
export type TradeEndEvidence = 'SELL_EXECUTION' | 'BALANCE_OBSERVATION' | 'UNKNOWN';
export type TradeEvidenceCompleteness = 'COMPLETE' | 'PARTIAL' | 'CONFLICTED';

export type TradeCostMethod = 'AVG' | 'FIFO';

export interface TradeCostStrategyRevision {
  id: string;
  method: TradeCostMethod;
  effectiveAt: string;
  reason: string;
  actorId: string;
}

export type TradeCostIssueCode =
  | 'BASELINE_COST_UNKNOWN'
  | 'BASELINE_COST_SCOPE_UNKNOWN'
  | 'BASELINE_COST_CONFLICT'
  | 'FEE_CURRENCY_MISMATCH'
  | 'TRADE_CURRENCY_MISMATCH';

export type TradeProjectionIssueCode =
  | 'MISSING_OPENING_BOUNDARY'
  | 'BASELINE_COST_UNKNOWN'
  | 'UNKNOWN_CLOSURE'
  | 'QUANTITY_CONFLICT'
  | 'UNKNOWN_TIME';

export type TradeEvidenceSourceKind =
  | 'EXECUTION'
  | 'BASELINE_OBSERVATION'
  | 'BASELINE_RECONCILIATION'
  | 'CORPORATE_ACTION'
  | 'DIVIDEND';

export interface TradeEvidenceSource {
  kind: TradeEvidenceSourceKind;
  eventId: string;
  factId: string;
  source: LedgerEventSourceV2;
}

export interface TradeEntryLeg {
  eventId: string;
  factId: string;
  occurredAt: string | null;
  currency: string;
  price: DecimalString;
  originalQuantity: DecimalString;
  quantity: DecimalString;
  remainingQuantity: DecimalString;
  charges?: ExecutionChargeV2[];
  rawCost?: DecimalString | null;
  remainingCost?: DecimalString | null;
  rawCostEstimated?: boolean;
}

export interface TradeBaselineComponent {
  eventId: string;
  factId: string;
  batchId: string;
  batchScope: 'FULL' | 'PARTIAL';
  occurredAt: string | null;
  currency: string;
  observedQuantity: DecimalString;
  quantity: DecimalString;
  remainingQuantity: DecimalString;
  averageCost?: DecimalString;
  costIncludesFees: 'INCLUDES_FEES' | 'EXCLUDES_FEES' | 'UNKNOWN';
  reconciledExecutionFactIds: string[];
  reconciliationFactIds: string[];
  rawCost?: DecimalString | null;
  remainingCost?: DecimalString | null;
  rawCostEstimated?: boolean;
}

export type TradeCloseAllocationSource = 'ENTRY_LEG' | 'BASELINE_COMPONENT';

export interface TradeCloseAllocation {
  source: TradeCloseAllocationSource;
  sourceEventId: string;
  sourceFactId: string;
  quantity: DecimalString;
  originalCost?: DecimalString | null;
  allocatedBuyCharges?: ExecutionChargeV2[];
}

export interface TradeCloseSlice {
  id: string;
  eventId: string;
  factId: string;
  occurredAt: string | null;
  currency: string;
  price?: DecimalString | null;
  quantity: DecimalString;
  remainingQuantityAfter: DecimalString;
  allocations: TradeCloseAllocation[];
  charges?: ExecutionChargeV2[];
  grossRealizedPnl?: DecimalString | null;
  netRealizedPnl?: DecimalString | null;
  realizedNetReturnRate?: DecimalString | null;
  costEstimated?: boolean;
}

export type TradeCorporateActionAdjustment =
  | {
      eventId: string;
      factId: string;
      type: 'BONUS_SHARE';
      occurredAt: string | null;
      quantity: DecimalString;
      positionQuantityBefore: DecimalString;
      positionQuantityAfter: DecimalString;
    }
  | {
      eventId: string;
      factId: string;
      type: 'SPLIT' | 'MERGE';
      occurredAt: string | null;
      fromUnits: DecimalString;
      toUnits: DecimalString;
      positionQuantityBefore: DecimalString;
      positionQuantityAfter: DecimalString;
    };

export interface TradeDividendAttribution {
  eventId: string;
  factId: string;
  occurredAt: string | null;
  amount: DecimalString;
  currency: string;
}

export interface TradeProjection {
  id: string;
  accountId: string;
  accountMode: TradeAccountMode;
  symbol: string;
  lifecycle: TradeLifecycle;
  exitProgress: TradeExitProgress;
  endEvidence: TradeEndEvidence;
  openedAt: string | null;
  closedAt: string | null;
  earliestEvidenceAt: string | null;
  sourceQuantity: DecimalString;
  closedQuantity: DecimalString;
  remainingQuantity: DecimalString;
  entryLegs: TradeEntryLeg[];
  baselineComponents: TradeBaselineComponent[];
  corporateActionAdjustments: TradeCorporateActionAdjustment[];
  closeSlices: TradeCloseSlice[];
  dividendAttributions: TradeDividendAttribution[];
  evidenceSources: TradeEvidenceSource[];
  completeness: TradeEvidenceCompleteness;
  issues: TradeProjectionIssueCode[];
  algorithmVersion: string;
  costStrategyRevision?: TradeCostStrategyRevision;
  grossRealizedPnl?: DecimalString | null;
  netRealizedPnl?: DecimalString | null;
  realizedNetReturnRate?: DecimalString | null;
  costEstimated?: boolean;
  costIssues?: TradeCostIssueCode[];
}

export interface TradeProjectionOptions {
  accountModeByAccountId: Readonly<Record<string, TradeAccountMode>>;
  algorithmVersion?: string;
}

export type TradeProjectionErrorCode =
  | 'TRADE_ACCOUNT_MODE_REQUIRED'
  | 'TRADE_INSUFFICIENT_POSITION'
  | 'TRADE_CORPORATE_ACTION_WITHOUT_POSITION'
  | 'TRADE_INVALID_CORPORATE_ACTION';

export class TradeProjectionError extends Error {
  constructor(
    readonly code: TradeProjectionErrorCode,
    message: string,
    readonly accountId: string,
    readonly symbol: string,
    readonly eventId?: string,
  ) {
    super(message);
    this.name = 'TradeProjectionError';
  }
}

type MutableSource = {
  source: TradeCloseAllocationSource;
  eventId: string;
  factId: string;
  occurredAt: string | null;
  currency: string;
  quantity: DecimalValue;
  originalQuantity: DecimalValue;
  remainingQuantity: DecimalValue;
  price?: DecimalString;
  batchId?: string;
  batchScope?: 'FULL' | 'PARTIAL';
  observedQuantity?: DecimalValue;
  averageCost?: DecimalString;
  costIncludesFees?: 'INCLUDES_FEES' | 'EXCLUDES_FEES' | 'UNKNOWN';
  reconciledExecutionFactIds: string[];
  reconciliationFactIds: string[];
};

type MutableEvidence = TradeEvidenceSource & {
  occurredAt: string | null;
  economicOrderKey: string;
};

type MutableTrade = {
  id: string;
  accountId: string;
  accountMode: TradeAccountMode;
  symbol: string;
  lifecycle: TradeLifecycle;
  exitProgress: TradeExitProgress;
  endEvidence: TradeEndEvidence;
  openedAt: string | null;
  closedAt: string | null;
  earliestEvidenceAt: string | null;
  openingBoundaryKnown: boolean;
  sourceQuantity: DecimalValue;
  closedQuantity: DecimalValue;
  sources: MutableSource[];
  closeSlices: TradeCloseSlice[];
  corporateActionAdjustments: TradeCorporateActionAdjustment[];
  dividendAttributions: TradeDividendAttribution[];
  evidenceSources: MutableEvidence[];
  issues: Set<TradeProjectionIssueCode>;
  algorithmVersion: string;
};

const defaultAlgorithmVersion = 'trade-projection-v1';

const decimal = (value: string) => DecimalValue.from(value);
const zero = () => decimal('0');

const compareLedgerEventOrder = (left: LedgerEventV2, right: LedgerEventV2) => {
  if (left.occurredAt === null && right.occurredAt !== null) return -1;
  if (left.occurredAt !== null && right.occurredAt === null) return 1;
  if (left.occurredAt !== right.occurredAt)
    return (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '');
  return (
    left.economicOrderKey.localeCompare(right.economicOrderKey) ||
    left.eventId.localeCompare(right.eventId)
  );
};

const compareRevision = (left: LedgerEventV2, right: LedgerEventV2) => {
  const leftRevision = BigInt(left.ledgerRevision);
  const rightRevision = BigInt(right.ledgerRevision);
  return leftRevision === rightRevision
    ? left.eventId.localeCompare(right.eventId)
    : leftRevision < rightRevision
      ? -1
      : 1;
};

const effectiveEvents = (events: readonly LedgerEventV2[]) => {
  const latestByFact = new Map<string, LedgerEventV2>();
  for (const event of events) {
    const current = latestByFact.get(event.factId);
    if (!current || compareRevision(current, event) < 0) latestByFact.set(event.factId, event);
  }
  return [...latestByFact.values()]
    .filter((event) => event.revisionAction !== 'VOID')
    .sort(compareLedgerEventOrder);
};

export const selectEffectiveLedgerEvents = (events: readonly LedgerEventV2[]) =>
  effectiveEvents(events);

const eventSymbol = (event: Exclude<LedgerEventV2, { revisionAction: 'VOID' }>) =>
  'symbol' in event.payload ? event.payload.symbol : undefined;

const updateEarliestEvidenceAt = (trade: MutableTrade, occurredAt: string | null) => {
  if (
    occurredAt !== null &&
    (trade.earliestEvidenceAt === null || occurredAt < trade.earliestEvidenceAt)
  )
    trade.earliestEvidenceAt = occurredAt;
};

const addIssue = (trade: MutableTrade, issue: TradeProjectionIssueCode) => {
  trade.issues.add(issue);
};

const addEvidence = (
  trade: MutableTrade,
  event: Exclude<LedgerEventV2, { revisionAction: 'VOID' }>,
  kind: TradeEvidenceSourceKind,
) => {
  updateEarliestEvidenceAt(trade, event.occurredAt);
  if (event.occurredAt === null) addIssue(trade, 'UNKNOWN_TIME');
  if (
    trade.evidenceSources.some((source) => source.eventId === event.eventId && source.kind === kind)
  )
    return;
  trade.evidenceSources.push({
    kind,
    eventId: event.eventId,
    factId: event.factId,
    source: event.source,
    occurredAt: event.occurredAt,
    economicOrderKey: event.economicOrderKey,
  });
};

const currentQuantity = (trade: MutableTrade) =>
  trade.sources.reduce((total, source) => total.plus(source.remainingQuantity), zero());

const createTrade = (input: {
  event: Exclude<LedgerEventV2, { revisionAction: 'VOID' }>;
  accountMode: TradeAccountMode;
  symbol: string;
  algorithmVersion: string;
  openingBoundaryKnown: boolean;
}) => {
  const { event, accountMode, symbol, algorithmVersion, openingBoundaryKnown } = input;
  const trade: MutableTrade = {
    id: `trade:${algorithmVersion}:${event.accountId}:${symbol}:${event.factId}`,
    accountId: event.accountId,
    accountMode,
    symbol,
    lifecycle: 'ACTIVE',
    exitProgress: 'NONE',
    endEvidence: 'UNKNOWN',
    openedAt: openingBoundaryKnown ? event.occurredAt : null,
    closedAt: null,
    earliestEvidenceAt: event.occurredAt,
    openingBoundaryKnown,
    sourceQuantity: zero(),
    closedQuantity: zero(),
    sources: [],
    closeSlices: [],
    corporateActionAdjustments: [],
    dividendAttributions: [],
    evidenceSources: [],
    issues: new Set(),
    algorithmVersion,
  };
  if (!openingBoundaryKnown) addIssue(trade, 'MISSING_OPENING_BOUNDARY');
  return trade;
};

const addSource = (trade: MutableTrade, source: MutableSource) => {
  trade.sources.push(source);
  trade.sourceQuantity = trade.sourceQuantity.plus(source.quantity);
};

const createEntrySource = (
  event: Extract<Exclude<LedgerEventV2, { revisionAction: 'VOID' }>, { type: 'BUY_EXECUTION' }>,
): MutableSource => {
  const quantity = decimal(event.payload.quantity);
  return {
    source: 'ENTRY_LEG',
    eventId: event.eventId,
    factId: event.factId,
    occurredAt: event.occurredAt,
    currency: event.payload.currency,
    price: event.payload.price,
    quantity,
    originalQuantity: quantity,
    remainingQuantity: quantity,
    reconciledExecutionFactIds: [],
    reconciliationFactIds: [],
  };
};

const createBaselineSource = (input: {
  event: Extract<
    Exclude<LedgerEventV2, { revisionAction: 'VOID' }>,
    {
      type: 'POSITION_BASELINE_OBSERVATION';
    }
  >;
  contributedQuantity: DecimalValue;
}) => {
  const { event, contributedQuantity } = input;
  const source: MutableSource = {
    source: 'BASELINE_COMPONENT',
    eventId: event.eventId,
    factId: event.factId,
    occurredAt: event.occurredAt,
    currency: event.payload.currency,
    quantity: contributedQuantity,
    originalQuantity: contributedQuantity,
    remainingQuantity: contributedQuantity,
    batchId: event.payload.batchId,
    batchScope: event.payload.batchScope,
    observedQuantity: decimal(event.payload.quantity),
    costIncludesFees: event.payload.costIncludesFees,
    reconciledExecutionFactIds: [],
    reconciliationFactIds: [],
  };
  if (event.payload.averageCost !== undefined) source.averageCost = event.payload.averageCost;
  return source;
};

const processBuy = (input: {
  event: Extract<Exclude<LedgerEventV2, { revisionAction: 'VOID' }>, { type: 'BUY_EXECUTION' }>;
  current: MutableTrade | undefined;
  trades: MutableTrade[];
  accountMode: TradeAccountMode;
  symbol: string;
  algorithmVersion: string;
}) => {
  const { event, trades, accountMode, symbol, algorithmVersion } = input;
  let trade = input.current;
  if (!trade || trade.lifecycle !== 'ACTIVE') {
    trade = createTrade({
      event,
      accountMode,
      symbol,
      algorithmVersion,
      openingBoundaryKnown: event.occurredAt !== null,
    });
    trades.push(trade);
  }
  addSource(trade, createEntrySource(event));
  addEvidence(trade, event, 'EXECUTION');
  if (trade.openedAt === null && trade.openingBoundaryKnown && event.occurredAt !== null)
    trade.openedAt = event.occurredAt;
  return trade;
};

const processBaseline = (input: {
  event: Extract<
    Exclude<LedgerEventV2, { revisionAction: 'VOID' }>,
    {
      type: 'POSITION_BASELINE_OBSERVATION';
    }
  >;
  current: MutableTrade | undefined;
  trades: MutableTrade[];
  accountMode: TradeAccountMode;
  symbol: string;
  algorithmVersion: string;
}) => {
  const { event, trades, accountMode, symbol, algorithmVersion } = input;
  const observedQuantity = decimal(event.payload.quantity);
  let trade = input.current;
  if (observedQuantity.isZero()) {
    if (!trade || trade.lifecycle !== 'ACTIVE' || currentQuantity(trade).isZero()) return undefined;
    addEvidence(trade, event, 'BASELINE_OBSERVATION');
    for (const source of trade.sources) source.remainingQuantity = zero();
    trade.lifecycle = 'ENDED';
    trade.endEvidence = 'BALANCE_OBSERVATION';
    trade.closedAt = null;
    addIssue(trade, 'UNKNOWN_CLOSURE');
    return undefined;
  }

  if (!trade || trade.lifecycle !== 'ACTIVE') {
    trade = createTrade({
      event,
      accountMode,
      symbol,
      algorithmVersion,
      openingBoundaryKnown: false,
    });
    trades.push(trade);
    const source = createBaselineSource({ event, contributedQuantity: observedQuantity });
    addSource(trade, source);
    addEvidence(trade, event, 'BASELINE_OBSERVATION');
    if (event.payload.averageCost === undefined) addIssue(trade, 'BASELINE_COST_UNKNOWN');
    return trade;
  }

  addEvidence(trade, event, 'BASELINE_OBSERVATION');
  const existingQuantity = currentQuantity(trade);
  const difference = observedQuantity.minus(existingQuantity);
  const contributedQuantity = difference.isNegative() ? zero() : difference;
  if (difference.isNegative()) addIssue(trade, 'QUANTITY_CONFLICT');
  const source = createBaselineSource({ event, contributedQuantity });
  addSource(trade, source);
  if (contributedQuantity.isPositive()) {
    trade.openingBoundaryKnown = false;
    trade.openedAt = null;
    addIssue(trade, 'MISSING_OPENING_BOUNDARY');
    if (event.payload.averageCost === undefined) addIssue(trade, 'BASELINE_COST_UNKNOWN');
  }
  return trade;
};

const processSell = (input: {
  event: Extract<Exclude<LedgerEventV2, { revisionAction: 'VOID' }>, { type: 'SELL_EXECUTION' }>;
  current: MutableTrade | undefined;
}) => {
  const { event, current: trade } = input;
  const quantity = decimal(event.payload.quantity);
  if (!trade || trade.lifecycle !== 'ACTIVE' || currentQuantity(trade).compareTo(quantity) < 0)
    throw new TradeProjectionError(
      'TRADE_INSUFFICIENT_POSITION',
      `卖出数量超过持仓: ${event.payload.symbol}`,
      event.accountId,
      event.payload.symbol,
      event.eventId,
    );
  addEvidence(trade, event, 'EXECUTION');
  let remainingToAllocate = quantity;
  const allocations: TradeCloseAllocation[] = [];
  for (const source of trade.sources) {
    if (remainingToAllocate.isZero() || source.remainingQuantity.isZero()) continue;
    const consumed =
      source.remainingQuantity.compareTo(remainingToAllocate) <= 0
        ? source.remainingQuantity
        : remainingToAllocate;
    source.remainingQuantity = source.remainingQuantity.minus(consumed);
    remainingToAllocate = remainingToAllocate.minus(consumed);
    allocations.push({
      source: source.source,
      sourceEventId: source.eventId,
      sourceFactId: source.factId,
      quantity: consumed.toString(),
    });
  }
  const remainingQuantityAfter = currentQuantity(trade);
  trade.closedQuantity = trade.closedQuantity.plus(quantity);
  trade.closeSlices.push({
    id: `${trade.id}:close:${event.factId}`,
    eventId: event.eventId,
    factId: event.factId,
    occurredAt: event.occurredAt,
    currency: event.payload.currency,
    price: event.payload.price,
    quantity: quantity.toString(),
    remainingQuantityAfter: remainingQuantityAfter.toString(),
    allocations,
  });
  if (remainingQuantityAfter.isZero()) {
    trade.lifecycle = 'ENDED';
    trade.exitProgress = 'FULL';
    trade.endEvidence = 'SELL_EXECUTION';
    trade.closedAt = event.occurredAt;
    if (event.occurredAt === null) addIssue(trade, 'UNKNOWN_CLOSURE');
    return undefined;
  }
  trade.exitProgress = 'PARTIAL';
  return trade;
};

const multiplySources = (trade: MutableTrade, multiplier: DecimalValue) => {
  for (const source of trade.sources) {
    source.quantity = source.quantity.times(multiplier);
    source.remainingQuantity = source.remainingQuantity.times(multiplier);
  }
  trade.sourceQuantity = trade.sourceQuantity.times(multiplier);
};

const processCorporateAction = (input: {
  event: Extract<
    Exclude<LedgerEventV2, { revisionAction: 'VOID' }>,
    {
      type: 'BONUS_SHARE' | 'SPLIT' | 'MERGE';
    }
  >;
  current: MutableTrade | undefined;
}) => {
  const { event, current: trade } = input;
  if (!trade || trade.lifecycle !== 'ACTIVE' || currentQuantity(trade).isZero())
    throw new TradeProjectionError(
      'TRADE_CORPORATE_ACTION_WITHOUT_POSITION',
      `没有可应用公司行动的持仓: ${event.payload.symbol}`,
      event.accountId,
      event.payload.symbol,
      event.eventId,
    );
  addEvidence(trade, event, 'CORPORATE_ACTION');
  const before = currentQuantity(trade);
  if (event.type === 'BONUS_SHARE') {
    const quantity = decimal(event.payload.quantity);
    if (!quantity.isPositive())
      throw new TradeProjectionError(
        'TRADE_INVALID_CORPORATE_ACTION',
        `送股数量必须大于零: ${event.payload.symbol}`,
        event.accountId,
        event.payload.symbol,
        event.eventId,
      );
    const after = before.plus(quantity);
    multiplySources(trade, after.dividedBy(before));
    trade.corporateActionAdjustments.push({
      eventId: event.eventId,
      factId: event.factId,
      type: event.type,
      occurredAt: event.occurredAt,
      quantity: quantity.toString(),
      positionQuantityBefore: before.toString(),
      positionQuantityAfter: after.toString(),
    });
    return trade;
  }

  const fromUnits = decimal(event.payload.fromUnits);
  const toUnits = decimal(event.payload.toUnits);
  if (!fromUnits.isPositive() || !toUnits.isPositive())
    throw new TradeProjectionError(
      'TRADE_INVALID_CORPORATE_ACTION',
      `公司行动比例必须大于零: ${event.payload.symbol}`,
      event.accountId,
      event.payload.symbol,
      event.eventId,
    );
  const after = before.times(toUnits).dividedBy(fromUnits);
  multiplySources(trade, toUnits.dividedBy(fromUnits));
  trade.corporateActionAdjustments.push({
    eventId: event.eventId,
    factId: event.factId,
    type: event.type,
    occurredAt: event.occurredAt,
    fromUnits: fromUnits.toString(),
    toUnits: toUnits.toString(),
    positionQuantityBefore: before.toString(),
    positionQuantityAfter: after.toString(),
  });
  return trade;
};

const processDividend = (input: {
  event: Extract<Exclude<LedgerEventV2, { revisionAction: 'VOID' }>, { type: 'DIVIDEND' }>;
  current: MutableTrade | undefined;
}) => {
  const { event, current: trade } = input;
  if (!trade || trade.lifecycle !== 'ACTIVE') return trade;
  addEvidence(trade, event, 'DIVIDEND');
  trade.dividendAttributions.push({
    eventId: event.eventId,
    factId: event.factId,
    occurredAt: event.occurredAt,
    amount: event.payload.amount,
    currency: event.payload.currency,
  });
  return trade;
};

const processReconciliation = (input: {
  event: Extract<
    Exclude<LedgerEventV2, { revisionAction: 'VOID' }>,
    {
      type: 'BASELINE_RECONCILIATION';
    }
  >;
  tradesByBaselineFact: Map<string, MutableTrade>;
}) => {
  const trade = input.tradesByBaselineFact.get(input.event.payload.baselineFactId);
  if (!trade) return;
  addEvidence(trade, input.event, 'BASELINE_RECONCILIATION');
  const source = trade.sources.find(
    (candidate) =>
      candidate.source === 'BASELINE_COMPONENT' &&
      candidate.factId === input.event.payload.baselineFactId,
  );
  if (!source) return;
  if (!source.reconciliationFactIds.includes(input.event.factId))
    source.reconciliationFactIds.push(input.event.factId);
  for (const factId of input.event.payload.executionFactIds)
    if (!source.reconciledExecutionFactIds.includes(factId))
      source.reconciledExecutionFactIds.push(factId);
};

const sourceToEntryLeg = (source: MutableSource): TradeEntryLeg => ({
  eventId: source.eventId,
  factId: source.factId,
  occurredAt: source.occurredAt,
  currency: source.currency,
  price: source.price!,
  originalQuantity: source.originalQuantity.toString(),
  quantity: source.quantity.toString(),
  remainingQuantity: source.remainingQuantity.toString(),
});

const sourceToBaselineComponent = (source: MutableSource): TradeBaselineComponent => ({
  eventId: source.eventId,
  factId: source.factId,
  batchId: source.batchId!,
  batchScope: source.batchScope!,
  occurredAt: source.occurredAt,
  currency: source.currency,
  observedQuantity: source.observedQuantity!.toString(),
  quantity: source.quantity.toString(),
  remainingQuantity: source.remainingQuantity.toString(),
  ...(source.averageCost === undefined ? {} : { averageCost: source.averageCost }),
  costIncludesFees: source.costIncludesFees!,
  reconciledExecutionFactIds: [...source.reconciledExecutionFactIds],
  reconciliationFactIds: [...source.reconciliationFactIds],
});

const evidenceOrder = (left: MutableEvidence, right: MutableEvidence) => {
  if (left.occurredAt === null && right.occurredAt !== null) return -1;
  if (left.occurredAt !== null && right.occurredAt === null) return 1;
  if (left.occurredAt !== right.occurredAt)
    return (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '');
  return (
    left.economicOrderKey.localeCompare(right.economicOrderKey) ||
    left.eventId.localeCompare(right.eventId)
  );
};

const finalizeTrade = (trade: MutableTrade): TradeProjection => {
  const remainingQuantity = currentQuantity(trade);
  const entryLegs = trade.sources
    .filter((source) => source.source === 'ENTRY_LEG')
    .map(sourceToEntryLeg);
  const baselineComponents = trade.sources
    .filter((source) => source.source === 'BASELINE_COMPONENT')
    .map(sourceToBaselineComponent);
  const evidenceSources = [...trade.evidenceSources]
    .sort(evidenceOrder)
    .map(({ kind, eventId, factId, source }) => ({ kind, eventId, factId, source }));
  const hasBaselineContribution = baselineComponents.some(
    (component) => component.quantity !== '0',
  );
  const completeness: TradeEvidenceCompleteness = trade.issues.has('QUANTITY_CONFLICT')
    ? 'CONFLICTED'
    : trade.issues.size > 0 || hasBaselineContribution || trade.openedAt === null
      ? 'PARTIAL'
      : 'COMPLETE';
  return {
    id: trade.id,
    accountId: trade.accountId,
    accountMode: trade.accountMode,
    symbol: trade.symbol,
    lifecycle: trade.lifecycle,
    exitProgress: trade.exitProgress,
    endEvidence: trade.endEvidence,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    earliestEvidenceAt: trade.earliestEvidenceAt,
    sourceQuantity: trade.sourceQuantity.toString(),
    closedQuantity: trade.closedQuantity.toString(),
    remainingQuantity: remainingQuantity.toString(),
    entryLegs,
    baselineComponents,
    corporateActionAdjustments: [...trade.corporateActionAdjustments],
    closeSlices: [...trade.closeSlices],
    dividendAttributions: [...trade.dividendAttributions],
    evidenceSources,
    completeness,
    issues: [...trade.issues].sort(),
    algorithmVersion: trade.algorithmVersion,
  };
};

const projectGroup = (input: {
  accountId: string;
  accountMode: TradeAccountMode;
  symbol: string;
  events: readonly Exclude<LedgerEventV2, { revisionAction: 'VOID' }>[];
  algorithmVersion: string;
}) => {
  const { accountId, accountMode, symbol, events, algorithmVersion } = input;
  const trades: MutableTrade[] = [];
  const tradesByBaselineFact = new Map<string, MutableTrade>();
  const pendingReconciliations: Extract<
    Exclude<LedgerEventV2, { revisionAction: 'VOID' }>,
    { type: 'BASELINE_RECONCILIATION' }
  >[] = [];
  let current: MutableTrade | undefined;
  for (const event of events) {
    if (event.accountId !== accountId) continue;
    if (event.type === 'BUY_EXECUTION') {
      current = processBuy({
        event,
        current,
        trades,
        accountMode,
        symbol,
        algorithmVersion,
      });
      continue;
    }
    if (event.type === 'SELL_EXECUTION') {
      current = processSell({ event, current });
      continue;
    }
    if (event.type === 'POSITION_BASELINE_OBSERVATION') {
      current = processBaseline({
        event,
        current,
        trades,
        accountMode,
        symbol,
        algorithmVersion,
      });
      const trade = trades.find((candidate) =>
        candidate.sources.some(
          (source) => source.source === 'BASELINE_COMPONENT' && source.factId === event.factId,
        ),
      );
      if (trade) tradesByBaselineFact.set(event.factId, trade);
      continue;
    }
    if (event.type === 'BONUS_SHARE' || event.type === 'SPLIT' || event.type === 'MERGE') {
      current = processCorporateAction({ event, current });
      continue;
    }
    if (event.type === 'DIVIDEND') {
      current = processDividend({ event, current });
      continue;
    }
    if (event.type === 'BASELINE_RECONCILIATION') {
      pendingReconciliations.push(event);
    }
  }
  for (const event of pendingReconciliations)
    processReconciliation({ event, tradesByBaselineFact });
  return trades.map(finalizeTrade);
};

export const projectTradeProjections = (
  events: readonly LedgerEventV2[],
  options: TradeProjectionOptions,
): TradeProjection[] => {
  const algorithmVersion = options.algorithmVersion ?? defaultAlgorithmVersion;
  const groups = new Map<
    string,
    {
      accountId: string;
      accountMode: TradeAccountMode;
      symbol: string;
      events: Exclude<LedgerEventV2, { revisionAction: 'VOID' }>[];
    }
  >();
  for (const event of effectiveEvents(events)) {
    const accountMode = options.accountModeByAccountId[event.accountId];
    if (!accountMode)
      throw new TradeProjectionError(
        'TRADE_ACCOUNT_MODE_REQUIRED',
        `缺少账户模式: ${event.accountId}`,
        event.accountId,
        eventSymbol(event) ?? '',
        event.eventId,
      );
    const symbol = eventSymbol(event);
    if (!symbol) continue;
    const key = `${event.accountId}:${accountMode}:${symbol}`;
    const group = groups.get(key) ?? {
      accountId: event.accountId,
      accountMode,
      symbol,
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (left, right) =>
        left.accountId.localeCompare(right.accountId) ||
        left.accountMode.localeCompare(right.accountMode) ||
        left.symbol.localeCompare(right.symbol),
    )
    .flatMap((group) => projectGroup({ ...group, algorithmVersion }));
};
