import { Prisma } from '@prisma/client';
import type { CurrencyV1 } from '@thesis-ledger/schemas';

type JsonRecord = Record<string, unknown>;

const supportedCurrency = (value: unknown): CurrencyV1 | undefined => {
  if (value === 'CNY' || value === 'HKD' || value === 'USD') return value;
  return undefined;
};

export type TradeRealizedPnlSlice = {
  currency: string;
  quantity: Prisma.Decimal | string | number;
  netRealizedPnl: Prisma.Decimal | string | number | null;
  costEstimated: boolean;
  allocations: Array<{
    originalCost: Prisma.Decimal | string | number | null;
    allocatedBuyCharges: unknown;
  }>;
};

export type CurrencyPnlAmount = {
  currency: CurrencyV1;
  amount: number;
};

export type TradeRealizedPnlSummary = {
  hasClosedTrades: boolean;
  complete: boolean;
  missingCurrencies: string[];
  pnl: CurrencyPnlAmount[];
  cost: CurrencyPnlAmount[];
};

const decimal = (value: unknown) => {
  if (value === null || value === undefined) return null;
  try {
    const parsed = new Prisma.Decimal(value as Prisma.Decimal.Value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
};

const record = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const add = (
  map: Map<CurrencyV1, Prisma.Decimal>,
  currency: CurrencyV1,
  amount: Prisma.Decimal,
) => {
  map.set(currency, (map.get(currency) ?? new Prisma.Decimal(0)).plus(amount));
};

const allocationCost = (slice: TradeRealizedPnlSlice, currency: CurrencyV1) => {
  const quantity = decimal(slice.quantity);
  if (quantity === null || quantity.isNegative()) return null;
  if (quantity.isPositive() && slice.allocations.length === 0) return null;

  let total = new Prisma.Decimal(0);
  for (const allocation of slice.allocations) {
    const originalCost = decimal(allocation.originalCost);
    if (originalCost === null) return null;
    total = total.plus(originalCost);

    const charges = allocation.allocatedBuyCharges;
    if (charges === null || charges === undefined) continue;
    if (!Array.isArray(charges)) return null;
    for (const charge of charges) {
      const line = record(charge);
      if (!line || line.currency !== currency) return null;
      const amount = decimal(line.amount);
      if (amount === null || amount.isNegative()) return null;
      total = total.plus(amount);
    }
  }
  return total;
};

const amounts = (map: Map<CurrencyV1, Prisma.Decimal>): CurrencyPnlAmount[] =>
  [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount: amount.toNumber() }));

export const summarizeTradeRealizedPnl = (
  slices: readonly TradeRealizedPnlSlice[],
): TradeRealizedPnlSummary => {
  const pnlByCurrency = new Map<CurrencyV1, Prisma.Decimal>();
  const costByCurrency = new Map<CurrencyV1, Prisma.Decimal>();
  const missingCurrencies = new Set<string>();
  let complete = true;

  for (const slice of slices) {
    const currency = supportedCurrency(slice.currency);
    if (!currency || slice.costEstimated) {
      complete = false;
      missingCurrencies.add(currency ?? slice.currency);
      continue;
    }

    const realizedPnl = decimal(slice.netRealizedPnl);
    const realizedCost = allocationCost(slice, currency);
    if (realizedPnl === null || realizedCost === null) {
      complete = false;
      missingCurrencies.add(currency);
      continue;
    }
    add(pnlByCurrency, currency, realizedPnl);
    add(costByCurrency, currency, realizedCost);
  }

  return {
    hasClosedTrades: slices.length > 0,
    complete,
    missingCurrencies: [...missingCurrencies].sort(),
    pnl: amounts(pnlByCurrency),
    cost: amounts(costByCurrency),
  };
};
