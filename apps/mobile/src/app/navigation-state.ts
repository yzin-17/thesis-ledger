import type { AccountMode } from '@thesis-ledger/api-client';

export const mobileDestinations = {
  Portfolio: '组合',
  Accounts: '账户',
  Market: '市场',
  Research: '研究',
  Settings: '更多',
} as const;
export type MobileDestination = keyof typeof mobileDestinations;
export type MobileObjectTarget = {
  accountId: string;
  mode: AccountMode;
  tradeId?: string;
  closeSliceId?: string;
};
export const mobileScopeKey = (baseUrl: string, mode: AccountMode, accountId?: string | null) =>
  ['mobile-v2', baseUrl, mode, accountId ?? 'all'] as const;

export async function guardedTransition(options: {
  pending: boolean;
  dirty: boolean;
  confirm: () => Promise<boolean>;
  discard: () => void;
  change: () => void;
}) {
  if (options.pending) return false;
  if (options.dirty && !(await options.confirm())) return false;
  if (options.dirty) options.discard();
  options.change();
  return true;
}
