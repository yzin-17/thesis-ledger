import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '../portfolio/portfolio.api.js';
import { accountValuationQueryOptions, portfolioKeys } from '../portfolio/portfolio.queries.js';
import { accountDisplayLabel, type PortfolioMode } from '../portfolio/portfolio.types.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import type { AiResearchContext, AiResearchScope } from './ai.types.js';

export function researchContextForScope({
  scope,
  accountId,
  symbol,
  strategyVersionId,
  mode,
}: {
  scope: AiResearchScope;
  accountId: string | null;
  symbol: string | null;
  strategyVersionId: string | null;
  mode: PortfolioMode;
}): AiResearchContext {
  if (scope === 'strategy') return { scope, strategyVersionId: strategyVersionId as string };
  if (scope === 'portfolio') return { scope, mode };
  if (scope === 'account') return { scope, mode, accountId: accountId as string };
  return { scope, mode, accountId: accountId as string, symbol: symbol as string };
}

/** 研究草稿的账户读取范围；不创建任务，也不改变历史 context。 */
export function useResearchAccountScope({
  open,
  scope,
  accountId,
  retryContext,
}: {
  open: boolean;
  scope: AiResearchScope;
  accountId: string | null;
  retryContext?: AiResearchContext;
}) {
  const mode = useOptionalPortfolioMode()?.mode ?? 'actual';
  const accountsQuery = useQuery({
    queryKey: portfolioKeys.accounts(),
    queryFn: () => fetchAccounts(),
    enabled: open && (scope === 'account' || scope === 'position'),
    staleTime: 30_000,
  });
  const allAccounts = accountsQuery.data ?? [];
  const accounts = allAccounts.filter((account) => account.mode === mode);
  const selected = accounts.find((account) => account.id === accountId);
  const effectiveAccountId = selected?.id ?? null;
  const positionsQuery = useQuery({
    ...accountValuationQueryOptions(
      effectiveAccountId ?? '',
      mode,
      open && scope === 'position' && Boolean(selected),
    ),
    staleTime: 15_000,
  });
  let retryMode = retryContext?.mode;
  if (!retryMode && retryContext?.accountId)
    retryMode = allAccounts.find((account) => account.id === retryContext.accountId)?.mode;
  if (!retryMode && retryContext?.scope === 'portfolio') retryMode = 'actual';
  const retryModeMismatch =
    retryContext?.scope !== 'strategy' && Boolean(retryMode && retryMode !== mode);
  return {
    mode,
    accountsQuery,
    positionsQuery,
    effectiveAccountId,
    retryModeMismatch,
    positions: positionsQuery.data?.positions ?? [],
    accountOptions: accounts.map((account) => ({
      value: account.id,
      label: accountDisplayLabel(account),
    })),
  };
}
