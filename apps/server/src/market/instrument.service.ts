import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { pinyin } from 'pinyin-pro';
import {
  catalogDeltaSchema,
  catalogSnapshotSchema,
  type CatalogItem,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

const CONFIRMABLE_TYPES = new Set(['STOCK', 'ETF', 'MUTUAL_FUND']);

const symbolFor = (item: Pick<CatalogItem, 'canonicalCode' | 'market'>) =>
  `${item.canonicalCode}.${item.market}`;

const assetTypeFor = (instrumentType: string) => {
  switch (instrumentType) {
    case 'ETF':
      return 'etf';
    case 'MUTUAL_FUND':
      return 'fund';
    default:
      return 'stock';
  }
};

const marketCurrencyFor = (market: string) => (market === 'HK' ? 'HKD' : 'CNY');

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

const stableChecksum = (items: CatalogItem[]) =>
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

const normalizedQuery = (value: string) => value.trim().toLocaleLowerCase('zh-CN');

const searchFieldsFor = (item: Pick<CatalogItem, 'canonicalCode' | 'market' | 'displayName'>) => {
  const fullPinyin = pinyin(item.displayName, { toneType: 'none' }).replace(/\s+/g, '');
  const pinyinSyllables = pinyin(item.displayName, {
    toneType: 'none',
    type: 'array',
  }).join(' ');
  const initials = pinyin(item.displayName, {
    toneType: 'none',
    type: 'array',
  })
    .map((syllable) => syllable.slice(0, 1))
    .join('');
  const searchAliases = [
    item.displayName,
    fullPinyin,
    pinyinSyllables,
    initials,
    item.canonicalCode,
    `${item.canonicalCode}.${item.market}`,
  ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  return {
    pinyin: fullPinyin,
    pinyinInitials: initials,
    searchAliases,
  };
};

export const instrumentMatchRank = (
  instrument: {
    canonicalCode: string;
    displayName: string;
    pinyin?: string | null;
    pinyinInitials?: string | null;
    searchAliases?: unknown;
  },
  query: string,
) => {
  const needle = normalizedQuery(query);
  const code = normalizedQuery(instrument.canonicalCode);
  const name = normalizedQuery(instrument.displayName);
  const pinyin = normalizedQuery(instrument.pinyin ?? '');
  const initials = normalizedQuery(instrument.pinyinInitials ?? '');
  const aliases = Array.isArray(instrument.searchAliases)
    ? instrument.searchAliases.map((value) => normalizedQuery(String(value)))
    : [];
  if (code === needle) return 0;
  if (code.startsWith(needle)) return 1;
  if (name === needle || name.startsWith(needle)) return 2;
  if (
    pinyin === needle ||
    pinyin.startsWith(needle) ||
    initials === needle ||
    initials.startsWith(needle)
  )
    return 3;
  if (
    code.includes(needle) ||
    name.includes(needle) ||
    pinyin.includes(needle) ||
    initials.includes(needle) ||
    aliases.some((alias) => alias.includes(needle))
  )
    return 4;
  return 99;
};

@Injectable()
export class InstrumentService {
  constructor(private readonly prisma: PrismaService) {}

  async syncCatalog(raw: unknown) {
    const snapshot = catalogSnapshotSchema.parse(raw);
    if (!snapshot.complete || stableChecksum(snapshot.items) !== snapshot.checksum) {
      throw new BadRequestException('目录快照不完整或 checksum 校验失败');
    }
    const result = await this.prisma.$transaction(
      async (transaction) => {
        const state = await transaction.catalogSyncState.findUnique({
          where: { consumer: 'thesis-ledger' },
        });
        if (state && snapshot.generation < state.generation) {
          throw new BadRequestException('目录快照 generation 不得倒退');
        }
        if (
          state &&
          snapshot.generation === state.generation &&
          snapshot.checksum !== state.checksum
        ) {
          throw new ConflictException('目录快照同 generation 但 checksum 冲突');
        }
        for (const item of snapshot.items) {
          const searchFields = searchFieldsFor(item);
          await transaction.instrument.upsert({
            where: {
              canonicalCode_instrumentType_market: {
                canonicalCode: item.canonicalCode,
                instrumentType: item.instrumentType,
                market: item.market,
              },
            },
            update: {
              displayName: item.displayName,
              ...searchFields,
              generation: snapshot.generation,
              active: true,
            },
            create: {
              instrumentType: item.instrumentType,
              market: item.market,
              canonicalCode: item.canonicalCode,
              displayName: item.displayName,
              ...searchFields,
              generation: snapshot.generation,
              active: true,
            },
          });
        }
        if (!state || snapshot.generation > state.generation) {
          await transaction.instrument.updateMany({
            where: { generation: { lt: snapshot.generation } },
            data: { active: false },
          });
          await transaction.catalogSyncState.upsert({
            where: { consumer: 'thesis-ledger' },
            update: {
              generation: snapshot.generation,
              checksum: snapshot.checksum,
              cursor: snapshot.cursor,
              syncedAt: new Date(),
            },
            create: {
              consumer: 'thesis-ledger',
              generation: snapshot.generation,
              checksum: snapshot.checksum,
              cursor: snapshot.cursor,
            },
          });
        }
        return { idempotent: Boolean(state && snapshot.generation === state.generation) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      generation: snapshot.generation,
      checksum: snapshot.checksum,
      count: snapshot.items.length,
      cursor: snapshot.cursor,
      idempotent: result.idempotent,
    };
  }

  async applyCatalogDelta(raw: unknown) {
    const delta = catalogDeltaSchema.parse(raw);
    if (!delta.complete || delta.requiresFullSnapshot) {
      throw new BadRequestException('目录增量不可用，需要完整快照');
    }
    await this.prisma.$transaction(
      async (transaction) => {
        const state = await transaction.catalogSyncState.findUnique({
          where: { consumer: 'thesis-ledger' },
        });
        if (!state || state.cursor !== delta.fromCursor) {
          throw new BadRequestException('目录游标与本地同步状态不一致');
        }
        if (delta.generation <= state.generation) {
          throw new BadRequestException('目录增量 generation 必须严格前进');
        }
        for (const item of delta.items) {
          const searchFields = searchFieldsFor(item);
          await transaction.instrument.upsert({
            where: {
              canonicalCode_instrumentType_market: {
                canonicalCode: item.canonicalCode,
                instrumentType: item.instrumentType,
                market: item.market,
              },
            },
            update: {
              displayName: item.displayName,
              ...searchFields,
              generation: delta.generation,
              active: true,
            },
            create: { ...item, ...searchFields, generation: delta.generation, active: true },
          });
        }
        for (const item of delta.deleted) {
          await transaction.instrument.updateMany({
            where: item,
            data: { generation: delta.generation, active: false },
          });
        }
        const active = await transaction.instrument.findMany({
          where: { active: true },
          select: {
            canonicalCode: true,
            instrumentType: true,
            market: true,
            displayName: true,
          },
        });
        if (stableChecksum(active) !== delta.checksum) {
          throw new BadRequestException('目录增量应用后的 checksum 校验失败');
        }
        await transaction.catalogSyncState.update({
          where: { consumer: 'thesis-ledger' },
          data: {
            generation: delta.generation,
            checksum: delta.checksum,
            cursor: delta.cursor,
            syncedAt: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      generation: delta.generation,
      checksum: delta.checksum,
      count: delta.items.length,
      deletedCount: delta.deleted.length,
      cursor: delta.cursor,
      incremental: true,
    };
  }

  async search(query: string, limit = 20) {
    const needle = query.trim();
    if (!needle) return [];
    const take = Math.min(Math.max(limit * 5, 20), 200);
    let instruments: Array<{
      id: string;
      instrumentType: string;
      market: string;
      canonicalCode: string;
      displayName: string;
      pinyin: string | null;
      pinyinInitials: string | null;
      searchAliases: unknown;
      generation: number;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
      matchScore?: number;
    }>;
    try {
      instruments = await this.prisma.$queryRaw<typeof instruments>(Prisma.sql`
        SELECT "id", "instrumentType", "market", "canonicalCode", "displayName",
               "pinyin", "pinyinInitials", "searchAliases", "generation", "active",
               "createdAt", "updatedAt",
               GREATEST(
                 similarity("canonicalCode", ${needle}),
                 similarity("displayName", ${needle}),
                 similarity(COALESCE("pinyin", ''), ${needle}),
                 similarity(COALESCE("pinyinInitials", ''), ${needle})
               ) AS "matchScore"
        FROM "Instrument"
        WHERE "active" = true
          AND (
            "canonicalCode" ILIKE ${`%${needle}%`}
            OR "displayName" ILIKE ${`%${needle}%`}
            OR "pinyin" ILIKE ${`%${needle}%`}
            OR "pinyinInitials" ILIKE ${`%${needle}%`}
            OR COALESCE("searchAliases"::text, '') ILIKE ${`%${needle}%`}
            OR similarity("canonicalCode", ${needle}) >= 0.2
            OR similarity("displayName", ${needle}) >= 0.2
            OR similarity(COALESCE("pinyin", ''), ${needle}) >= 0.2
            OR similarity(COALESCE("pinyinInitials", ''), ${needle}) >= 0.2
          )
        ORDER BY GREATEST(
          similarity("canonicalCode", ${needle}),
          similarity("displayName", ${needle}),
          similarity(COALESCE("pinyin", ''), ${needle}),
          similarity(COALESCE("pinyinInitials", ''), ${needle})
        ) DESC, "canonicalCode", "instrumentType", "market", "id"
        LIMIT ${take}
      `);
    } catch {
      // Keep a deterministic fallback for pre-migration/test stores without pg_trgm.
      instruments = await this.prisma.instrument.findMany({
        where: { active: true },
        take,
      });
    }
    return instruments
      .map((instrument) => {
        const directRank = instrumentMatchRank(instrument, needle);
        return {
          instrument,
          rank: directRank < 99 || (instrument.matchScore ?? 0) < 0.2 ? directRank : 4,
        };
      })
      .filter(({ rank }) => rank < 99)
      .sort(
        (left, right) =>
          left.rank - right.rank ||
          left.instrument.canonicalCode.localeCompare(right.instrument.canonicalCode) ||
          left.instrument.instrumentType.localeCompare(right.instrument.instrumentType) ||
          left.instrument.market.localeCompare(right.instrument.market) ||
          left.instrument.id.localeCompare(right.instrument.id),
      )
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map(({ instrument }) => ({
        id: instrument.id,
        instrumentType: instrument.instrumentType,
        market: instrument.market,
        canonicalCode: instrument.canonicalCode,
        displayName: instrument.displayName,
        pinyin: instrument.pinyin,
        pinyinInitials: instrument.pinyinInitials,
        searchAliases: instrument.searchAliases,
        generation: instrument.generation,
        active: instrument.active,
        createdAt: instrument.createdAt,
        updatedAt: instrument.updatedAt,
        symbol: `${instrument.canonicalCode}.${instrument.market}`,
        confirmable: CONFIRMABLE_TYPES.has(instrument.instrumentType),
        disabledReason: CONFIRMABLE_TYPES.has(instrument.instrumentType)
          ? null
          : 'unsupported_instrument_type',
      }));
  }

  async confirm(instrumentId: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new NotFoundException('目录标的不存在');
    if (!CONFIRMABLE_TYPES.has(instrument.instrumentType))
      throw new BadRequestException('该标的类型当前不可建立 Asset 关联');
    const symbol = symbolFor(instrument);
    const assetType = assetTypeFor(instrument.instrumentType);
    const asset = await this.prisma.$transaction(async (transaction) => {
      const existingAssociation = await transaction.instrumentAssetAssociation.findUnique({
        where: { symbol },
      });
      if (
        existingAssociation &&
        existingAssociation.instrumentId !== instrument.id &&
        existingAssociation.status === 'active' &&
        existingAssociation.source === 'user-confirmed'
      ) {
        throw new BadRequestException('该 Asset 已由用户确认关联到其他 Instrument');
      }
      const existing = await transaction.asset.findUnique({ where: { symbol } });
      const savedAsset = existing
        ? await transaction.asset.update({
            where: { symbol },
            data: {
              identityStatus: 'confirmed',
              identitySource: 'user-confirmed',
            },
          })
        : await transaction.asset.create({
            data: {
              symbol,
              name: instrument.displayName,
              market: instrument.market,
              assetType,
              currency: marketCurrencyFor(instrument.market),
              identityStatus: 'confirmed',
              identitySource: 'user-confirmed',
            },
          });
      await transaction.instrumentAssetAssociation.upsert({
        where: { symbol },
        update: {
          instrumentId: instrument.id,
          status: 'active',
          source: 'user-confirmed',
          confirmedAt: new Date(),
          lastSeenAt: new Date(),
        },
        create: {
          instrumentId: instrument.id,
          symbol,
          status: 'active',
          source: 'user-confirmed',
          confirmedAt: new Date(),
        },
      });
      return savedAsset;
    });
    return { instrument, asset, associationSource: 'user-confirmed' as const };
  }

  async requireConfirmed(instrumentId: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new NotFoundException('目录标的不存在');
    const association = await this.prisma.instrumentAssetAssociation.findUnique({
      where: { symbol: symbolFor(instrument) },
    });
    if (
      !association ||
      association.instrumentId !== instrument.id ||
      association.status !== 'active'
    )
      throw new BadRequestException('标的尚未确认，不能用于新增持仓');
    return {
      ...instrument,
      symbol: symbolFor(instrument),
      assetType: assetTypeFor(instrument.instrumentType),
    };
  }

  async latestGeneration() {
    const [latest, instrumentCount, syncState] = await Promise.all([
      this.prisma.instrument.findFirst({
        orderBy: { generation: 'desc' },
        select: { generation: true },
      }),
      this.prisma.instrument.count({ where: { active: true } }),
      this.prisma.catalogSyncState.findUnique({ where: { consumer: 'thesis-ledger' } }),
    ]);
    return {
      generation: syncState?.generation ?? latest?.generation ?? 0,
      checksum: syncState?.checksum ?? null,
      cursor: syncState?.cursor ?? null,
      syncedAt: syncState?.syncedAt ?? null,
      instrumentCount,
    };
  }

  associations(symbol?: string) {
    return this.prisma.instrumentAssetAssociation.findMany({
      ...(symbol ? { where: { symbol } } : {}),
      include: { instrument: true, asset: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
