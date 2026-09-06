import { describe, expect, it, vi } from 'vitest';
import { MarketControlService } from '../src/market/market-control.service.js';
import { DsaError } from '../src/integration/dsa/dsa.client.js';

type Routes = Record<string, Record<string, string[]>>;

type PolicyState = {
  consumer: string;
  revision: number;
  enabled: boolean;
  routes: Routes;
  syncState: string;
  history: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

const historyCreateFrom = (data: Record<string, unknown>) => {
  if (!data.history || typeof data.history !== 'object' || !('create' in data.history)) {
    return undefined;
  }
  return (data.history as { create: Record<string, unknown> }).create;
};

const makeTransaction = (state: PolicyState) => {
  const record = () => ({ ...state, history: [...state.history] });
  return {
    $queryRaw: vi.fn(async () => []),
    desiredProviderPolicy: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const previousHistory = state.history;
        const historyCreate = historyCreateFrom(data);
        Object.assign(state, data);
        state.history = historyCreate ? [...previousHistory, historyCreate] : previousHistory;
        return record();
      }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => record()),
    },
    desiredProviderPolicyRevision: {
      update: vi.fn(async () => ({})),
    },
  };
};

describe('MarketControlService', () => {
  it('accepts a monotonic revision jump and pushes the latest policy', async () => {
    const routes: Routes = { REALTIME_QUOTE: { STOCK: ['akshare'] } };
    const state: PolicyState = {
      consumer: 'thesis-ledger',
      revision: 1,
      enabled: true,
      routes,
      syncState: 'applied',
      history: [],
    };
    const record = () => ({ ...state, history: [...state.history] });
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => record()),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const previousHistory = state.history;
          const historyCreate = historyCreateFrom(data);
          Object.assign(state, data);
          state.history = historyCreate ? [...previousHistory, historyCreate] : previousHistory;
          return record();
        }),
        updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(state, data);
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => record()),
      },
      desiredProviderPolicyRevision: {
        update: vi.fn(async () => ({})),
      },
    };
    const prisma = {
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => record()),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const dsa = {
      applyControlPolicy: vi.fn(async () => ({ effective: { sourceDesiredRevision: 3 } })),
    };

    const result = await new MarketControlService(prisma as never, dsa as never).applyPolicy({
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
    const prisma = {
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => current),
      },
      desiredProviderPolicyRevision: {
        findUnique: vi.fn(async () => null),
      },
    };

    await expect(
      new MarketControlService(prisma as never, {} as never).rollback(2),
    ).rejects.toMatchObject({
      status: 404,
      message: '找不到 revision 2',
    });
  });

  it('revision 落后于 DSA 时自动对基：以远端 revision + 1 重推一次', async () => {
    const routes: Routes = { REALTIME_QUOTE: { STOCK: ['akshare'] } };
    const state: PolicyState = {
      consumer: 'thesis-ledger',
      revision: 3,
      enabled: true,
      routes,
      syncState: 'applied',
      history: [],
    };
    const transaction = makeTransaction(state);
    const prisma = {
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => ({ ...state, history: [...state.history] })),
        update: transaction.desiredProviderPolicy.update,
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const staleError = new DsaError('Policy revision 4 早于当前 revision 11', 'stale-revision');
    const dsa = {
      applyControlPolicy: vi
        .fn()
        .mockRejectedValueOnce(staleError)
        .mockResolvedValueOnce({ effective: { sourceDesiredRevision: 12 } }),
      effectiveControlPolicy: vi.fn(async () => ({
        projection: { desired: { revision: 11 } },
      })),
    };

    const result = await new MarketControlService(prisma as never, dsa as never).applyPolicy({
      revision: 4,
      enabled: true,
      routes,
    });

    expect(dsa.effectiveControlPolicy).toHaveBeenCalledTimes(1);
    expect(dsa.applyControlPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: 12, routes }),
    );
    expect(result.revision).toBe(12);
    expect(result.syncState).toBe('applied');
  });

  it('远端 revision 不高于本地时不触发对基，保留失败状态', async () => {
    const routes: Routes = { REALTIME_QUOTE: { STOCK: ['akshare'] } };
    const state: PolicyState = {
      consumer: 'thesis-ledger',
      revision: 3,
      enabled: true,
      routes,
      syncState: 'pending',
      history: [],
    };
    const transaction = makeTransaction(state);
    const prisma = {
      desiredProviderPolicy: {
        findUnique: vi.fn(async () => ({ ...state, history: [...state.history] })),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const staleError = new DsaError('Policy revision 3 早于当前 revision 2', 'stale-revision');
    const dsa = {
      applyControlPolicy: vi.fn().mockRejectedValue(staleError),
      effectiveControlPolicy: vi.fn(async () => ({
        projection: { desired: { revision: 2 } },
      })),
    };

    const result = await new MarketControlService(prisma as never, dsa as never).retryLatest();

    expect(dsa.applyControlPolicy).toHaveBeenCalledTimes(1);
    expect(dsa.effectiveControlPolicy).toHaveBeenCalledTimes(1);
    expect(result.syncState).toBe('rejected');
    expect(result.revision).toBe(3);
  });
});
