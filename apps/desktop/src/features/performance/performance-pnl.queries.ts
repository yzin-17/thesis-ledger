import { useQuery } from '@tanstack/react-query';
import type { Currency, PerformancePnlRange } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { PortfolioMode } from '../portfolio/portfolio.types.js';

export const performancePnlKeys = {
  root: ['desktop', 'performance', 'pnl-series'] as const,
  scope: (mode: PortfolioMode, accountId: string) =>
    [...performancePnlKeys.root, mode, accountId] as const,
};

export const usePerformancePnlQuery = (
  mode: PortfolioMode,
  accountId: string,
  baseCurrency: Currency,
  range: PerformancePnlRange,
) =>
  useQuery({
    queryKey: [...performancePnlKeys.scope(mode, accountId), baseCurrency, range],
    queryFn: ({ signal }) =>
      getDesktopApiClient().performance.getPnlSeries(
        {
          mode,
          ...(accountId ? { accountId } : {}),
          baseCurrency,
          range,
        },
        signal,
      ),
    staleTime: 15_000,
    retry: false,
  });
