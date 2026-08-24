import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  Account,
  HeldAssetType,
  InstrumentLookup,
  Portfolio,
  PortfolioMode,
} from './portfolio.types.js';

const heldAssetType = (value: string | undefined): HeldAssetType | undefined =>
  value === 'stock' || value === 'etf' || value === 'fund' ? value : undefined;

const noStore = { cache: 'no-store' as const };

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
    const updatedAt = typeof position.updatedAt === 'string' ? position.updatedAt : undefined;
    return {
      id: position.id,
      accountId: position.accountId,
      symbol: position.symbol,
      quantity: position.quantity,
      costPrice: position.costPrice,
      marketValue: position.marketValue,
      pnl: position.pnl,
      stale: position.stale,
      ...(updatedAt === undefined ? {} : { updatedAt }),
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

export const fetchPortfolioValuation = async (
  mode: PortfolioMode,
  accountId?: string,
  client?: DesktopRequestClient,
) => {
  const params = new URLSearchParams({
    mode,
    ...(accountId ? { accountId } : {}),
    t: String(Date.now()),
  });
  return normalizePortfolio(
    await requestDesktopJson<PortfolioValuationResponse>(
      `/portfolio/valuation?${params.toString()}`,
      noStore,
      client,
    ),
  );
};

export const fetchAccounts = async (
  includeInactive = false,
  client?: DesktopRequestClient,
): Promise<Account[]> => {
  const raw = await requestDesktopJson<unknown>(
    `/accounts${includeInactive ? '?includeInactive=true' : ''}`,
    { cache: 'no-store' },
    client,
  );
  if (!Array.isArray(raw)) throw new Error('账户响应契约不匹配');
  return raw.map(parseAccount);
};

export const fetchManagedAccounts = (client?: DesktopRequestClient) => fetchAccounts(true, client);

export const searchPortfolioInstruments = (
  query: string,
  client?: DesktopRequestClient,
  signal?: AbortSignal,
) =>
  requestDesktopJson<InstrumentLookup[]>(
    `/market-data/instruments/search?q=${encodeURIComponent(query)}`,
    { ...noStore, ...(signal ? { signal } : {}) },
    client,
  );

export const confirmPortfolioInstrument = (instrumentId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    `/market-data/instruments/${encodeURIComponent(instrumentId)}/confirm`,
    { ...noStore, method: 'POST' },
    client,
  );

export interface SaveAccountInput {
  name: string;
  institution?: string;
  type: Account['type'];
  mode: Account['mode'];
  currency: Account['currency'];
}

export const saveAccount = (
  input: SaveAccountInput,
  accountId?: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<Account>(
    accountId ? `/accounts/${encodeURIComponent(accountId)}` : '/accounts',
    {
      ...noStore,
      method: accountId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const toggleAccount = (accountId: string, active: boolean, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    active
      ? `/accounts/${encodeURIComponent(accountId)}`
      : `/accounts/${encodeURIComponent(accountId)}/reactivate`,
    { ...noStore, method: active ? 'DELETE' : 'POST' },
    client,
  );

export interface SavePositionInput {
  accountId: string;
  symbol: string;
  quantity: number;
  costPrice: number;
  source: 'manual';
  instrumentId?: string;
  assetName?: string;
  assetType?: HeldAssetType;
}

export const savePosition = (
  input: SavePositionInput,
  positionId?: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<unknown>(
    positionId ? `/portfolio/positions/${encodeURIComponent(positionId)}` : '/portfolio/positions',
    {
      ...noStore,
      method: positionId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const saveCashBalance = (accountId: string, amount: number, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    '/portfolio/cash',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, amount, source: 'manual' }),
    },
    client,
  );

export const clearPortfolioPositions = (accountId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    '/portfolio/positions/clear',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId }),
    },
    client,
  );

export const removePortfolioPosition = (positionId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<unknown>(
    `/portfolio/positions/${encodeURIComponent(positionId)}`,
    {
      ...noStore,
      method: 'DELETE',
    },
    client,
  );
