import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { TradeListQueryV2 } from '@thesis-ledger/api-client';
import { fetchPortfolioTrade, fetchPortfolioTrades } from './portfolio-trade.api.js';
import type { PortfolioMode } from './portfolio.types.js';

export type PortfolioTradeLifecycle = 'ALL' | 'ACTIVE' | 'ENDED';

export const portfolioTradeKeys = {
  root: ['desktop', 'portfolio-trades'] as const,
  list: (
    mode: PortfolioMode,
    accountId: string,
    symbol: string,
    lifecycle: PortfolioTradeLifecycle,
  ) => [...portfolioTradeKeys.root, 'list', mode, accountId || 'all', symbol, lifecycle] as const,
  detail: (mode: PortfolioMode, accountId: string, tradeId: string) =>
    [...portfolioTradeKeys.root, 'detail', mode, accountId, tradeId] as const,
};

export const usePortfolioTradesQuery = ({
  mode,
  accountId,
  symbol,
  lifecycle,
  enabled = true,
}: {
  mode: PortfolioMode;
  accountId?: string;
  symbol?: string;
  lifecycle?: PortfolioTradeLifecycle;
  enabled?: boolean;
}) => {
  const normalizedSymbol = symbol?.trim() ?? '';
  const normalizedLifecycle = lifecycle ?? 'ALL';
  return useInfiniteQuery({
    queryKey: portfolioTradeKeys.list(mode, accountId ?? '', normalizedSymbol, normalizedLifecycle),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params: Partial<TradeListQueryV2> = {
        mode,
        ...(accountId ? { accountId } : {}),
        ...(normalizedSymbol ? { symbol: normalizedSymbol } : {}),
        ...(normalizedLifecycle === 'ALL' ? {} : { lifecycle: normalizedLifecycle }),
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 50,
      };
      return fetchPortfolioTrades(params);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    retry: false,
    staleTime: 15_000,
  });
};

export const usePortfolioTradeQuery = (
  accountId: string,
  tradeId: string,
  mode: PortfolioMode,
  enabled: boolean,
) =>
  useQuery({
    queryKey: portfolioTradeKeys.detail(mode, accountId, tradeId),
    queryFn: () => fetchPortfolioTrade(accountId, tradeId, mode),
    enabled: enabled && Boolean(accountId && tradeId),
    retry: false,
    staleTime: 15_000,
  });
