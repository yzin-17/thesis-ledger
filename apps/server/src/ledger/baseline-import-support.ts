import { Prisma } from '@prisma/client';
import {
  type BaselineObservationInputV2,
  type CreateBaselineObservationBatchCommandV2,
  type ImportDraftRowV2,
} from '@thesis-ledger/schemas';
import {
  latestLedgerEventByFact,
  ledgerEventPositionOperation,
  ledgerEventSymbol,
} from './ledger-event-v2.js';
import { inferTimePrecision, isDateOnly } from './temporal.js';
import {
  toLedgerEventV2,
  type AccountLedgerWriteContext,
  type LedgerV2Repository,
} from './ledger-v2.repository.js';

export interface DraftRowAppendContext {
  ledger: AccountLedgerWriteContext;
  draftId: string;
  sourceChannel: string;
  revision: number;
  actorId: string;
  baselineBatchId: string;
  batchScope: 'FULL' | 'PARTIAL';
  recordedAt: string;
  observedAt?: string;
  capturedAt?: string;
  timePrecision?: 'INSTANT' | 'DATE';
  sourceTimezone?: string;
}

export const completeObservations = async (
  context: AccountLedgerWriteContext,
  command: CreateBaselineObservationBatchCommandV2,
): Promise<BaselineObservationInputV2[]> => {
  if (command.scope === 'PARTIAL') return command.observations;
  const missing = await findMissingBaselineAssets(
    context,
    command.observations.map((observation) => observation.symbol),
    command.observedAt,
  );
  const zeroObservations: BaselineObservationInputV2[] = missing.symbols.map((symbol) => ({
    symbol,
    quantity: '0',
    currency: missing.currencies.get(symbol) ?? 'CNY',
    costIncludesFees: 'UNKNOWN' as const,
  }));
  return [...command.observations, ...zeroObservations];
};

export const completeDraftBaselineRows = async (
  context: AccountLedgerWriteContext,
  rows: ImportDraftRowV2[],
  observedAt: string,
): Promise<ImportDraftRowV2[]> => {
  const includedSymbols = rows
    .filter(
      (row): row is Extract<ImportDraftRowV2, { kind: 'POSITION_BASELINE' }> =>
        row.kind === 'POSITION_BASELINE',
    )
    .map((row) => row.symbol);
  const missing = await findMissingBaselineAssets(context, includedSymbols, observedAt);
  if (missing.symbols.length === 0) return rows;
  const zeroRows: ImportDraftRowV2[] = missing.symbols.map((symbol) => ({
    rowId: `baseline-zero:${symbol}`,
    kind: 'POSITION_BASELINE',
    symbol,
    quantity: '0',
    currency: missing.currencies.get(symbol) ?? 'CNY',
    costIncludesFees: 'UNKNOWN',
    observedAt,
    issues: [],
  }));
  return [...rows, ...zeroRows];
};

const findMissingBaselineAssets = async (
  context: AccountLedgerWriteContext,
  includedSymbols: Iterable<string>,
  observedAt?: string | null,
) => {
  const tips = await readEffectiveEventTips(context, {
    ...(observedAt ? { occurredAt: { lte: new Date(observedAt) } } : {}),
  });
  const knownSymbols = new Set<string>();
  for (const event of tips.values()) {
    if (event.revisionAction === 'VOID') continue;
    const symbol = ledgerEventSymbol(event);
    if (symbol) knownSymbols.add(symbol);
  }
  const positionDelegate = (
    context.transaction as unknown as {
      position?: { findMany?: (args: unknown) => Promise<Array<{ symbol: string }>> };
    }
  ).position;
  if (typeof positionDelegate?.findMany === 'function') {
    const positions = await positionDelegate.findMany({
      where: { accountId: context.accountId },
      select: { symbol: true },
    });
    for (const position of positions) knownSymbols.add(position.symbol);
  }
  const included = new Set(includedSymbols);
  const symbols = [...knownSymbols].filter((symbol) => !included.has(symbol)).sort();
  const assets = await context.transaction.asset.findMany({
    where: { symbol: { in: symbols } },
    select: { symbol: true, currency: true },
  });
  return {
    symbols,
    currencies: new Map(assets.map((asset) => [asset.symbol, asset.currency])),
  };
};

const readEffectiveEventTips = async (
  context: AccountLedgerWriteContext,
  where: Prisma.LedgerEventWhereInput = {},
) => {
  const stored = await context.transaction.ledgerEvent.findMany({
    where: {
      AND: [{ accountId: context.accountId, factId: { not: null } }, where],
    },
    orderBy: { ledgerRevision: 'asc' },
  });
  return latestLedgerEventByFact(stored.map(toLedgerEventV2));
};

export const findOrphanSellRowIds = async (
  context: AccountLedgerWriteContext,
  rows: ImportDraftRowV2[],
  defaultObservedAt?: string,
) => {
  const tips = await readEffectiveEventTips(context);
  const operations: Array<{
    occurredAt: number;
    order: string;
    symbol: string;
    kind: 'SET' | 'ADD' | 'SUBTRACT' | 'RATIO';
    quantity?: Prisma.Decimal;
    fromUnits?: Prisma.Decimal;
    toUnits?: Prisma.Decimal;
    rowId?: string;
  }> = [];
  for (const event of tips.values()) {
    const operation = ledgerEventPositionOperation(event);
    if (!operation) continue;
    const base = {
      occurredAt:
        event.occurredAt === null ? Number.NEGATIVE_INFINITY : new Date(event.occurredAt).getTime(),
      order: `0:${event.economicOrderKey}`,
      symbol: operation.symbol,
    };
    if (operation.kind === 'RATIO')
      operations.push({
        ...base,
        kind: 'RATIO',
        fromUnits: new Prisma.Decimal(operation.fromUnits),
        toUnits: new Prisma.Decimal(operation.toUnits),
      });
    else
      operations.push({
        ...base,
        kind: operation.kind,
        quantity: new Prisma.Decimal(operation.quantity),
      });
  }
  for (const [index, row] of rows.entries()) {
    if (row.kind === 'UNRESOLVED') continue;
    const occurredAt =
      row.kind === 'EXECUTION' ? row.occurredAt : (row.observedAt ?? defaultObservedAt);
    if (!occurredAt) continue;
    let kind: 'SET' | 'ADD' | 'SUBTRACT';
    if (row.kind === 'POSITION_BASELINE') kind = 'SET';
    else if (row.side === 'BUY') kind = 'ADD';
    else kind = 'SUBTRACT';
    operations.push({
      occurredAt: new Date(occurredAt).getTime(),
      order: `1:${String(index).padStart(6, '0')}`,
      symbol: row.symbol,
      kind,
      quantity: new Prisma.Decimal(row.quantity),
      ...(row.kind === 'EXECUTION' && row.side === 'SELL' ? { rowId: row.rowId } : {}),
    });
  }
  operations.sort((left, right) =>
    left.occurredAt === right.occurredAt
      ? left.order.localeCompare(right.order)
      : left.occurredAt - right.occurredAt,
  );
  const balances = new Map<string, Prisma.Decimal>();
  const invalid = new Set<string>();
  for (const operation of operations) {
    const current = balances.get(operation.symbol) ?? new Prisma.Decimal(0);
    if (operation.kind === 'SET') balances.set(operation.symbol, operation.quantity!);
    if (operation.kind === 'ADD') balances.set(operation.symbol, current.plus(operation.quantity!));
    if (operation.kind === 'SUBTRACT') {
      const next = current.minus(operation.quantity!);
      if (operation.rowId && next.isNegative()) invalid.add(operation.rowId);
      balances.set(operation.symbol, next);
    }
    if (operation.kind === 'RATIO')
      balances.set(operation.symbol, current.mul(operation.toUnits!).div(operation.fromUnits!));
  }
  return [...invalid];
};

export const appendDraftRow = (
  repository: LedgerV2Repository,
  context: DraftRowAppendContext,
  row: ImportDraftRowV2,
  index: number,
) => {
  if (row.kind === 'UNRESOLVED') throw new Error('未解决导入行不能进入账本');
  const rowTime = row.kind === 'EXECUTION' ? row.occurredAt : row.observedAt;
  const occurredAt = rowTime ?? context.observedAt;
  if (!occurredAt) throw new Error('导入行缺少业务发生时间');
  const timePrecision =
    row.timePrecision ??
    (row.kind === 'POSITION_BASELINE' ? context.timePrecision : undefined) ??
    inferTimePrecision(occurredAt);
  if (timePrecision === 'DATE' && !isDateOnly(occurredAt))
    throw new Error('DATE 精度必须使用日期值');
  if (timePrecision === 'INSTANT' && isDateOnly(occurredAt))
    throw new Error('INSTANT 精度必须使用时间值');
  const sourceTimezone = row.sourceTimezone ?? context.sourceTimezone;
  if (!sourceTimezone) throw new Error('导入行缺少来源时区');
  const common = {
    version: 2 as const,
    eventId: crypto.randomUUID(),
    factId: crypto.randomUUID(),
    accountId: context.ledger.accountId,
    ledgerRevision: context.ledger.nextLedgerRevision.toString(),
    occurredAt,
    timePrecision,
    sourceTimezone,
    economicOrderKey: `draft:${String(index).padStart(6, '0')}`,
    recordedAt: context.recordedAt,
    payloadVersion: 1,
    source: {
      category: 'IMPORT' as const,
      channel: context.sourceChannel,
      externalId: `draft:${context.draftId}:${context.revision}:${row.rowId}`,
      sourceRowId: row.rowId,
    },
    actorId: context.actorId,
    revisionAction: 'CREATE' as const,
  };
  if (row.kind === 'EXECUTION')
    return repository.appendRevision(context.ledger, {
      ...common,
      type: row.side === 'BUY' ? 'BUY_EXECUTION' : 'SELL_EXECUTION',
      payload: {
        symbol: row.symbol,
        quantity: row.quantity,
        price: row.price,
        currency: row.currency,
        capabilityVerification: 'UNVERIFIED',
        charges: row.charges,
      },
    });
  const capturedAt = row.capturedAt ?? context.capturedAt;
  return repository.appendRevision(context.ledger, {
    ...common,
    type: 'POSITION_BASELINE_OBSERVATION',
    payload: {
      symbol: row.symbol,
      batchId: context.baselineBatchId,
      batchScope: context.batchScope,
      quantity: row.quantity,
      ...(row.averageCost === undefined ? {} : { averageCost: row.averageCost }),
      currency: row.currency,
      costIncludesFees: row.costIncludesFees,
      ...(capturedAt ? { capturedAt } : {}),
    },
  });
};
