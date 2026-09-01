import type { Prisma } from '@prisma/client';

export const investmentAccountTypes = ['securities', 'fund'] as const;

export const investmentAccountWhere = (
  mode: 'actual' | 'shadow',
): Prisma.AccountWhereInput => ({
  mode,
  active: true,
  type: { in: [...investmentAccountTypes] },
});

export const investmentAccountRelationWhere = (mode: 'actual' | 'shadow') => ({
  account: investmentAccountWhere(mode),
});
