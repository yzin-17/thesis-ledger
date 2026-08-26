import { roundMoney } from '@thesis-ledger/shared';
import type { CompletedTrade } from './behavior.js';
import type { LedgerEvent } from './ledger.js';

export type JournalReviewCostMethod = 'AVG' | 'FIFO';

export interface CompletedLedgerTrade extends CompletedTrade {
  id: string;
  accountId: string;
  quantity: number;
  entryEventIds: string[];
  exitEventIds: string[];
}

interface ReviewLot {
  quantity: number;
  unitCost: number;
  unitPrice: number;
  openedAt: string;
  eventIds: string[];
}

const tradeEvents = (events: readonly LedgerEvent[]) =>
  [...events]
    .filter(
      (event) =>
        event.symbol &&
        (event.type === 'BUY' ||
          event.type === 'SELL' ||
          event.type === 'BONUS' ||
          event.type === 'SPLIT' ||
          event.type === 'MERGE' ||
          event.type === 'ADJUSTMENT'),
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));

const adjustment = (event: LedgerEvent) => {
  if (event.type !== 'ADJUSTMENT' || !event.metadata || typeof event.metadata !== 'object')
    return null;
  const metadata = event.metadata;
  if (!['opening-balance', 'position-balance', 'rollback'].includes(String(metadata.kind)))
    return null;
  const quantity = typeof metadata.quantity === 'number' ? metadata.quantity : event.quantity;
  const costPrice = typeof metadata.costPrice === 'number' ? metadata.costPrice : event.price;
  if (quantity === undefined || quantity < 0) return null;
  if (quantity > 0 && costPrice === undefined) return null;
  return { quantity, costPrice: costPrice ?? 0 };
};

const scaleLots = (lots: ReviewLot[], multiplier: number) => {
  for (const lot of lots) {
    lot.quantity *= multiplier;
    lot.unitCost /= multiplier;
    lot.unitPrice /= multiplier;
  }
};

const candidateId = (accountId: string, symbol: string, entryEventIds: string[], exitId: string) =>
  `review:${accountId}:${symbol}:${[...entryEventIds].sort().join(',')}:${exitId}`;

const toCompletedTrade = (input: {
  accountId: string;
  symbol: string;
  entryAt: string;
  exitAt: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  turnover: number;
  entryEventIds: string[];
  exitEventIds: string[];
}): CompletedLedgerTrade => ({
  id: candidateId(input.accountId, input.symbol, input.entryEventIds, input.exitEventIds[0]!),
  accountId: input.accountId,
  symbol: input.symbol,
  entryAt: input.entryAt,
  exitAt: input.exitAt,
  pnl: roundMoney(input.pnl),
  entryPrice: roundMoney(input.entryPrice),
  exitPrice: roundMoney(input.exitPrice),
  actualExit: roundMoney(input.exitPrice),
  turnover: roundMoney(input.turnover),
  quantity: roundMoney(input.quantity),
  entryEventIds: [...input.entryEventIds].sort(),
  exitEventIds: [...input.exitEventIds],
});

const toNumber = (value: number | undefined) => value ?? 0;

const averageTrade = (events: readonly LedgerEvent[], accountId: string, symbol: string) => {
  const lots: ReviewLot[] = [];
  const completed: CompletedLedgerTrade[] = [];

  for (const event of events) {
    const action = adjustment(event);
    if (action) {
      lots.length = 0;
      if (action.quantity > 0) {
        lots.push({
          quantity: action.quantity,
          unitCost: action.costPrice,
          unitPrice: action.costPrice,
          openedAt: event.occurredAt,
          eventIds: [event.id],
        });
      }
      continue;
    }
    if (event.type === 'BONUS' && lots.length > 0) {
      const totalBefore = lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const multiplier = (totalBefore + toNumber(event.quantity)) / totalBefore;
      scaleLots(lots, multiplier);
      continue;
    }
    if ((event.type === 'SPLIT' || event.type === 'MERGE') && lots.length > 0) {
      const units = toNumber(event.quantity);
      if (units <= 0) continue;
      scaleLots(lots, event.type === 'SPLIT' ? units : 1 / units);
      continue;
    }
    if (event.type === 'BUY') {
      const quantity = toNumber(event.quantity);
      if (quantity <= 0) continue;
      const charges = toNumber(event.fee) + toNumber(event.tax);
      lots.push({
        quantity,
        unitCost: event.price === undefined ? 0 : event.price + charges / quantity,
        unitPrice: event.price ?? 0,
        openedAt: event.occurredAt,
        eventIds: [event.id],
      });
      continue;
    }
    if (event.type !== 'SELL') continue;
    const quantity = toNumber(event.quantity);
    if (quantity <= 0) continue;
    const totalQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (quantity > totalQuantity + 0.00000001) throw new Error(`卖出数量超过持仓: ${symbol}`);
    if (totalQuantity <= 0) continue;
    const totalCost = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
    const totalRawEntry = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitPrice, 0);
    const charges = toNumber(event.fee) + toNumber(event.tax);
    const entryEventIds = lots.flatMap((lot) => lot.eventIds);
    const entryAt = lots.reduce(
      (earliest, lot) => (lot.openedAt < earliest ? lot.openedAt : earliest),
      lots[0]!.openedAt,
    );
    const exitPrice = event.price ?? 0;
    const proceedsPerUnit = exitPrice - charges / quantity;
    const averageCost = totalCost / totalQuantity;
    const entryPrice = totalRawEntry / totalQuantity;
    const pnl = quantity * (proceedsPerUnit - averageCost);
    const turnover = quantity * (entryPrice + exitPrice);
    completed.push(
      toCompletedTrade({
        accountId,
        symbol,
        entryAt,
        exitAt: event.occurredAt,
        quantity,
        entryPrice,
        exitPrice,
        pnl,
        turnover,
        entryEventIds,
        exitEventIds: [event.id],
      }),
    );

    const ratio = quantity / totalQuantity;
    for (const lot of lots) lot.quantity *= 1 - ratio;
    for (let index = lots.length - 1; index >= 0; index -= 1) {
      if (lots[index]!.quantity <= 0.00000001) lots.splice(index, 1);
    }
  }
  return completed;
};

const fifoTrade = (events: readonly LedgerEvent[], accountId: string, symbol: string) => {
  const lots: ReviewLot[] = [];
  const completed: CompletedLedgerTrade[] = [];

  for (const event of events) {
    const action = adjustment(event);
    if (action) {
      lots.length = 0;
      if (action.quantity > 0) {
        lots.push({
          quantity: action.quantity,
          unitCost: action.costPrice,
          unitPrice: action.costPrice,
          openedAt: event.occurredAt,
          eventIds: [event.id],
        });
      }
      continue;
    }
    if (event.type === 'BONUS' && lots.length > 0) {
      const totalBefore = lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const multiplier = (totalBefore + toNumber(event.quantity)) / totalBefore;
      scaleLots(lots, multiplier);
      continue;
    }
    if ((event.type === 'SPLIT' || event.type === 'MERGE') && lots.length > 0) {
      const units = toNumber(event.quantity);
      if (units <= 0) continue;
      scaleLots(lots, event.type === 'SPLIT' ? units : 1 / units);
      continue;
    }
    if (event.type === 'BUY') {
      const quantity = toNumber(event.quantity);
      if (quantity <= 0) continue;
      const charges = toNumber(event.fee) + toNumber(event.tax);
      lots.push({
        quantity,
        unitCost: (event.price ?? 0) + charges / quantity,
        unitPrice: event.price ?? 0,
        openedAt: event.occurredAt,
        eventIds: [event.id],
      });
      continue;
    }
    if (event.type !== 'SELL') continue;
    let remaining = toNumber(event.quantity);
    if (remaining <= 0) continue;
    const available = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (remaining > available + 0.00000001) throw new Error(`卖出数量超过持仓: ${symbol}`);
    const matched: Array<{ lot: ReviewLot; quantity: number }> = [];
    while (remaining > 0.00000001) {
      const lot = lots[0];
      if (!lot) throw new Error(`卖出数量超过持仓: ${symbol}`);
      const quantity = Math.min(remaining, lot.quantity);
      matched.push({ lot, quantity });
      lot.quantity -= quantity;
      remaining -= quantity;
      if (lot.quantity <= 0.00000001) lots.shift();
    }
    const sellQuantity = toNumber(event.quantity);
    const charges = toNumber(event.fee) + toNumber(event.tax);
    const exitPrice = event.price ?? 0;
    const proceedsPerUnit = exitPrice - charges / sellQuantity;
    const entryQuantity = matched.reduce((sum, item) => sum + item.quantity, 0);
    const entryRawValue = matched.reduce(
      (sum, item) => sum + item.quantity * item.lot.unitPrice,
      0,
    );
    const pnl = matched.reduce(
      (sum, item) => sum + item.quantity * (proceedsPerUnit - item.lot.unitCost),
      0,
    );
    const entryAt = matched.reduce(
      (earliest, item) => (item.lot.openedAt < earliest ? item.lot.openedAt : earliest),
      matched[0]!.lot.openedAt,
    );
    const entryEventIds = matched.flatMap((item) => item.lot.eventIds);
    const entryPrice = entryRawValue / entryQuantity;
    completed.push(
      toCompletedTrade({
        accountId,
        symbol,
        entryAt,
        exitAt: event.occurredAt,
        quantity: entryQuantity,
        entryPrice,
        exitPrice,
        pnl,
        turnover: entryQuantity * (entryPrice + exitPrice),
        entryEventIds,
        exitEventIds: [event.id],
      }),
    );
  }
  return completed;
};

export const projectCompletedTrades = (
  events: readonly LedgerEvent[],
  method: JournalReviewCostMethod = 'AVG',
) => {
  const groups = new Map<string, LedgerEvent[]>();
  for (const event of tradeEvents(events)) {
    if (!event.symbol) continue;
    const key = `${event.accountId}:${event.symbol}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.values()]
    .flatMap((group) => {
      const first = group[0];
      if (!first?.symbol) return [];
      return method === 'FIFO'
        ? fifoTrade(group, first.accountId, first.symbol)
        : averageTrade(group, first.accountId, first.symbol);
    })
    .sort((a, b) => b.exitAt.localeCompare(a.exitAt) || a.id.localeCompare(b.id));
};
