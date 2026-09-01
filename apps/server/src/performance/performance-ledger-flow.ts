import type { Prisma } from '@prisma/client';
import { supportedCurrency } from '../market/fx-conversion.js';

const payload = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const externalPortfolioFlow = (event: { type: string; payload: Prisma.JsonValue | null }) => {
  if (event.type !== 'CASH_FLOW') return { amount: 0, currency: undefined };
  const value = payload(event.payload);
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount === 0) return { amount: 0, currency: undefined };
  if (!['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'].includes(String(value.category)))
    return { amount: 0, currency: undefined };
  return {
    amount: value.direction === 'OUTFLOW' ? -amount : amount,
    currency: supportedCurrency(value.currency),
  };
};
