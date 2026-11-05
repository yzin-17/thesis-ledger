import { useQuery } from '@tanstack/react-query';
import type { ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { fetchAccounts, fetchPortfolioValuation } from '../portfolio/portfolio.api.js';
import { accountDisplayLabel } from '../portfolio/portfolio.types.js';
import { fetchStrategies } from '../strategy/strategy.api.js';
import type { DesktopRequestClient } from '../shared/request.js';
import { useResearchIdentity } from './research.queries.js';

const cancellableRead = (signal: AbortSignal): DesktopRequestClient => ({
  request: (path, init) => getDesktopApiClient().request(path, { ...init, signal }),
});
/** 选择器也按身份/模式隔离；过期请求由 TanStack Query 的信号中止。 */
export function useResearchDraftObjects(
  scope: ResearchSubmissionV2['scope']['scope'],
  mode: ResearchSubmissionV2['mode'],
  accountId: string | null,
  enabled: boolean,
) {
  const owner = useResearchIdentity();
  const accounts = useQuery({
    placeholderData: () => undefined,
    queryKey: ['desktop', 'research-selectors', owner, mode, 'accounts'],
    queryFn: ({ signal }) => fetchAccounts(false, undefined, signal),
    enabled: enabled && (scope === 'account' || scope === 'position'),
    staleTime: 30_000,
    retry: false,
  });
  const matching = (accounts.data ?? []).filter((account) => account.mode === mode);
  const selected = matching.find((account) => account.id === accountId);
  const positions = useQuery({
    placeholderData: () => undefined,
    queryKey: ['desktop', 'research-selectors', owner, mode, 'positions', selected?.id ?? ''],
    queryFn: ({ signal }) => fetchPortfolioValuation(mode, selected?.id, cancellableRead(signal)),
    enabled: enabled && scope === 'position' && Boolean(selected),
    staleTime: 15_000,
    retry: false,
  });
  const strategies = useQuery({
    placeholderData: () => undefined,
    queryKey: ['desktop', 'research-selectors', owner, mode, 'strategies'],
    queryFn: ({ signal }) => fetchStrategies(cancellableRead(signal)),
    enabled: enabled && scope === 'strategy',
    staleTime: 15_000,
    retry: false,
  });
  return {
    accounts,
    positions,
    strategies,
    effectiveAccountId: selected?.id ?? null,
    accountOptions: matching.map((account) => ({
      value: account.id,
      label: accountDisplayLabel(account),
    })),
    positionOptions: (positions.data?.positions ?? []).map((position) => ({
      value: position.symbol,
      label: `${position.symbol} · ${position.asset.name}`,
    })),
    strategyOptions: (strategies.data ?? []).flatMap((strategy) =>
      strategy.versions.map((version) => ({
        value: version.id,
        label: `${strategy.name} · v${version.version}`,
      })),
    ),
  };
}
