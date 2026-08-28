import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  projectTradeCostProjections,
  type TradeCostMethod,
  type LedgerEventV2,
  type TradeProjection,
} from '@thesis-ledger/domain';
import { projectCashMaterialization, type StoredCashEvent } from './cash-projection.js';
import { toLedgerEventV2 } from './ledger-v2.repository.js';

Prisma.Decimal.set({ precision: 40 });

type CoreProjectionClient = Pick<
  Prisma.TransactionClient,
  | 'account'
  | 'accountCostStrategyVersion'
  | 'accountLedgerState'
  | 'ledgerEvent'
  | 'position'
  | 'trade'
  | 'tradeEntryLeg'
  | 'tradeBaselineComponent'
  | 'tradeCorporateActionAdjustment'
  | 'tradeCloseSlice'
  | 'tradeCloseAllocation'
  | 'tradeDividendAttribution'
  | 'tradeEvidenceSource'
  | 'cashBalance'
  | 'cashSettlement'
>;

type StoredLedgerEvent = Awaited<
  ReturnType<CoreProjectionClient['ledgerEvent']['findMany']>
>[number];

type CoreProjectionOptions = {
  method: TradeCostMethod;
  projectionGeneration?: bigint;
  now?: Date;
};

export type CorePositionProjection = {
  accountId: string;
  symbol: string;
  quantity: string;
  averageCost: string;
  realizedPnl: string;
};

export type CoreProjectionResult = {
  positions: CorePositionProjection[];
  tradeCount: number;
  cashBalanceCount: number;
  cashSettlementCount: number;
  projectionGeneration: bigint;
};

const decimal = (value: string | Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : new Prisma.Decimal(value);

const requiredDecimal = (value: string) => new Prisma.Decimal(value);

const json = (value: unknown) => value as Prisma.InputJsonValue;

const projectionFingerprint = (trade: TradeProjection) =>
  createHash('sha256').update(JSON.stringify(trade)).digest('hex');

const date = (value: string | null) => (value === null ? null : new Date(value));

const deterministicUuid = (key: string) => {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join(''),
    hex.slice(16, 20).join(''),
    hex.slice(20).join(''),
  ].join('-');
};

const toV2Event = (event: StoredLedgerEvent) =>
  toLedgerEventV2({
    id: event.id,
    accountId: event.accountId,
    type: event.type,
    factId: event.factId,
    ledgerRevision: event.ledgerRevision,
    occurredAt: event.occurredAt,
    timePrecision: event.timePrecision,
    sourceTimezone: event.sourceTimezone,
    economicOrderKey: event.economicOrderKey,
    recordedAt: event.recordedAt,
    payloadVersion: event.payloadVersion,
    payload: event.payload ?? {},
    sourceCategory: event.sourceCategory,
    sourceChannel: event.sourceChannel,
    externalId: event.externalId,
    sourceRowId: event.sourceRowId,
    actorId: event.actorId,
    revisionAction: event.revisionAction,
    supersedesEventId: event.supersedesEventId,
    reason: event.reason,
  }) as unknown as LedgerEventV2;

const readV2Events = (stored: readonly StoredLedgerEvent[]) =>
  stored.filter((event) => event.factId !== null).map(toV2Event);

const strategyMethod = (value: string): TradeCostMethod => {
  if (value === 'AVG' || value === 'FIFO') return value;
  throw new Error(`账户成本策略无效: ${value}`);
};

const loadProjectionInputs = async (
  client: CoreProjectionClient,
  accountId: string,
  fallbackMethod: TradeCostMethod,
  stored: readonly StoredLedgerEvent[],
) => {
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: { id: true, mode: true, createdAt: true },
  });
  if (!account) throw new Error(`账户不存在，无法重建投影: ${accountId}`);

  let strategies = await client.accountCostStrategyVersion.findMany({
    where: { accountId },
    orderBy: [{ effectiveAt: 'asc' }, { revision: 'asc' }, { id: 'asc' }],
  });
  if (strategies.length === 0) {
    const firstObservedAt = stored
      .map((event) => event.occurredAt)
      .filter((value): value is Date => value !== null)
      .sort((left, right) => left.getTime() - right.getTime())[0];
    const created = await client.accountCostStrategyVersion.create({
      data: {
        accountId,
        revision: 1,
        method: fallbackMethod,
        effectiveAt: firstObservedAt ?? account.createdAt,
        reason: '为缺少策略的账户创建初始投影策略',
        actorId: 'system:core-projection',
      },
    });
    strategies = [created];
  }

  return {
    accountMode: account.mode === 'shadow' ? ('shadow' as const) : ('actual' as const),
    strategies: strategies.map((strategy) => ({
      id: strategy.id,
      method: strategyMethod(strategy.method),
      effectiveAt: strategy.effectiveAt.toISOString(),
      reason: strategy.reason,
      actorId: strategy.actorId,
    })),
  };
};

const remainingCostForTrade = (trade: TradeProjection) => {
  let cost = new Prisma.Decimal(0);
  let complete = true;
  for (const source of [...trade.entryLegs, ...trade.baselineComponents]) {
    const remaining = requiredDecimal(source.remainingQuantity);
    if (remaining.isZero()) continue;
    if (source.remainingCost === null || source.remainingCost === undefined) {
      complete = false;
      continue;
    }
    cost = cost.plus(requiredDecimal(source.remainingCost));
  }
  return { cost, complete };
};

const projectPositionsFromTrades = (trades: readonly TradeProjection[]) => {
  const bySymbol = new Map<
    string,
    {
      accountId: string;
      symbol: string;
      quantity: Prisma.Decimal;
      cost: Prisma.Decimal;
      costComplete: boolean;
      realizedPnl: Prisma.Decimal;
    }
  >();
  for (const trade of trades) {
    if (trade.lifecycle !== 'ACTIVE') continue;
    const quantity = requiredDecimal(trade.remainingQuantity);
    if (quantity.isZero()) continue;
    const current = bySymbol.get(trade.symbol) ?? {
      accountId: trade.accountId,
      symbol: trade.symbol,
      quantity: new Prisma.Decimal(0),
      cost: new Prisma.Decimal(0),
      costComplete: true,
      realizedPnl: new Prisma.Decimal(0),
    };
    const remainingCost = remainingCostForTrade(trade);
    current.quantity = current.quantity.plus(quantity);
    current.cost = current.cost.plus(remainingCost.cost);
    current.costComplete = current.costComplete && remainingCost.complete;
    if (trade.netRealizedPnl !== null && trade.netRealizedPnl !== undefined)
      current.realizedPnl = current.realizedPnl.plus(requiredDecimal(trade.netRealizedPnl));
    bySymbol.set(trade.symbol, current);
  }
  return [...bySymbol.values()]
    .map((position) => ({
      accountId: position.accountId,
      symbol: position.symbol,
      quantity: position.quantity,
      averageCost: position.quantity.isZero()
        ? new Prisma.Decimal(0)
        : position.cost.div(position.quantity),
      realizedPnl: position.realizedPnl,
      source: position.costComplete ? 'ledger' : 'ledger-estimated',
    }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol));
};

const replaceTradeProjection = async (
  client: CoreProjectionClient,
  accountId: string,
  trades: readonly TradeProjection[],
  projectionGeneration: bigint,
) => {
  await client.trade.deleteMany({ where: { accountId } });
  for (const trade of trades) {
    await client.trade.create({
      data: {
        id: trade.id,
        accountId,
        accountMode: trade.accountMode,
        symbol: trade.symbol,
        lifecycle: trade.lifecycle,
        exitProgress: trade.exitProgress,
        endEvidence: trade.endEvidence,
        openedAt: date(trade.openedAt),
        closedAt: date(trade.closedAt),
        earliestEvidenceAt: date(trade.earliestEvidenceAt),
        sourceQuantity: requiredDecimal(trade.sourceQuantity),
        closedQuantity: requiredDecimal(trade.closedQuantity),
        remainingQuantity: requiredDecimal(trade.remainingQuantity),
        grossRealizedPnl: decimal(trade.grossRealizedPnl),
        netRealizedPnl: decimal(trade.netRealizedPnl),
        realizedNetReturnRate: decimal(trade.realizedNetReturnRate),
        costEstimated: trade.costEstimated ?? false,
        completeness: trade.completeness,
        issues: json(trade.issues),
        costIssues: json(trade.costIssues ?? []),
        algorithmVersion: trade.algorithmVersion,
        projectionFingerprint: projectionFingerprint(trade),
        projectionGeneration,
        costStrategyRevisionId: trade.costStrategyRevision?.id ?? null,
      },
    });

    for (const entryLeg of trade.entryLegs) {
      await client.tradeEntryLeg.create({
        data: {
          id: deterministicUuid(`${trade.id}:entry-leg:${entryLeg.factId}`),
          tradeId: trade.id,
          eventId: entryLeg.eventId,
          factId: entryLeg.factId,
          occurredAt: date(entryLeg.occurredAt),
          currency: entryLeg.currency,
          price: requiredDecimal(entryLeg.price),
          originalQuantity: requiredDecimal(entryLeg.originalQuantity),
          quantity: requiredDecimal(entryLeg.quantity),
          remainingQuantity: requiredDecimal(entryLeg.remainingQuantity),
          rawCost: decimal(entryLeg.rawCost),
          remainingCost: decimal(entryLeg.remainingCost),
          rawCostEstimated: entryLeg.rawCostEstimated ?? false,
          charges: json(entryLeg.charges ?? []),
        },
      });
    }

    for (const baseline of trade.baselineComponents) {
      await client.tradeBaselineComponent.create({
        data: {
          id: deterministicUuid(`${trade.id}:baseline:${baseline.factId}`),
          tradeId: trade.id,
          eventId: baseline.eventId,
          factId: baseline.factId,
          batchId: baseline.batchId,
          batchScope: baseline.batchScope,
          occurredAt: date(baseline.occurredAt),
          currency: baseline.currency,
          observedQuantity: requiredDecimal(baseline.observedQuantity),
          quantity: requiredDecimal(baseline.quantity),
          remainingQuantity: requiredDecimal(baseline.remainingQuantity),
          averageCost: decimal(baseline.averageCost),
          rawCost: decimal(baseline.rawCost),
          remainingCost: decimal(baseline.remainingCost),
          rawCostEstimated: baseline.rawCostEstimated ?? false,
          costIncludesFees: baseline.costIncludesFees,
          reconciledExecutionFactIds: json(baseline.reconciledExecutionFactIds),
          reconciliationFactIds: json(baseline.reconciliationFactIds),
        },
      });
    }

    for (const action of trade.corporateActionAdjustments) {
      await client.tradeCorporateActionAdjustment.create({
        data: {
          id: deterministicUuid(`${trade.id}:corporate-action:${action.factId}`),
          tradeId: trade.id,
          eventId: action.eventId,
          factId: action.factId,
          type: action.type,
          occurredAt: date(action.occurredAt),
          quantity: 'quantity' in action ? requiredDecimal(action.quantity) : null,
          fromUnits: 'fromUnits' in action ? requiredDecimal(action.fromUnits) : null,
          toUnits: 'toUnits' in action ? requiredDecimal(action.toUnits) : null,
          positionQuantityBefore: requiredDecimal(action.positionQuantityBefore),
          positionQuantityAfter: requiredDecimal(action.positionQuantityAfter),
        },
      });
    }

    for (const slice of trade.closeSlices) {
      await client.tradeCloseSlice.create({
        data: {
          id: slice.id,
          tradeId: trade.id,
          eventId: slice.eventId,
          factId: slice.factId,
          occurredAt: date(slice.occurredAt),
          currency: slice.currency,
          price: decimal(slice.price),
          quantity: requiredDecimal(slice.quantity),
          remainingQuantityAfter: requiredDecimal(slice.remainingQuantityAfter),
          charges: json(slice.charges ?? []),
          grossRealizedPnl: decimal(slice.grossRealizedPnl),
          netRealizedPnl: decimal(slice.netRealizedPnl),
          realizedNetReturnRate: decimal(slice.realizedNetReturnRate),
          costEstimated: slice.costEstimated ?? false,
        },
      });
      for (const [index, allocation] of slice.allocations.entries()) {
        await client.tradeCloseAllocation.create({
          data: {
            id: deterministicUuid(
              `${slice.id}:allocation:${allocation.sourceFactId}:${index.toString()}`,
            ),
            closeSliceId: slice.id,
            source: allocation.source,
            sourceEventId: allocation.sourceEventId,
            sourceFactId: allocation.sourceFactId,
            quantity: requiredDecimal(allocation.quantity),
            originalCost: decimal(allocation.originalCost),
            allocatedBuyCharges: json(allocation.allocatedBuyCharges ?? []),
          },
        });
      }
    }

    for (const dividend of trade.dividendAttributions) {
      await client.tradeDividendAttribution.create({
        data: {
          id: deterministicUuid(`${trade.id}:dividend:${dividend.factId}`),
          tradeId: trade.id,
          eventId: dividend.eventId,
          factId: dividend.factId,
          occurredAt: date(dividend.occurredAt),
          amount: requiredDecimal(dividend.amount),
          currency: dividend.currency,
        },
      });
    }

    for (const evidence of trade.evidenceSources) {
      await client.tradeEvidenceSource.create({
        data: {
          id: deterministicUuid(`${trade.id}:evidence:${evidence.kind}:${evidence.factId}`),
          tradeId: trade.id,
          kind: evidence.kind,
          eventId: evidence.eventId,
          factId: evidence.factId,
          source: json(evidence.source),
        },
      });
    }
  }
};

const replaceCashProjection = async (
  client: CoreProjectionClient,
  accountId: string,
  stored: readonly StoredLedgerEvent[],
  projectionGeneration: bigint,
  now: Date,
) => {
  const materialized = projectCashMaterialization(stored as unknown as StoredCashEvent[], now);
  await client.cashSettlement.deleteMany({ where: { accountId } });
  await client.cashBalance.deleteMany({ where: { accountId } });
  for (const balance of materialized.balances) {
    await client.cashBalance.create({
      data: {
        id: deterministicUuid(`${accountId}:cash-balance:${balance.currency}`),
        accountId,
        currency: balance.currency,
        settledAmount: balance.settledAmount,
        pendingReceivable: balance.pendingReceivable,
        pendingPayable: balance.pendingPayable,
        completeness: balance.completeness,
        issues: json(balance.issues),
        projectionGeneration,
      },
    });
  }
  for (const settlement of materialized.settlements) {
    await client.cashSettlement.create({
      data: {
        id: deterministicUuid(`${accountId}:cash-settlement:${settlement.factId}`),
        accountId,
        eventId: settlement.eventId,
        factId: settlement.factId,
        currency: settlement.currency,
        direction: settlement.direction,
        amount: settlement.amount,
        occurredAt: date(settlement.occurredAt),
        settledAt: date(settlement.settledAt),
        status: settlement.status,
        sourceType: settlement.sourceType,
        projectionGeneration,
      },
    });
  }
  return materialized;
};

const replacePositionProjection = async (
  client: CoreProjectionClient,
  accountId: string,
  projected: ReturnType<typeof projectPositionsFromTrades>,
) => {
  const existing = await client.position.findMany({
    where: { accountId },
    select: { id: true, symbol: true },
  });
  const existingBySymbol = new Map(existing.map((position) => [position.symbol, position]));
  const nextBySymbol = new Map(
    projected
      .filter((position) => position.quantity.isPositive())
      .map((position) => [position.symbol, position]),
  );
  for (const position of existing) {
    const next = nextBySymbol.get(position.symbol);
    if (!next) {
      await client.position.delete({ where: { id: position.id } });
      continue;
    }
    await client.position.update({
      where: { id: position.id },
      data: {
        quantity: next.quantity.toDecimalPlaces(18),
        costPrice: next.averageCost.toDecimalPlaces(18),
        source: next.source,
      },
    });
  }
  for (const position of nextBySymbol.values()) {
    if (existingBySymbol.has(position.symbol)) continue;
    await client.position.create({
      data: {
        accountId,
        symbol: position.symbol,
        quantity: position.quantity.toDecimalPlaces(18),
        costPrice: position.averageCost.toDecimalPlaces(18),
        source: position.source,
      },
    });
  }
  return projected.map((position) => ({
    accountId: position.accountId,
    symbol: position.symbol,
    quantity: position.quantity.toString(),
    averageCost: position.averageCost.toString(),
    realizedPnl: position.realizedPnl.toString(),
  }));
};

export const rebuildCoreProjections = async (
  client: CoreProjectionClient,
  accountId: string,
  options: CoreProjectionOptions,
): Promise<CoreProjectionResult> => {
  const stored = await client.ledgerEvent.findMany({
    where: { accountId },
    orderBy: [{ ledgerRevision: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const inputs = await loadProjectionInputs(client, accountId, options.method, stored);
  const events = readV2Events(stored);
  const trades = projectTradeCostProjections(events, {
    accountModeByAccountId: { [accountId]: inputs.accountMode },
    costStrategyRevisionsByAccountId: { [accountId]: inputs.strategies },
  });
  const projectionGeneration =
    options.projectionGeneration ??
    (await client.accountLedgerState.findUnique({ where: { accountId } }))?.projectionGeneration ??
    0n;
  await replaceTradeProjection(client, accountId, trades, projectionGeneration);
  const cash = await replaceCashProjection(
    client,
    accountId,
    stored,
    projectionGeneration,
    options.now ?? new Date(),
  );
  const positions = await replacePositionProjection(
    client,
    accountId,
    projectPositionsFromTrades(trades),
  );
  return {
    positions,
    tradeCount: trades.length,
    cashBalanceCount: cash.balances.length,
    cashSettlementCount: cash.settlements.length,
    projectionGeneration,
  };
};

export type { CoreProjectionClient };
