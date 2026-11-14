import { Prisma } from '@prisma/client';
import type { AiCostFacts } from '@thesis-ledger/schemas';

/** 明确的零金额在预算币种中仍为零；非零异币种需要汇率证据。 */
export function liveCallCostMicros(cost: AiCostFacts, budgetCurrency: string): number | null {
  if (cost.status === 'unknown' || cost.amount === null || cost.currency === null) return null;
  const amount = new Prisma.Decimal(cost.amount);
  if (cost.currency !== budgetCurrency && !amount.isZero()) return null;
  const micros = amount.times(1000000).ceil().toNumber();
  return Number.isSafeInteger(micros) && micros >= 0 ? micros : null;
}
