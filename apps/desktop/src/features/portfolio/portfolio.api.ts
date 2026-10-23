import type { PortfolioValuationResponse, ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type { Account, HeldAssetType, Portfolio, PortfolioMode } from './portfolio.types.js';

const heldAssetType = (value: string | undefined): HeldAssetType | undefined =>
  value === 'stock' || value === 'etf' || value === 'fund' ? value : undefined;

const currencyValue = (value: unknown): Account['currency'] | undefined =>
  value === 'CNY' || value === 'HKD' || value === 'USD' ? value : undefined;

const nullableNumberValue = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  return typeof value === 'number' ? value : undefined;
};

const noStore = { cache: 'no-store' as const };

type PortfolioValuationWithDailyChange = PortfolioValuationResponse & {
  dailyChange?: Portfolio['dailyChange'];
};

const normalizePortfolio = (value: PortfolioValuationWithDailyChange): Portfolio => ({
  totalMarketValue: value.totalMarketValue,
  totalCost: value.totalCost,
  totalPnl: value.totalPnl,
  unrealizedPnl: value.unrealizedPnl,
  unrealizedPnlRatio: value.unrealizedPnlRatio,
  realizedPnl: value.realizedPnl,
  realizedPnlRatio: value.realizedPnlRatio,
  cumulativePnl: value.cumulativePnl,
  cumulativePnlRatio: value.cumulativePnlRatio,
  cashValue: value.cashValue,
  ...(value.dailyChange ? { dailyChange: value.dailyChange } : {}),
  mode: value.mode,
  partial: value.partial,
  valuedAt: value.valuedAt,
  ...(value.baseCurrency ? { baseCurrency: value.baseCurrency } : {}),
  ...(value.cashByCurrency ? { cashByCurrency: value.cashByCurrency } : {}),
  ...(value.fx ? { fx: value.fx } : {}),
  ...(value.dataQuality ? { dataQuality: value.dataQuality } : {}),
  positions: value.positions.map((position) => {
    const assetType = heldAssetType(position.asset?.assetType);
    const updatedAt = typeof position.updatedAt === 'string' ? position.updatedAt : undefined;
    const currency = currencyValue(position.currency);
    const marketPrice = nullableNumberValue(position.marketPrice);
    const previousClose = nullableNumberValue(position.previousClose);
    const baseMarketValue = nullableNumberValue(position.baseMarketValue);
    const baseCostValue =
      typeof position.baseCostValue === 'number' ? position.baseCostValue : undefined;
    const basePnl = nullableNumberValue(position.basePnl);
    const pnlRatio = nullableNumberValue(position.pnlRatio);
    const dailyPnl = nullableNumberValue(position.dailyPnl);
    const dailyReturn = nullableNumberValue(position.dailyReturn);
    const baseDailyPnl = nullableNumberValue(position.baseDailyPnl);
    return {
      id: position.id,
      accountId: position.accountId,
      symbol: position.symbol,
      quantity: position.quantity,
      costPrice: position.costPrice,
      marketValue: position.marketValue,
      pnl: position.pnl,
      stale: position.stale,
      ...(typeof position.source === 'string' ? { source: position.source } : {}),
      ...(marketPrice === undefined ? {} : { marketPrice }),
      ...(previousClose === undefined ? {} : { previousClose }),
      ...(pnlRatio === undefined ? {} : { pnlRatio }),
      ...(dailyPnl === undefined ? {} : { dailyPnl }),
      ...(dailyReturn === undefined ? {} : { dailyReturn }),
      ...(baseDailyPnl === undefined ? {} : { baseDailyPnl }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
      ...(currency ? { currency } : {}),
      ...(baseMarketValue === undefined ? {} : { baseMarketValue }),
      ...(baseCostValue === undefined ? {} : { baseCostValue }),
      ...(basePnl === undefined ? {} : { basePnl }),
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
  client: Pick<ThesisLedgerApiClient, 'accounts'> = getDesktopApiClient(),
  signal?: AbortSignal,
): Promise<Account[]> => {
  const raw = await client.accounts.list(includeInactive ? { includeInactive: true } : {}, signal);
  return raw.map(parseAccount);
};

export const fetchManagedAccounts = (client?: Pick<ThesisLedgerApiClient, 'accounts'>) =>
  fetchAccounts(true, client);

export const searchPortfolioInstruments = (
  query: string,
  client: Pick<ThesisLedgerApiClient, 'market'> = getDesktopApiClient(),
  signal?: AbortSignal,
) => client.market.searchInstruments({ q: query }, signal);

export const confirmPortfolioInstrument = (
  instrumentId: string,
  client: Pick<ThesisLedgerApiClient, 'market'> = getDesktopApiClient(),
) => client.market.confirmInstrument(instrumentId);

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
  client: Pick<ThesisLedgerApiClient, 'accounts'> = getDesktopApiClient(),
) => client.accounts.save(input, accountId);

export const toggleAccount = (
  accountId: string,
  active: boolean,
  client: Pick<ThesisLedgerApiClient, 'accounts'> = getDesktopApiClient(),
) => client.accounts.setActive(accountId, !active);

export type PortfolioAccountClient = Pick<ThesisLedgerApiClient['accounts'], 'permanentDelete'>;

export const permanentlyDeleteAccount = (
  accountId: string,
  client: PortfolioAccountClient = getDesktopApiClient().accounts,
) => client.permanentDelete(accountId);

export interface SavePositionInput {
  accountId: string;
  symbol: string;
  quantity: string;
  costPrice: string;
  source: 'manual';
  instrumentId?: string;
  assetName?: string;
  assetType?: HeldAssetType;
  occurredAt?: string;
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

export const saveCashBalance = (
  accountId: string,
  amount: string,
  currency?: Account['currency'],
  capturedAt?: string,
  client: Pick<ThesisLedgerApiClient, 'cash'> = getDesktopApiClient(),
) =>
  client.cash.recordBalance({
    accountId,
    amount,
    source: 'manual',
    capturedAt: capturedAt ?? new Date().toISOString(),
    ...(currency ? { currency } : {}),
  });

export const clearPortfolioPositions = (
  accountId: string,
  client: Pick<ThesisLedgerApiClient, 'positionManagement'> = getDesktopApiClient(),
) => client.positionManagement.clear(accountId);

export const removePortfolioPosition = (
  positionId: string,
  client: Pick<ThesisLedgerApiClient, 'positionManagement'> = getDesktopApiClient(),
) => client.positionManagement.remove(positionId);
