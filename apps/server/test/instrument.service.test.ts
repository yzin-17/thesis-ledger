import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InstrumentService, instrumentMatchRank } from '../src/market/instrument.service.js';

type CatalogItem = {
  canonicalCode: string;
  instrumentType: string;
  market: string;
  displayName: string;
};

type InstrumentUpsertArgs = {
  where: {
    canonicalCode_instrumentType_market: Pick<
      CatalogItem,
      'canonicalCode' | 'instrumentType' | 'market'
    >;
  };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

type InstrumentUpdateManyArgs = {
  where: { generation: { lt: number } };
  data: Record<string, unknown>;
};

type InstrumentFindManyArgs = {
  where?: { active?: boolean };
  select?: Record<string, boolean>;
};

type CatalogStateUpsertArgs = {
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

type CatalogStateUpdateArgs = {
  data: Record<string, unknown>;
};

type CatalogStateUpdateManyArgs = {
  where: { consumer: string; generation: number; checksum: string };
  data: Record<string, unknown>;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const checksumFor = (items: CatalogItem[]) =>
  createHash('sha256')
    .update(
      stableJson(
        [...items].sort((left, right) =>
          `${left.canonicalCode}.${left.market}.${left.instrumentType}`.localeCompare(
            `${right.canonicalCode}.${right.market}.${right.instrumentType}`,
          ),
        ),
      ),
    )
    .digest('hex');

const snapshotFor = (generation: number, items: CatalogItem[]) => ({
  contractVersion: 1 as const,
  generation,
  checksum: checksumFor(items),
  cursor: `generation:${generation}`,
  complete: true,
  items,
});

const keyFor = (item: CatalogItem) => `${item.canonicalCode}:${item.instrumentType}:${item.market}`;

const rankInput = (record: Record<string, unknown>): Parameters<typeof instrumentMatchRank>[0] => ({
  canonicalCode: String(record.canonicalCode ?? ''),
  displayName: String(record.displayName ?? ''),
  pinyin: typeof record.pinyin === 'string' ? record.pinyin : null,
  pinyinInitials: typeof record.pinyinInitials === 'string' ? record.pinyinInitials : null,
  searchAliases: record.searchAliases,
});

class CatalogPrismaFixture {
  readonly records = new Map<string, Record<string, unknown>>();
  readonly transactionOptions: Array<
    { isolationLevel?: unknown; maxWait?: number; timeout?: number } | undefined
  > = [];
  state: Record<string, unknown> | null = null;
  readonly instrument = {
    upsert: vi.fn(async ({ where, update, create }: InstrumentUpsertArgs) => {
      const key = keyFor({
        canonicalCode: where.canonicalCode_instrumentType_market.canonicalCode,
        instrumentType: where.canonicalCode_instrumentType_market.instrumentType,
        market: where.canonicalCode_instrumentType_market.market,
        displayName: '',
      });
      const existing = this.records.get(key);
      const next = {
        id: existing?.id ?? key,
        createdAt: existing?.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        ...(existing ?? {}),
        ...(existing ? update : create),
      };
      this.records.set(key, next);
      return next;
    }),
    updateMany: vi.fn(async ({ where, data }: InstrumentUpdateManyArgs) => {
      for (const record of this.records.values()) {
        if (Number(record.generation) < Number(where.generation.lt)) Object.assign(record, data);
      }
      return { count: this.records.size };
    }),
    findMany: vi.fn(async ({ where, select }: InstrumentFindManyArgs) =>
      [...this.records.values()]
        .filter((record) => where?.active === undefined || record.active === where.active)
        .map((record) =>
          select
            ? Object.fromEntries(Object.keys(select).map((field) => [field, record[field]]))
            : record,
        ),
    ),
    findFirst: vi.fn(async () => {
      const records = [...this.records.values()].sort(
        (left, right) => Number(right.generation) - Number(left.generation),
      );
      return records[0] ? { generation: records[0].generation } : null;
    }),
    count: vi.fn(
      async ({ where }: { where: { active: boolean } }) =>
        [...this.records.values()].filter((record) => record.active === where.active).length,
    ),
  };
  readonly catalogSyncState = {
    findUnique: vi.fn(async () => this.state),
    upsert: vi.fn(async ({ update, create }: CatalogStateUpsertArgs) => {
      this.state = { ...(this.state ?? create), ...update };
      return this.state;
    }),
    update: vi.fn(async ({ data }: CatalogStateUpdateArgs) => {
      this.state = { ...(this.state ?? {}), ...data };
      return this.state;
    }),
    updateMany: vi.fn(async ({ where, data }: CatalogStateUpdateManyArgs) => {
      if (
        this.state?.consumer !== where.consumer ||
        this.state.generation !== where.generation ||
        this.state.checksum !== where.checksum
      )
        return { count: 0 };
      this.state = { ...this.state, ...data };
      return { count: 1 };
    }),
  };

  async $transaction<T>(
    callback: (transaction: this) => Promise<T>,
    options?: { isolationLevel?: unknown; maxWait?: number; timeout?: number },
  ): Promise<T> {
    this.transactionOptions.push(options);
    return callback(this);
  }
}

const item = (displayName = '贵州茅台'): CatalogItem => ({
  canonicalCode: '600519',
  instrumentType: 'STOCK',
  market: 'SH',
  displayName,
});

describe('InstrumentService catalog fields and generation', () => {
  it('full snapshot generates pinyin, initials and searchable aliases', async () => {
    const prisma = new CatalogPrismaFixture();
    const service = new InstrumentService(prisma as never);

    await service.syncCatalog(snapshotFor(1, [item()]));

    expect(prisma.transactionOptions[0]?.isolationLevel).toBe('Serializable');
    expect(prisma.transactionOptions[0]).toMatchObject({ maxWait: 10_000, timeout: 60_000 });
    const saved = prisma.records.get(keyFor(item()))!;
    expect(saved.pinyin).toBe('guizhoumaotai');
    expect(saved.pinyinInitials).toBe('gzmt');
    expect(saved.searchAliases).toEqual(
      expect.arrayContaining(['贵州茅台', 'guizhoumaotai', 'gzmt', '600519.SH']),
    );
    expect(instrumentMatchRank(rankInput(saved), 'gzmt')).toBe(3);
    expect(instrumentMatchRank(rankInput(saved), '600519.SH')).toBe(4);
  });

  it('delta refreshes generated search fields when the display name changes', async () => {
    const prisma = new CatalogPrismaFixture();
    const service = new InstrumentService(prisma as never);
    await service.syncCatalog(snapshotFor(1, [item()]));
    const updatedItem = item('贵州茅台酒');

    await service.applyCatalogDelta({
      ...snapshotFor(2, [updatedItem]),
      fromCursor: 'generation:1',
      deleted: [],
      requiresFullSnapshot: false,
    });

    expect(prisma.transactionOptions.map((options) => options?.isolationLevel)).toEqual([
      'Serializable',
      'Serializable',
    ]);
    const saved = prisma.records.get(keyFor(item()))!;
    expect(saved.pinyin).toBe('guizhoumaotai jiu'.replace(/\s+/g, ''));
    expect(saved.pinyinInitials).toBe('gzmtj');
    expect(instrumentMatchRank(rankInput(saved), 'gzmtj')).toBe(3);
  });

  it('rejects an older snapshot, keeps same generation idempotent, and detects conflict', async () => {
    const prisma = new CatalogPrismaFixture();
    const service = new InstrumentService(prisma as never);
    const current = snapshotFor(2, [item()]);
    await service.syncCatalog(current);

    await expect(service.syncCatalog(snapshotFor(1, [item('旧名称')]))).rejects.toThrow(
      'generation 不得倒退',
    );
    await expect(service.syncCatalog(current)).resolves.toMatchObject({ idempotent: true });
    await expect(service.syncCatalog(snapshotFor(2, [item('冲突名称')]))).rejects.toThrow(
      'checksum 冲突',
    );
  });

  it('records a successful same-generation catalog check for the refresh window', async () => {
    const prisma = new CatalogPrismaFixture();
    const service = new InstrumentService(prisma as never);
    const snapshot = snapshotFor(2, [item()]);
    await service.syncCatalog(snapshot);

    await expect(service.markCatalogChecked(2, snapshot.checksum)).resolves.toMatchObject({
      generation: 2,
      checksum: snapshot.checksum,
      syncedAt: expect.any(Date),
      instrumentCount: 1,
    });
    await expect(service.markCatalogChecked(1, snapshot.checksum)).rejects.toThrow(
      'generation 或 checksum 已变化',
    );
  });

  it('requires a strictly newer delta generation and applies the next generation', async () => {
    const prisma = new CatalogPrismaFixture();
    const service = new InstrumentService(prisma as never);
    await service.syncCatalog(snapshotFor(2, [item()]));

    const staleDelta = {
      ...snapshotFor(2, [item()]),
      fromCursor: 'generation:2',
      deleted: [],
    };
    await expect(service.applyCatalogDelta(staleDelta)).rejects.toThrow('严格前进');

    const nextItem = item('贵州茅台新名称');
    await expect(
      service.applyCatalogDelta({
        ...snapshotFor(3, [nextItem]),
        fromCursor: 'generation:2',
        deleted: [],
      }),
    ).resolves.toMatchObject({ generation: 3, incremental: true });
    expect(prisma.state?.generation).toBe(3);
  });
});
