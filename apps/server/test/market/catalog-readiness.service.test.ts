import { describe, expect, it, vi } from 'vitest';
import { DsaError, type CatalogJob } from '../../src/integration/dsa/dsa.client.js';
import {
  CatalogNotReadyException,
  CatalogReadinessService,
} from '../../src/market/catalog-readiness.service.js';
import { MarketDataController } from '../../src/market/market-data.controller.js';

type LocalStatus = {
  generation: number;
  checksum: string | null;
  cursor: string | null;
  syncedAt: Date | null;
  instrumentCount: number;
};

const emptyStatus = (): LocalStatus => ({
  generation: 0,
  checksum: null,
  cursor: null,
  syncedAt: null,
  instrumentCount: 0,
});

const readyStatus = (syncedAt = new Date()): LocalStatus => ({
  generation: 1,
  checksum: 'checksum-1',
  cursor: 'generation:1',
  syncedAt,
  instrumentCount: 1,
});

const succeededJob = (overrides: Partial<CatalogJob> = {}): CatalogJob => ({
  id: 'catalog-job-1',
  status: 'succeeded',
  generation: 1,
  checksum: 'checksum-1',
  ...overrides,
});

const snapshot = {
  contractVersion: 1,
  generation: 1,
  checksum: 'checksum-1',
  cursor: 'generation:1',
  complete: true,
  items: [
    {
      canonicalCode: '159516',
      instrumentType: 'ETF',
      market: 'SZ',
      displayName: '芯片ETF',
    },
  ],
};

const createHarness = (initialStatus = emptyStatus()) => {
  let status = initialStatus;
  const instruments = {
    latestGeneration: vi.fn(async () => status),
    syncCatalog: vi.fn(async () => {
      status = {
        generation: snapshot.generation,
        checksum: snapshot.checksum,
        cursor: snapshot.cursor,
        syncedAt: new Date(),
        instrumentCount: snapshot.items.length,
      };
      return {
        generation: snapshot.generation,
        checksum: snapshot.checksum,
        count: snapshot.items.length,
        cursor: snapshot.cursor,
        idempotent: false,
      };
    }),
    applyCatalogDelta: vi.fn(async () => {
      status = {
        ...status,
        generation: 2,
        checksum: 'checksum-2',
        cursor: 'generation:2',
        instrumentCount: 1,
      };
      return {
        generation: 2,
        checksum: 'checksum-2',
        count: 1,
        deletedCount: 0,
        cursor: 'generation:2',
        incremental: true,
      };
    }),
    markCatalogChecked: vi.fn(async () => {
      status = { ...status, syncedAt: new Date() };
      return status;
    }),
    search: vi.fn(async () => [{ id: 'instrument-1', canonicalCode: '159516' }]),
  };
  const dsa = {
    triggerCatalogJob: vi.fn(async () => succeededJob()),
    catalogJob: vi.fn(async () => succeededJob()),
    catalogSnapshot: vi.fn(async () => snapshot),
    catalogDelta: vi.fn(async () => ({ ...snapshot, fromCursor: 'generation:0' })),
    acknowledgeCatalog: vi.fn(async () => ({ acknowledged: true })),
  };
  return {
    instruments,
    dsa,
    getStatus: () => status,
    setStatus: (nextStatus: LocalStatus) => {
      status = nextStatus;
    },
  };
};

describe('CatalogReadinessService', () => {
  it('automatically projects an empty local catalog through the DSA job contract', async () => {
    const harness = createHarness();
    const service = new CatalogReadinessService(harness.instruments as never, harness.dsa as never);

    await expect(service.runNow()).resolves.toMatchObject({ ready: true });

    expect(harness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);
    expect(harness.dsa.catalogSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.instruments.syncCatalog).toHaveBeenCalledWith(snapshot);
    expect(harness.dsa.acknowledgeCatalog).toHaveBeenCalledWith(1, 'checksum-1');
    expect(harness.getStatus().instrumentCount).toBe(1);
  });

  it('lets the first instrument search obtain results after automatic initialization', async () => {
    const harness = createHarness();
    const readiness = new CatalogReadinessService(
      harness.instruments as never,
      harness.dsa as never,
    );
    const controller = new MarketDataController(
      {} as never,
      harness.instruments as never,
      harness.dsa as never,
      readiness,
    );

    await expect(controller.search('159516')).resolves.toEqual([
      { id: 'instrument-1', canonicalCode: '159516' },
    ]);
    expect(harness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight job and projection across concurrent readiness checks', async () => {
    const harness = createHarness();
    let resolveTrigger!: (job: CatalogJob) => void;
    harness.dsa.triggerCatalogJob = vi.fn(
      () => new Promise<CatalogJob>((resolve) => (resolveTrigger = resolve)),
    );
    const service = new CatalogReadinessService(harness.instruments as never, harness.dsa as never);

    const first = service.ensureReady(1_000);
    const second = service.ensureReady(1_000);
    await Promise.resolve();
    expect(harness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);

    resolveTrigger(succeededJob());
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(harness.instruments.syncCatalog).toHaveBeenCalledTimes(1);
  });

  it('waits for a pending DSA job before projecting its terminal result', async () => {
    const harness = createHarness();
    harness.dsa.triggerCatalogJob = vi.fn(async () => ({
      ...succeededJob(),
      status: 'pending' as const,
    }));
    harness.dsa.catalogJob = vi.fn(async () => succeededJob());
    const service = new CatalogReadinessService(harness.instruments as never, harness.dsa as never);

    await expect(service.runNow()).resolves.toMatchObject({ ready: true });
    expect(harness.dsa.catalogJob).toHaveBeenCalledWith('catalog-job-1');
    expect(harness.getStatus().instrumentCount).toBe(1);
  });

  it('keeps following the same DSA job after the search wait and old 30-second boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00.000Z'));
    try {
      const harness = createHarness();
      const leaseExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      let polls = 0;
      harness.dsa.triggerCatalogJob = vi.fn(async () => ({
        ...succeededJob(),
        status: 'pending' as const,
        leaseExpiresAt,
      }));
      harness.dsa.catalogJob = vi.fn(async () => {
        polls += 1;
        if (polls <= 30) {
          return {
            ...succeededJob(),
            status: 'running' as const,
            leaseExpiresAt,
          };
        }
        return succeededJob();
      });
      const service = new CatalogReadinessService(
        harness.instruments as never,
        harness.dsa as never,
      );

      const searchResult = expect(service.ensureReady(5_000)).rejects.toMatchObject({
        status: 503,
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await searchResult;
      expect(harness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(26_000);
      expect(polls).toBeGreaterThan(30);
      expect(harness.getStatus().instrumentCount).toBe(1);
      expect(harness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);
      expect(harness.dsa.acknowledgeCatalog).toHaveBeenCalledWith(1, 'checksum-1');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CatalogReadinessService refresh and diagnostics', () => {
  it('does not refresh a fresh catalog but refreshes it after 24 hours', async () => {
    const freshHarness = createHarness(readyStatus(new Date(Date.now() - 23 * 60 * 60_000)));
    const freshService = new CatalogReadinessService(
      freshHarness.instruments as never,
      freshHarness.dsa as never,
    );

    await expect(freshService.runNow()).resolves.toMatchObject({ skipped: true, ready: true });
    expect(freshHarness.dsa.triggerCatalogJob).not.toHaveBeenCalled();

    const staleHarness = createHarness(readyStatus(new Date(Date.now() - 24 * 60 * 60_000)));
    const staleService = new CatalogReadinessService(
      staleHarness.instruments as never,
      staleHarness.dsa as never,
    );

    await expect(staleService.runNow()).resolves.toMatchObject({ skipped: false, ready: true });
    expect(staleHarness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);
    expect(staleHarness.instruments.markCatalogChecked).toHaveBeenCalledWith(1, 'checksum-1');
    await expect(staleService.runNow()).resolves.toMatchObject({ skipped: true, ready: true });
    expect(staleHarness.dsa.triggerCatalogJob).toHaveBeenCalledTimes(1);
  });

  it('runs the lightweight readiness check from the real module-init hook', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const harness = createHarness();
      const service = new CatalogReadinessService(
        harness.instruments as never,
        harness.dsa as never,
      );
      const runNow = vi.spyOn(service, 'runNow');

      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);

      expect(runNow).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
    } finally {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });

  it('reports unavailable diagnostics while a background job is active', async () => {
    const harness = createHarness();
    harness.dsa.triggerCatalogJob = vi.fn(async () => ({
      ...succeededJob(),
      status: 'pending' as const,
      leaseExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }));
    harness.dsa.catalogJob = vi.fn(async () => succeededJob());
    const service = new CatalogReadinessService(harness.instruments as never, harness.dsa as never);
    const controller = new MarketDataController(
      {} as never,
      harness.instruments as never,
      harness.dsa as never,
      service,
    );

    const synchronization = service.runNow();
    await Promise.resolve();
    await Promise.resolve();
    await expect(controller.catalogStatus()).resolves.toMatchObject({
      readinessState: 'unavailable',
      refreshInProgress: true,
      activeJobId: 'catalog-job-1',
      lastAttemptAt: expect.any(String),
      lastError: null,
      retryAt: null,
    });

    await expect(synchronization).resolves.toMatchObject({ ready: true });
    await expect(service.status()).resolves.toMatchObject({
      readinessState: 'ready',
      refreshInProgress: false,
      activeJobId: null,
    });
  });

  it('returns a distinct retryable error when a search finds an empty, unavailable catalog', async () => {
    const harness = createHarness();
    harness.dsa.triggerCatalogJob = vi.fn(async () => {
      throw new DsaError('DSA 不可用', 'unavailable');
    });
    const readiness = new CatalogReadinessService(
      harness.instruments as never,
      harness.dsa as never,
    );
    const controller = new MarketDataController(
      {} as never,
      harness.instruments as never,
      harness.dsa as never,
      readiness,
    );

    await expect(controller.search('159516')).rejects.toBeInstanceOf(CatalogNotReadyException);
    await expect(controller.search('159516')).rejects.toMatchObject({ status: 503 });
    expect(new CatalogNotReadyException().getResponse()).toMatchObject({
      errorCode: 'catalog_not_ready',
      retryable: true,
    });
    expect(harness.instruments.search).not.toHaveBeenCalled();
  });

  it('keeps a stale complete catalog searchable when its background refresh fails', async () => {
    const harness = createHarness(readyStatus(new Date(Date.now() - 25 * 60 * 60_000)));
    harness.dsa.triggerCatalogJob = vi.fn(async () => {
      throw new DsaError('DSA 不可用', 'unavailable');
    });
    const readiness = new CatalogReadinessService(
      harness.instruments as never,
      harness.dsa as never,
    );
    const controller = new MarketDataController(
      {} as never,
      harness.instruments as never,
      harness.dsa as never,
      readiness,
    );

    await expect(readiness.runNow()).resolves.toMatchObject({ ready: true, skipped: false });
    await expect(controller.search('159516')).resolves.toEqual([
      { id: 'instrument-1', canonicalCode: '159516' },
    ]);
    await expect(readiness.status()).resolves.toMatchObject({
      readinessState: 'stale',
      refreshInProgress: false,
      lastError: 'DSA 不可用',
      retryAt: expect.any(String),
    });
  });

  it('does not initialize the catalog for an empty search query', async () => {
    const harness = createHarness();
    const readiness = new CatalogReadinessService(
      harness.instruments as never,
      harness.dsa as never,
    );
    const controller = new MarketDataController(
      {} as never,
      harness.instruments as never,
      harness.dsa as never,
      readiness,
    );

    await expect(controller.search('   ')).resolves.toEqual([]);
    expect(harness.dsa.triggerCatalogJob).not.toHaveBeenCalled();
  });

  it('acknowledges a successful no-op job without applying a same-generation delta', async () => {
    const harness = createHarness({
      generation: 1,
      checksum: 'checksum-1',
      cursor: 'generation:1',
      syncedAt: new Date(),
      instrumentCount: 1,
    });
    const service = new CatalogReadinessService(harness.instruments as never, harness.dsa as never);

    await expect(service.projectSucceededJob(succeededJob())).resolves.toMatchObject({
      idempotent: true,
      acknowledged: true,
    });
    expect(harness.dsa.catalogDelta).not.toHaveBeenCalled();
    expect(harness.instruments.syncCatalog).not.toHaveBeenCalled();
    expect(harness.dsa.acknowledgeCatalog).toHaveBeenCalledWith(1, 'checksum-1');
    expect(harness.instruments.markCatalogChecked).toHaveBeenCalledWith(1, 'checksum-1');
  });

  it('recognizes a projection committed by another Server after a serializable race', async () => {
    const harness = createHarness(readyStatus());
    const job = succeededJob({ generation: 2, checksum: 'checksum-2' });
    harness.instruments.applyCatalogDelta = vi.fn(async () => {
      harness.setStatus({
        generation: 2,
        checksum: 'checksum-2',
        cursor: 'generation:2',
        syncedAt: new Date(),
        instrumentCount: 1,
      });
      throw new Error('P2034: transaction write conflict');
    });
    harness.dsa.catalogDelta = vi.fn(async () => ({
      ...snapshot,
      generation: 2,
      checksum: 'checksum-2',
      cursor: 'generation:2',
      fromCursor: 'generation:1',
    }));
    const service = new CatalogReadinessService(harness.instruments as never, harness.dsa as never);

    await expect(service.projectSucceededJob(job)).resolves.toMatchObject({
      generation: 2,
      idempotent: true,
      acknowledged: true,
    });
    expect(harness.instruments.syncCatalog).not.toHaveBeenCalled();
    expect(harness.dsa.acknowledgeCatalog).toHaveBeenCalledWith(2, 'checksum-2');
  });
});
