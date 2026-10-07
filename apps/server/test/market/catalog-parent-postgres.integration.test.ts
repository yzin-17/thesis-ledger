import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { startIsolatedNavPostgres } from '../backtest/nav-postgres.integration-harness.js';
import { CatalogSyncService } from '../../src/market/instruments/catalog-sync.service.js';
import { stableCatalogChecksum } from '../../src/market/instruments/catalog-checksum.js';
import { MarketDerivedSeriesRepository } from '../../src/market/market-derived-series.repository.js';
import type { MarketDerivedSeriesInputV3 } from '../../src/market/market-derived-series-v3.js';

const item = {
  canonicalCode: '600519',
  instrumentType: 'STOCK',
  market: 'SH',
  displayName: '贵州茅台',
};
const snapshot = (generation: number, items = [item]) => ({
  contractVersion: 3,
  generation,
  checksum: stableCatalogChecksum(items),
  cursor: `generation:${generation}`,
  complete: true,
  items,
});

describe.skipIf(process.env.E04_CATALOG_POSTGRES !== '1')('Catalog 与派生隔离 PostgreSQL', () => {
  let isolated: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
  let catalog: CatalogSyncService;
  beforeAll(async () => {
    isolated = await startIsolatedNavPostgres();
    catalog = new CatalogSyncService(isolated.prisma);
  }, 120_000);
  afterAll(async () => {
    await isolated?.cleanup();
  }, 30_000);
  beforeEach(async () => {
    await isolated.prisma.catalogSyncState.deleteMany();
    await isolated.prisma.instrument.deleteMany();
  });

  it('完整目录与增量原子发布，坏 checksum 回滚全部条目及状态', async () => {
    await catalog.syncCatalog(snapshot(1));
    const next = { ...item, displayName: '新名称' };
    const delta = { ...snapshot(2, [next]), fromCursor: 'generation:1', deleted: [] };
    const before = await isolated.prisma.instrument.findMany();
    await expect(catalog.applyCatalogDelta({ ...delta, checksum: 'b'.repeat(64) })).rejects.toThrow(
      'checksum',
    );
    expect(await isolated.prisma.instrument.findMany()).toEqual(before);
    expect((await catalog.latestGeneration()).generation).toBe(1);
    await catalog.applyCatalogDelta(delta);
    expect((await catalog.latestGeneration()).generation).toBe(2);
    expect((await isolated.prisma.instrument.findFirstOrThrow()).displayName).toBe('新名称');
  });

  it('旧信封、重复条目及错配 cursor 不写入，当前同代幂等', async () => {
    const current = snapshot(2);
    await catalog.syncCatalog(current);
    const before = await isolated.prisma.catalogSyncState.findMany();
    for (const invalid of [
      { ...current, contractVersion: 2 },
      { ...current, cursor: 'generation:1' },
      snapshot(3, [item, item]),
    ])
      await expect(catalog.syncCatalog(invalid)).rejects.toThrow();
    expect(await isolated.prisma.catalogSyncState.findMany()).toEqual(before);
    expect((await catalog.syncCatalog(current)).idempotent).toBe(true);
  });

  it('并发发布收敛为同一完整内容，不产生部分投影', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => catalog.syncCatalog(snapshot(3))),
    );
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await isolated.prisma.instrument.count()).toBe(1);
    expect((await catalog.latestGeneration()).checksum).toBe(snapshot(3).checksum);
    expect((await catalog.syncCatalog(snapshot(3))).idempotent).toBe(true);
  });

  it('只有历史 Instrument 时不推导当前同步 generation', async () => {
    await catalog.syncCatalog(snapshot(7));
    await isolated.prisma.catalogSyncState.deleteMany();
    expect(await catalog.latestGeneration()).toMatchObject({
      generation: 0,
      checksum: null,
      cursor: null,
    });
  });

  it('持久化旧游标不可就绪或续期，不回填原状态', async () => {
    await catalog.syncCatalog(snapshot(7));
    await isolated.prisma.catalogSyncState.update({
      where: { consumer: 'thesis-ledger' },
      data: { cursor: 'generation:0' },
    });
    const before = await isolated.prisma.catalogSyncState.findMany();
    expect(await catalog.latestGeneration()).toMatchObject({
      generation: 0,
      checksum: null,
      cursor: null,
    });
    await expect(catalog.markCatalogChecked(7, snapshot(7).checksum)).rejects.toThrow();
    expect(await isolated.prisma.catalogSyncState.findMany()).toEqual(before);
  });

  it('派生并发去重、JSON 回读与旧算法拒绝，原记录不回填', async () => {
    const timestamp = '2026-01-01T07:00:00Z',
      availableAt = '2026-10-01T00:00:00Z';
    const input: MarketDerivedSeriesInputV3 = {
      identity: { symbol: '600519.SH', assetType: 'STOCK', timeframe: '1d', adjustment: 'none' },
      rawEvidenceRef: 'isolated-raw',
      dataAsOf: availableAt,
      bars: [
        {
          timestamp,
          availableAt,
          completionStatus: 'complete',
          open: 2,
          close: 2,
          low: 2,
          high: 2,
          volume: 100,
          amount: 200,
        },
      ],
      conversion: {
        kind: 'multiplicative-price-factor',
        adjustment: 'qfq',
        evidenceRef: 'isolated-factor',
        sourceRevision: 'isolated-current',
        basisRef: 'fixed',
        anchorFactor: 2,
        anchorAvailableAt: availableAt,
        volumeSemantics: 'unadjusted',
        amountSemantics: 'unadjusted',
        factors: [{ timestamp, value: 1, availableAt }],
      },
    };
    const repository = new MarketDerivedSeriesRepository(isolated.prisma);
    const refs = await Promise.all(Array.from({ length: 4 }, () => repository.record(input)));
    expect(new Set(refs.map((ref) => ref.inputFingerprint)).size).toBe(1);
    const ref = refs[0]!;
    expect((await repository.read(ref.inputFingerprint))?.bars[0]?.close).toBe(1);
    const row = await isolated.prisma.marketDerivedSeriesSnapshotV3.findUniqueOrThrow({
      where: { inputFingerprint: ref.inputFingerprint },
    });
    const legacy = {
      ...(row.snapshot as Prisma.JsonObject),
      algorithmRevision: 'raw-times-factor-over-fixed-anchor-binary64-v1',
    };
    await isolated.prisma.marketDerivedSeriesSnapshotV3.update({
      where: { inputFingerprint: ref.inputFingerprint },
      data: {
        algorithmRevision: String(legacy.algorithmRevision),
        snapshot: legacy as Prisma.InputJsonValue,
      },
    });
    await expect(repository.read(ref.inputFingerprint)).rejects.toThrow();
    await expect(repository.record(input)).rejects.toThrow('拒绝覆盖');
    expect(
      (
        await isolated.prisma.marketDerivedSeriesSnapshotV3.findUniqueOrThrow({
          where: { inputFingerprint: ref.inputFingerprint },
        })
      ).snapshot,
    ).toEqual(legacy);
  });
});
