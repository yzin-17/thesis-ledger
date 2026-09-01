import type { Prisma } from '@prisma/client';
import {
  investmentAccountRelationWhere,
  investmentAccountWhere,
} from '../portfolio/investment-account-scope.js';

type PortfolioMode = 'actual' | 'shadow';
type Snapshot = { payload: unknown };

const payload = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const scopePolicy = (snapshot: Snapshot) => {
  const value = payload(snapshot.payload).accountScopePolicy;
  return typeof value === 'string' ? value : 'legacy-all-accounts-v0';
};

export const performanceAccountWhere = (mode: PortfolioMode, accountId?: string) =>
  accountId ? { id: accountId, mode } : investmentAccountWhere(mode);

export const performanceRelationWhere = (mode: PortfolioMode, accountId?: string) =>
  accountId ? { accountId, account: { mode } } : investmentAccountRelationWhere(mode);

export const performanceSnapshotWhere = (
  accountId: string | undefined,
  useAccountSnapshots: boolean,
  mode: PortfolioMode,
): Prisma.PortfolioSnapshotWhereInput => {
  if (accountId) return { accountId, account: { mode } };
  if (useAccountSnapshots)
    return { accountId: { not: null }, account: investmentAccountWhere(mode) };
  return { accountId: null };
};

export const incompatibleAccountScopeSummary = <TSnapshot extends Snapshot>(
  snapshots: TSnapshot[],
  accountId: string | undefined,
  fx: unknown,
  fxFields: Record<string, unknown>,
) => {
  const policies = accountId ? new Set<string>() : new Set(snapshots.map(scopePolicy));
  if (policies.size <= 1) return null;
  return {
    accountId: null,
    snapshots,
    ttwror: null,
    xirr: null,
    xirrReason: '组合快照账户口径不一致，旧口径与当前投资范围不能混合计算收益',
    accountScopeCompatibility: 'incompatible' as const,
    fx,
    ...fxFields,
  };
};
