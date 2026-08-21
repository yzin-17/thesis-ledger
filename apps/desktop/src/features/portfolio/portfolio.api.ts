import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
import { omitUndefinedDeep } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { Account, HeldAssetType, Portfolio, PortfolioMode } from './portfolio.types.js';

const accountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  institution: z.string().nullable().optional(),
  type: z.enum(['securities', 'fund', 'cash']),
  mode: z.enum(['actual', 'shadow']),
  currency: z.enum(['CNY', 'HKD', 'USD']),
  active: z.boolean().optional(),
});

const heldAssetType = (value: string | undefined): HeldAssetType | undefined =>
  value === 'stock' || value === 'etf' || value === 'fund' ? value : undefined;

const normalizePortfolio = (value: PortfolioValuationResponse): Portfolio => ({
  totalMarketValue: value.totalMarketValue,
  totalCost: value.totalCost,
  totalPnl: value.totalPnl,
  cashValue: value.cashValue,
  mode: value.mode,
  partial: value.partial,
  valuedAt: value.valuedAt,
  positions: value.positions.map((position) => {
    const assetType = heldAssetType(position.asset?.assetType);
    return {
      id: position.id,
      accountId: position.accountId,
      symbol: position.symbol,
      quantity: position.quantity,
      costPrice: position.costPrice,
      marketValue: position.marketValue,
      pnl: position.pnl,
      stale: position.stale,
      asset: {
        name: position.asset?.name ?? position.symbol,
        ...(assetType ? { assetType } : {}),
      },
    };
  }),
});

export const fetchPortfolioValuation = async (mode: PortfolioMode) =>
  normalizePortfolio(await getDesktopApiClient().portfolio.getValuation({ mode, t: Date.now() }));

export const fetchAccounts = async (): Promise<Account[]> => {
  const raw = await getDesktopApiClient().request<unknown>('/accounts', { cache: 'no-store' });
  return omitUndefinedDeep(z.array(accountSchema).parse(raw));
};
