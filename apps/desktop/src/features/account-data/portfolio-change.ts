import type { QueryClient } from '@tanstack/react-query';

import { portfolioKeys } from '../portfolio/portfolio.queries.js';
import type { PortfolioChangeImpact } from '../portfolio/portfolio.types.js';
import { accountDataKeys } from './account-data.queries.js';

const uniqueAccountIds = (accountIds: readonly string[]) =>
  [...new Set(accountIds.filter((accountId) => Boolean(accountId)))];

export const invalidatePortfolioChange = async (
  client: Pick<QueryClient, 'invalidateQueries'>,
  impact: PortfolioChangeImpact,
) => {
  const accountIds = uniqueAccountIds(impact.accountIds);
  const invalidations: Array<Promise<unknown>> = [];

  if (impact.accounts) {
    invalidations.push(
      client.invalidateQueries({
        queryKey: portfolioKeys.accounts(),
        exact: true,
      }),
      client.invalidateQueries({
        queryKey: portfolioKeys.managedAccounts(),
        exact: true,
      }),
    );
  }

  for (const accountId of accountIds) {
    invalidations.push(
      client.invalidateQueries({
        queryKey: portfolioKeys.valuation(impact.mode, accountId),
        exact: true,
      }),
    );
    if (impact.events) {
      invalidations.push(
        client.invalidateQueries({
          queryKey: [...accountDataKeys.root, 'events', accountId, impact.mode],
        }),
      );
    }
    if (impact.audit) {
      invalidations.push(
        client.invalidateQueries({
          queryKey: accountDataKeys.audit(accountId, impact.mode),
        }),
      );
    }
    if (impact.reconciliation) {
      invalidations.push(
        client.invalidateQueries({
          queryKey: accountDataKeys.reconciliation(accountId, impact.mode),
        }),
      );
    }
  }

  if (impact.allSummary !== false) {
    invalidations.push(
      client.invalidateQueries({
        queryKey: portfolioKeys.valuation(impact.mode),
        exact: true,
      }),
    );
  }
  await Promise.all(invalidations);
};
