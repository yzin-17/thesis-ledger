import type { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { supportedCurrency } from '../market/fx-conversion.js';

const payload = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const internalPortfolioTransfer = (
  event: { accountId: string | null; payload: Prisma.JsonValue | null },
  accountIds: ReadonlySet<string>,
) => {
  const value = payload(event.payload);
  const transfer = payload(value.transfer);
  return value.category === 'TRANSFER' && event.accountId !== null &&
    accountIds.has(event.accountId) && typeof transfer.counterpartyAccountId === 'string' &&
    accountIds.has(transfer.counterpartyAccountId);
};

export const externalPortfolioFlow = (event: { type: string; payload: Prisma.JsonValue | null }) => {
  if (event.type !== 'CASH_FLOW') return { amount: 0, currency: undefined };
  const value = payload(event.payload);
  if (['INTEREST', 'FEE', 'TAX'].includes(String(value.category)))
    return { amount: 0, currency: undefined };
  const amount = Number(value.amount);
  const currency = supportedCurrency(value.currency);
  if (!Number.isFinite(amount) || amount < 0 || !currency ||
    !['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'].includes(String(value.category)) ||
    !['INFLOW', 'OUTFLOW'].includes(String(value.direction)))
    throw new BadRequestException({ code: 'INVALID_PERFORMANCE_CASH_FLOW', message: '现金流金额、币种或方向不完整，不能按零或默认币种计算收益' });
  return {
    amount: value.direction === 'OUTFLOW' ? -amount : amount,
    currency,
  };
};
