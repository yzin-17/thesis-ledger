import { Prisma } from '@prisma/client';
import { latestLedgerEventByFact, ledgerEventPositionOperation } from './ledger-event-v2.js';
import { toLedgerEventV2 } from './ledger-v2.repository.js';
import { rebuildCoreProjections, type CoreProjectionClient } from './core-projection.js';

// PostgreSQL Decimal(24,8) permits more significant digits than Decimal.js's
// default precision of 20; configure the shared Prisma Decimal class before
// any projection arithmetic runs.
Prisma.Decimal.set({ precision: 40 });

export type LedgerProjectionClient = Pick<Prisma.TransactionClient, 'ledgerEvent' | 'position'>;
type StoredLedgerEvent = Awaited<
  ReturnType<LedgerProjectionClient['ledgerEvent']['findMany']>
>[number];

type PositionProjection = {
  accountId: string;
  symbol: string;
  quantity: Prisma.Decimal;
  averageCost: Prisma.Decimal;
  realizedPnl: Prisma.Decimal;
};

type PositionOperation =
  | {
      accountId: string;
      symbol: string;
      occurredAt: string | null;
      order: string;
      kind: 'SET' | 'ADD' | 'SUBTRACT' | 'BONUS';
      quantity: Prisma.Decimal;
      unitCost?: Prisma.Decimal;
      charges?: Prisma.Decimal;
    }
  | {
      accountId: string;
      symbol: string;
      occurredAt: string | null;
      order: string;
      kind: 'RATIO';
      fromUnits: Prisma.Decimal;
      toUnits: Prisma.Decimal;
    };

const decimal = (value: unknown, fallback = '0') =>
  new Prisma.Decimal(decimalString(value, fallback));

const decimalString = (value: unknown, fallback = '0') => {
  if (value === null || value === undefined) return fallback;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return fallback;
};

const compareOperationOrder = (left: PositionOperation, right: PositionOperation) => {
  if (left.occurredAt === null && right.occurredAt !== null) return -1;
  if (left.occurredAt !== null && right.occurredAt === null) return 1;
  if (left.occurredAt !== right.occurredAt)
    return (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '');
  return left.order.localeCompare(right.order);
};

const v2Operations = (stored: StoredLedgerEvent[]): PositionOperation[] => {
  // VOID revisions must participate in tip selection; filtering them first
  // would resurrect the superseded version in the materialized position.
  const v2Stored = stored.filter((event) => event.factId != null);
  if (v2Stored.length === 0) return [];
  const tips = latestLedgerEventByFact(v2Stored.map(toLedgerEventV2));
  const operations: PositionOperation[] = [];
  for (const event of tips.values()) {
    if (event.revisionAction === 'VOID') continue;
    const operation = ledgerEventPositionOperation(event);
    if (!operation) continue;
    const base = {
      accountId: event.accountId,
      symbol: operation.symbol,
      occurredAt: event.occurredAt,
      order: `${event.economicOrderKey}:${event.eventId}`,
    };
    if (operation.kind === 'RATIO') {
      operations.push({
        ...base,
        kind: 'RATIO',
        fromUnits: decimal(operation.fromUnits),
        toUnits: decimal(operation.toUnits),
      });
      continue;
    }
    if (event.type === 'POSITION_BASELINE_OBSERVATION') {
      operations.push({
        ...base,
        kind: 'SET',
        quantity: decimal(operation.quantity),
        unitCost: decimal(event.payload.averageCost),
      });
      continue;
    }
    if (event.type === 'BONUS_SHARE') {
      operations.push({ ...base, kind: 'BONUS', quantity: decimal(operation.quantity) });
      continue;
    }
    if (event.type === 'BUY_EXECUTION' || event.type === 'SELL_EXECUTION') {
      const charges = event.payload.charges.reduce(
        (total, charge) =>
          charge.currency === event.payload.currency ? total.plus(decimal(charge.amount)) : total,
        new Prisma.Decimal(0),
      );
      operations.push({
        ...base,
        kind: event.type === 'BUY_EXECUTION' ? 'ADD' : 'SUBTRACT',
        quantity: decimal(operation.quantity),
        unitCost: decimal(event.payload.price),
        charges,
      });
      continue;
    }
    if (operation.kind === 'ADD' || operation.kind === 'SUBTRACT')
      operations.push({ ...base, kind: operation.kind, quantity: decimal(operation.quantity) });
  }
  return operations;
};

const groupOperations = (operations: PositionOperation[]) => {
  const groups = new Map<string, PositionOperation[]>();
  for (const operation of operations) {
    const key = `${operation.accountId}:${operation.symbol}`;
    const group = groups.get(key) ?? [];
    group.push(operation);
    groups.set(key, group);
  }
  return groups;
};

const projectAverage = (operations: PositionOperation[]): PositionProjection[] =>
  [...groupOperations(operations).values()].map((group) => {
    let quantity = new Prisma.Decimal(0);
    let cost = new Prisma.Decimal(0);
    let realizedPnl = new Prisma.Decimal(0);
    for (const operation of [...group].sort(compareOperationOrder)) {
      if (operation.kind === 'SET') {
        quantity = operation.quantity;
        cost = operation.quantity.mul(operation.unitCost ?? 0);
        continue;
      }
      if (operation.kind === 'BONUS') {
        quantity = quantity.plus(operation.quantity);
        continue;
      }
      if (operation.kind === 'RATIO') {
        quantity = quantity.mul(operation.toUnits).div(operation.fromUnits);
        continue;
      }
      const units = operation.quantity;
      if (operation.kind === 'ADD') {
        quantity = quantity.plus(units);
        cost = cost.plus(units.mul(operation.unitCost ?? 0)).plus(operation.charges ?? 0);
        continue;
      }
      if (units.gt(quantity)) throw new Error(`卖出数量超过持仓: ${operation.symbol}`);
      const averageCost = quantity.isZero() ? new Prisma.Decimal(0) : cost.div(quantity);
      realizedPnl = realizedPnl
        .plus(units.mul(operation.unitCost ?? 0))
        .minus(operation.charges ?? 0)
        .minus(units.mul(averageCost));
      quantity = quantity.minus(units);
      cost = cost.minus(units.mul(averageCost));
    }
    const first = group[0]!;
    return {
      accountId: first.accountId,
      symbol: first.symbol,
      quantity,
      averageCost: quantity.isZero() ? new Prisma.Decimal(0) : cost.div(quantity),
      realizedPnl,
    };
  });

const projectFifo = (operations: PositionOperation[]): PositionProjection[] =>
  [...groupOperations(operations).values()].map((group) => {
    const lots: Array<{ quantity: Prisma.Decimal; unitCost: Prisma.Decimal }> = [];
    let realizedPnl = new Prisma.Decimal(0);
    for (const operation of [...group].sort(compareOperationOrder)) {
      if (operation.kind === 'SET') {
        lots.length = 0;
        if (operation.quantity.gt(0))
          lots.push({
            quantity: operation.quantity,
            unitCost: operation.unitCost ?? new Prisma.Decimal(0),
          });
        continue;
      }
      if (operation.kind === 'BONUS') {
        const totalBefore = lots.reduce(
          (sum, lot) => sum.plus(lot.quantity),
          new Prisma.Decimal(0),
        );
        if (totalBefore.isZero()) throw new Error(`无持仓时不能送股: ${operation.symbol}`);
        const multiplier = totalBefore.plus(operation.quantity).div(totalBefore);
        for (const lot of lots) {
          lot.quantity = lot.quantity.mul(multiplier);
          lot.unitCost = lot.unitCost.div(multiplier);
        }
        continue;
      }
      if (operation.kind === 'RATIO') {
        const multiplier = operation.toUnits.div(operation.fromUnits);
        for (const lot of lots) {
          lot.quantity = lot.quantity.mul(multiplier);
          lot.unitCost = lot.unitCost.div(multiplier);
        }
        continue;
      }
      if (operation.kind === 'ADD') {
        const unitCost = operation.unitCost ?? new Prisma.Decimal(0);
        const chargePerUnit = operation.quantity.isZero()
          ? new Prisma.Decimal(0)
          : (operation.charges ?? new Prisma.Decimal(0)).div(operation.quantity);
        lots.push({ quantity: operation.quantity, unitCost: unitCost.plus(chargePerUnit) });
        continue;
      }
      let remaining = operation.quantity;
      const proceedsPerUnit = operation.quantity.isZero()
        ? new Prisma.Decimal(0)
        : (operation.unitCost ?? new Prisma.Decimal(0)).minus(
            (operation.charges ?? new Prisma.Decimal(0)).div(operation.quantity),
          );
      while (remaining.gt(0)) {
        const lot = lots[0];
        if (!lot) throw new Error(`卖出数量超过持仓: ${operation.symbol}`);
        const consumed = remaining.lt(lot.quantity) ? remaining : lot.quantity;
        realizedPnl = realizedPnl.plus(consumed.mul(proceedsPerUnit.minus(lot.unitCost)));
        lot.quantity = lot.quantity.minus(consumed);
        remaining = remaining.minus(consumed);
        if (lot.quantity.isZero()) lots.shift();
      }
    }
    const quantity = lots.reduce((sum, lot) => sum.plus(lot.quantity), new Prisma.Decimal(0));
    const cost = lots.reduce(
      (sum, lot) => sum.plus(lot.quantity.mul(lot.unitCost)),
      new Prisma.Decimal(0),
    );
    const first = group[0]!;
    return {
      accountId: first.accountId,
      symbol: first.symbol,
      quantity,
      averageCost: quantity.isZero() ? new Prisma.Decimal(0) : cost.div(quantity),
      realizedPnl,
    };
  });

const projectPositions = (stored: StoredLedgerEvent[], method: 'AVG' | 'FIFO') => {
  const operations = v2Operations(stored);
  return method === 'AVG' ? projectAverage(operations) : projectFifo(operations);
};

export const rebuildLedgerProjection = async (
  client: LedgerProjectionClient | CoreProjectionClient,
  accountId: string,
  method: 'AVG' | 'FIFO',
  projectionGeneration?: bigint,
) => {
  if ('trade' in client && 'cashBalance' in client && 'accountCostStrategyVersion' in client) {
    const result = await rebuildCoreProjections(
      client,
      accountId,
      projectionGeneration === undefined ? { method } : { method, projectionGeneration },
    );
    return result.positions;
  }
  const stored = await client.ledgerEvent.findMany({
    where: { accountId },
    orderBy: [{ ledgerRevision: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const projected = projectPositions(stored, method);
  const existing = await client.position.findMany({
    where: { accountId },
    select: { id: true, symbol: true },
  });
  const existingBySymbol = new Map(existing.map((position) => [position.symbol, position]));
  const nextBySymbol = new Map(
    projected
      .filter((position) => position.quantity.gt(0))
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
        source: 'ledger',
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
        source: 'ledger',
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
