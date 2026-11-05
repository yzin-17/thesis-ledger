import { vi } from 'vitest';

export const displayPrisma = (
  names: Record<string, string> = {
    '000001.OF': '华夏成长混合',
    '000001.SZ': '平安银行',
    'AAPL.US': '苹果公司',
  },
) => ({
  instrument: {
    findMany: vi.fn(async (_args: unknown) => {
      void _args;
      return Object.entries(names).map(([symbol, displayName]) => ({
        id: symbol,
        canonicalCode: symbol.split('.')[0],
        market: symbol.split('.')[1],
        instrumentType: symbol.endsWith('.OF') ? 'MUTUAL_FUND' : 'STOCK',
        displayName,
        active: true,
        generation: 4,
        updatedAt: new Date(0),
      }));
    }),
  },
  catalogSyncState: { findUnique: vi.fn(async () => ({ generation: 4 })) },
});
