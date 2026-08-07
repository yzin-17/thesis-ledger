import { groupBy, roundMoney } from '@thesis-ledger/shared';

export type LedgerEventType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'FEE'
  | 'TAX'
  | 'INTEREST'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'CASH_DEPOSIT'
  | 'CASH_WITHDRAW'
  | 'BONUS'
  | 'SPLIT'
  | 'MERGE'
  | 'ADJUSTMENT';

export interface LedgerEvent {
  id: string;
  accountId: string;
  type: LedgerEventType;
  occurredAt: string;
  symbol?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  fee?: number;
  tax?: number;
  externalId?: string;
  source?: string;
  correctionOf?: string;
  metadata?: Record<string, unknown>;
}

const adjustmentMetadata = (event: LedgerEvent) =>
  event.metadata && typeof event.metadata === 'object' ? event.metadata : {};

const isPositionAdjustment = (event: LedgerEvent) => {
  const metadata = adjustmentMetadata(event);
  return (
    event.type === 'ADJUSTMENT' &&
    (metadata.kind === 'opening-balance' ||
      metadata.kind === 'position-balance' ||
      metadata.kind === 'rollback')
  );
};

const applyPositionAdjustment = (event: LedgerEvent, state: { quantity: number; cost: number }) => {
  if (!isPositionAdjustment(event)) return false;
  const metadata = adjustmentMetadata(event);
  const quantity =
    typeof metadata.quantity === 'number' ? metadata.quantity : (event.quantity ?? 0);
  const costPrice =
    typeof metadata.costPrice === 'number' ? metadata.costPrice : (event.price ?? 0);
  state.quantity = quantity;
  state.cost = quantity * costPrice;
  return true;
};

export interface ProjectedPosition {
  accountId: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  realizedPnl: number;
}

export const projectAverageCost = (events: readonly LedgerEvent[]): ProjectedPosition[] => {
  const trades = events.filter(
    (event) =>
      event.symbol && ['BUY', 'SELL', 'BONUS', 'SPLIT', 'MERGE', 'ADJUSTMENT'].includes(event.type),
  );
  return [...groupBy(trades, (event) => `${event.accountId}:${event.symbol}`).values()].map(
    (group) => {
      let quantity = 0;
      let cost = 0;
      let realizedPnl = 0;
      for (const event of [...group].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
        if (
          applyPositionAdjustment(event, {
            get quantity() {
              return quantity;
            },
            set quantity(value) {
              quantity = value;
            },
            get cost() {
              return cost;
            },
            set cost(value) {
              cost = value;
            },
          })
        )
          continue;
        const units = event.quantity ?? 0;
        const price = event.price ?? 0;
        const charges = (event.fee ?? 0) + (event.tax ?? 0);
        if (event.type === 'BUY') {
          quantity += units;
          cost += units * price + charges;
        } else if (event.type === 'SELL') {
          if (units > quantity) throw new Error(`卖出数量超过持仓: ${event.symbol}`);
          const averageCost = quantity === 0 ? 0 : cost / quantity;
          realizedPnl += units * price - charges - units * averageCost;
          quantity -= units;
          cost -= units * averageCost;
        } else if (event.type === 'BONUS') {
          quantity += units;
        } else if (event.type === 'SPLIT') {
          quantity *= units;
        } else if (event.type === 'MERGE') {
          quantity /= units;
        }
      }
      const first = group[0]!;
      return {
        accountId: first.accountId,
        symbol: first.symbol!,
        quantity: roundMoney(quantity),
        averageCost: quantity === 0 ? 0 : roundMoney(cost / quantity),
        realizedPnl: roundMoney(realizedPnl),
      };
    },
  );
};

export const projectFifo = (events: readonly LedgerEvent[]): ProjectedPosition[] => {
  const trades = events.filter(
    (event) =>
      event.symbol && ['BUY', 'SELL', 'BONUS', 'SPLIT', 'MERGE', 'ADJUSTMENT'].includes(event.type),
  );
  return [...groupBy(trades, (event) => `${event.accountId}:${event.symbol}`).values()].map(
    (group) => {
      const lots: Array<{ quantity: number; unitCost: number }> = [];
      let realizedPnl = 0;
      for (const event of [...group].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
        if (isPositionAdjustment(event)) {
          const metadata = adjustmentMetadata(event);
          const quantity =
            typeof metadata.quantity === 'number' ? metadata.quantity : (event.quantity ?? 0);
          const costPrice =
            typeof metadata.costPrice === 'number' ? metadata.costPrice : (event.price ?? 0);
          lots.length = 0;
          if (quantity > 0) lots.push({ quantity, unitCost: costPrice });
          continue;
        }
        let units = event.quantity ?? 0;
        const price = event.price ?? 0;
        const charges = (event.fee ?? 0) + (event.tax ?? 0);
        if (event.type === 'BUY') {
          lots.push({ quantity: units, unitCost: price + charges / Math.max(units, 1) });
          continue;
        }
        if (event.type === 'BONUS') {
          const totalBefore = lots.reduce((sum, lot) => sum + lot.quantity, 0);
          if (totalBefore === 0) throw new Error(`无持仓时不能送股: ${event.symbol}`);
          const multiplier = (totalBefore + units) / totalBefore;
          for (const lot of lots) {
            lot.quantity *= multiplier;
            lot.unitCost /= multiplier;
          }
          continue;
        }
        if (event.type === 'SPLIT' || event.type === 'MERGE') {
          const multiplier = event.type === 'SPLIT' ? units : 1 / units;
          for (const lot of lots) {
            lot.quantity *= multiplier;
            lot.unitCost /= multiplier;
          }
          continue;
        }
        const proceedsPerUnit = price - charges / Math.max(units, 1);
        while (units > 0) {
          const lot = lots[0];
          if (!lot) throw new Error(`卖出数量超过持仓: ${event.symbol}`);
          const consumed = Math.min(units, lot.quantity);
          realizedPnl += consumed * (proceedsPerUnit - lot.unitCost);
          lot.quantity -= consumed;
          units -= consumed;
          if (lot.quantity === 0) lots.shift();
        }
      }
      const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const cost = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
      const first = group[0]!;
      return {
        accountId: first.accountId,
        symbol: first.symbol!,
        quantity: roundMoney(quantity),
        averageCost: quantity === 0 ? 0 : roundMoney(cost / quantity),
        realizedPnl: roundMoney(realizedPnl),
      };
    },
  );
};

export const projectCashBalance = (events: readonly LedgerEvent[]) => {
  const balances = new Map<string, number>();
  for (const event of [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const metadata = adjustmentMetadata(event);
    if (event.type === 'ADJUSTMENT' && metadata.kind === 'cash-balance') {
      const balance = typeof metadata.amount === 'number' ? metadata.amount : (event.amount ?? 0);
      balances.set(event.accountId, roundMoney(balance));
      continue;
    }
    let delta = 0;
    const quantity = event.quantity ?? 0;
    const price = event.price ?? 0;
    const charges = (event.fee ?? 0) + (event.tax ?? 0);
    if (event.type === 'BUY') delta = -(quantity * price + charges);
    if (event.type === 'SELL') delta = quantity * price - charges;
    if (
      event.type === 'DIVIDEND' ||
      event.type === 'INTEREST' ||
      event.type === 'TRANSFER_IN' ||
      event.type === 'CASH_DEPOSIT'
    )
      delta = event.amount ?? 0;
    if (
      event.type === 'FEE' ||
      event.type === 'TAX' ||
      event.type === 'TRANSFER_OUT' ||
      event.type === 'CASH_WITHDRAW'
    )
      delta = -(event.amount ?? 0);
    balances.set(event.accountId, roundMoney((balances.get(event.accountId) ?? 0) + delta));
  }
  return balances;
};
