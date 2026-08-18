import { describe, expect, it, vi } from 'vitest';
import { MarketControlService } from '../src/market/market-control.service.js';

describe('MarketControlService', () => {
  it('accepts a monotonic revision jump and pushes the latest policy', async () => {
    const routes = { REALTIME_QUOTE: { STOCK: ['akshare'] } };
    let state: any = {
      consumer: 'thesis-ledger',
      revision: 1,
      enabled: true,
      routes,
      syncState: 'applied',
      history: [],
    };
    const record = () => ({ ...state, history: [...state.history] });
    const transaction: any = {
      $queryRaw: vi.fn(async () => []),
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => record()),
        update: vi.fn(async ({ data }: any) => {
          state = {
            ...state,
            ...data,
            history: [...state.history, data.history.create],
          };
          return record();
        }),
        updateMany: vi.fn(async ({ data }: any) => {
          state = { ...state, ...data };
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => record()),
      },
      desiredProviderPolicyRevision: {
        update: vi.fn(async () => ({})),
      },
    };
    const prisma: any = {
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => record()),
      },
      $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(transaction)),
    };
    const dsa: any = {
      applyControlPolicy: vi.fn(async () => ({ effective: { sourceDesiredRevision: 3 } })),
    };

    const result = await new MarketControlService(prisma, dsa).applyPolicy({
      revision: 3,
      enabled: true,
      routes,
    });

    expect(result.revision).toBe(3);
    expect(dsa.applyControlPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 3, routes }),
    );
  });

  it('returns a not-found error instead of an internal error for a missing rollback target', async () => {
    const current = {
      consumer: 'thesis-ledger',
      revision: 3,
      enabled: true,
      routes: { REALTIME_QUOTE: { STOCK: ['akshare'] } },
      syncState: 'applied',
      history: [],
    };
    const prisma: any = {
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => current),
      },
      desiredProviderPolicyRevision: {
        findUnique: vi.fn(async () => null),
      },
    };

    await expect(new MarketControlService(prisma, {} as any).rollback(2)).rejects.toMatchObject({
      status: 404,
      message: '找不到 revision 2',
    });
  });
});
