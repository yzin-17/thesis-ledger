import type { LedgerEvent } from '@thesis-ledger/api-client';
import type { Account } from '../portfolio/portfolio.types.js';

export const canManageFundInvestments = (account: Account | undefined) =>
  account?.type === 'fund' && account.mode === 'actual' && account.active !== false;

export const fundInvestmentOccurrenceId = (source: LedgerEvent['source']) => {
  const prefix = 'fund-investment-occurrence:';
  if (source.channel !== 'recurring-fund-investment' || !source.externalId?.startsWith(prefix))
    return null;
  return source.externalId.slice(prefix.length) || null;
};
