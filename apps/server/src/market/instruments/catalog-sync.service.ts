import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { catalogDeltaSchema, catalogSnapshotSchema } from '@thesis-ledger/schemas';
import { PrismaService } from '../../platform/prisma.service.js';
import { CATALOG_TRANSACTION_OPTIONS, stableCatalogChecksum } from './catalog-checksum.js';
import { searchFieldsForInstrument } from './instrument-search.js';

@Injectable()
export class CatalogSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async syncCatalog(raw: unknown) {
    const snapshot = catalogSnapshotSchema.parse(raw);
    if (!snapshot.complete || stableCatalogChecksum(snapshot.items) !== snapshot.checksum)
      throw new BadRequestException('目录快照不完整或 checksum 校验失败');
    const result = await this.prisma.$transaction(
      async (transaction) => {
        const state = await transaction.catalogSyncState.findUnique({
          where: { consumer: 'thesis-ledger' },
        });
        if (state && snapshot.generation < state.generation)
          throw new BadRequestException('目录快照 generation 不得倒退');
        if (
          state &&
          snapshot.generation === state.generation &&
          snapshot.checksum !== state.checksum
        )
          throw new ConflictException('目录快照同 generation 但 checksum 冲突');
        for (const item of snapshot.items) {
          const searchFields = searchFieldsForInstrument(item);
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
      CATALOG_TRANSACTION_OPTIONS,
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
    if (!delta.complete || delta.requiresFullSnapshot)
      throw new BadRequestException('目录增量不可用，需要完整快照');
    await this.prisma.$transaction(
      async (transaction) => {
        const state = await transaction.catalogSyncState.findUnique({
          where: { consumer: 'thesis-ledger' },
        });
        if (!state || state.cursor !== delta.fromCursor)
          throw new BadRequestException('目录游标与本地同步状态不一致');
        if (delta.generation <= state.generation)
          throw new BadRequestException('目录增量 generation 必须严格前进');
        for (const item of delta.items) {
          const searchFields = searchFieldsForInstrument(item);
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
        if (stableCatalogChecksum(active) !== delta.checksum)
          throw new BadRequestException('目录增量应用后的 checksum 校验失败');
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
      CATALOG_TRANSACTION_OPTIONS,
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
}
