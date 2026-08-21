import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma.service.js';
import { disabledReasonForInstrument, instrumentMatchRank } from './instrument-search.js';

@Injectable()
export class InstrumentSearchService {
  constructor(private readonly prisma: PrismaService) {}

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
      instruments = await this.prisma.instrument.findMany({ where: { active: true }, take });
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
      .map(({ instrument }) => {
        const disabledReason = disabledReasonForInstrument(
          instrument.instrumentType,
          instrument.market,
        );
        return {
          ...instrument,
          symbol: `${instrument.canonicalCode}.${instrument.market}`,
          confirmable: disabledReason === null,
          disabledReason,
        };
      });
  }
}
