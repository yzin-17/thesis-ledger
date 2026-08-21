import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { Account, HeldAssetType, Portfolio, PortfolioMode } from './portfolio.types.js';

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

const parseAccount = (value: unknown): Account => {
  if (!value || typeof value !== 'object') throw new Error('账户响应契约不匹配');
  const account = value as Record<string, unknown>;
  if (
    typeof account.id !== 'string' ||
    typeof account.name !== 'string' ||
    !['securities', 'fund', 'cash'].includes(String(account.type)) ||
    !['actual', 'shadow'].includes(String(account.mode)) ||
    !['CNY', 'HKD', 'USD'].includes(String(account.currency))
  ) {
    throw new Error('账户响应契约不匹配');
  }
  return {
    id: account.id,
    name: account.name,
    type: account.type as Account['type'],
    mode: account.mode as Account['mode'],
    currency: account.currency as Account['currency'],
    ...(typeof account.institution === 'string' || account.institution === null
      ? { institution: account.institution }
      : {}),
    ...(typeof account.active === 'boolean' ? { active: account.active } : {}),
  };
};

export const fetchPortfolioValuation = async (mode: PortfolioMode) =>
  normalizePortfolio(await getDesktopApiClient().portfolio.getValuation({ mode, t: Date.now() }));

export const fetchAccounts = async (): Promise<Account[]> => {
  const raw = await getDesktopApiClient().request<unknown>('/accounts', { cache: 'no-store' });
  if (!Array.isArray(raw)) throw new Error('账户响应契约不匹配');
  return raw.map(parseAccount);
};
