import { ThesisLedgerContractError, type ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import type { mobileScopeKey } from '../navigation-state';

export function mobileValuationOptions(
  api: ThesisLedgerApiClient,
  scope: ReturnType<typeof mobileScopeKey>,
  accountId?: string | null,
  enabled = true,
) {
  return {
    queryKey: [...scope, 'valuation', accountId ?? 'all'],
    enabled,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const value = await api.portfolio.getValuation(
        { mode: scope[2], ...(accountId ? { accountId } : {}) },
        signal,
      );
      if (
        value.mode !== scope[2] ||
        (accountId &&
          (value.positions.some((position) => position.accountId !== accountId) ||
            value.cashByAccount.some((cash) => cash.accountId !== accountId)))
      ) {
        throw new ThesisLedgerContractError('/portfolio/valuation');
      }
      return value;
    },
  };
}
