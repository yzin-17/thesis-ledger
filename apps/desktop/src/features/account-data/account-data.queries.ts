import { useQuery } from '@tanstack/react-query';

import type { PortfolioMode } from '../portfolio/portfolio.types.js';
import {
  fetchAccountLedgerAudit,
  fetchAccountLedgerEvents,
  fetchReconciliationCandidates,
} from './account-data.api.js';

export type AccountDataEventFilter = 'executions' | 'other' | 'all';

export const accountDataKeys = {
  root: ['desktop', 'account-data'] as const,
  events: (accountId: string, mode: PortfolioMode | 'unknown', filter: AccountDataEventFilter) =>
    [...accountDataKeys.root, 'events', accountId || 'none', mode, filter] as const,
  audit: (accountId: string, mode: PortfolioMode | 'unknown') =>
    [...accountDataKeys.root, 'audit', accountId || 'none', mode] as const,
  reconciliation: (accountId: string, mode: PortfolioMode | 'unknown') =>
    [...accountDataKeys.root, 'reconciliation', accountId || 'none', mode] as const,
};

export const useAccountLedgerEventsQuery = (
  accountId: string,
  mode: PortfolioMode | undefined,
  filter: AccountDataEventFilter,
) =>
  useQuery({
    queryKey: accountDataKeys.events(accountId, mode ?? 'unknown', filter),
    queryFn: () => fetchAccountLedgerEvents(accountId),
    enabled: Boolean(accountId),
    retry: false,
  });

export const useAccountLedgerAuditQuery = (
  accountId: string,
  mode: PortfolioMode | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: accountDataKeys.audit(accountId, mode ?? 'unknown'),
    queryFn: () => fetchAccountLedgerAudit(accountId),
    enabled: enabled && Boolean(accountId),
    retry: false,
  });

export const useReconciliationCandidatesQuery = (
  accountId: string,
  mode: PortfolioMode | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: accountDataKeys.reconciliation(accountId, mode ?? 'unknown'),
    queryFn: () => fetchReconciliationCandidates(accountId),
    enabled: enabled && Boolean(accountId),
    retry: false,
  });
