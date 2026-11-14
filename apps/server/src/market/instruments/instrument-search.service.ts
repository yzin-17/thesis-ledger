import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type Instrument } from '@prisma/client';
import type { DsaClient } from '../../integration/dsa/dsa.client.js';
import { searchDsaInstruments } from '../../integration/dsa/dsa-instrument-search.js';
import { cacheInstrumentSearchItems } from './instrument-search-cache.js';
import { PrismaService } from '../../platform/prisma.service.js';
import { disabledReasonForInstrument, instrumentMatchRank } from './instrument-search.js';

type SearchRow = Instrument & { matchScore?: number };

function exactCode(query: string) {
  const value = query.toUpperCase();
  const hk = /^(\d{1,5})\.HK$/.exec(value);
  if (hk) return hk[1]!.padStart(5, '0') + '.HK';
  return /^(?:\d{6}|[A-Z0-9.^-]+\.(?:SH|SZ|BJ|OF|HK|US))$/.test(value) ? value : undefined;
}

function matchesCode(item: { canonicalCode: string; market: string }, code: string) {
  return item.canonicalCode === code || `${item.canonicalCode}.${item.market}` === code;
}

@Injectable()
export class InstrumentSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchForPicker(query: string, limit: number, dsa: DsaClient) {
    const needle = query.trim();
    if (!needle) return [];
    if (Array.from(needle).length > 80) throw new BadRequestException('搜索关键词最多 80 个字符');
    const count = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 20;
    const code = exactCode(needle);
    if (code) {
      const dot = code.lastIndexOf('.');
      const where = dot < 0
        ? { canonicalCode: code }
        : { canonicalCode: code.slice(0, dot), market: code.slice(dot + 1) };
      const exact = await this.prisma.instrument.findMany({
        where: { ...where, active: true },
        orderBy: [{ instrumentType: 'asc' }, { market: 'asc' }],
        take: count,
      });
      if (exact.length) return this.project(exact);
    } else {
      const local = await this.search(needle, count);
      if (local.length) return local;
    }

    const items = await searchDsaInstruments(dsa, code ?? needle);
    const matches = code ? items.filter((item) => matchesCode(item, code)) : items;
    if (!matches.length) return [];
    const saved = await cacheInstrumentSearchItems(this.prisma, matches.slice(0, count));
    return this.project(saved);
  }

  async search(query: string, limit = 20, scope?: { markets: readonly string[]; types: readonly string[] }) {
    const needle = query.trim();
    if (!needle) return [];
    const take = Math.min(Math.max(limit * 5, 20), 200);
    let instruments: SearchRow[];
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
          ${scope ? Prisma.sql`AND "market"=ANY(${[...scope.markets]}::text[]) AND "instrumentType"=ANY(${[...scope.types]}::text[])` : Prisma.empty}
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
        ORDER BY CASE WHEN LOWER("canonicalCode") = LOWER(${needle})
          OR LOWER("canonicalCode" || '.' || "market") = LOWER(${needle}) THEN 0 ELSE 1 END,
        GREATEST(
          similarity("canonicalCode", ${needle}),
          similarity("displayName", ${needle}),
          similarity(COALESCE("pinyin", ''), ${needle}),
          similarity(COALESCE("pinyinInitials", ''), ${needle})
        ) DESC, "canonicalCode", "instrumentType", "market", "id"
        LIMIT ${take}
      `);
    } catch {
      instruments = await this.prisma.instrument.findMany({ where: { active: true,
        ...(scope ? { market: { in: [...scope.markets] }, instrumentType: { in: [...scope.types] } } : {}),
      }, take });
    }
    const ranked = instruments
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
      .map(({ instrument }) => instrument);
    return this.project(ranked);
  }

  private async project(instruments: SearchRow[]) {
    const results = instruments.map((instrument) => {
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
    const eligible = results.filter((instrument) => instrument.confirmable);
    if (eligible.length === 0) return results.map((instrument) => ({ ...instrument, confirmed: false }));
    const associations = await this.prisma.instrumentAssetAssociation.findMany({
      where: {
        instrumentId: { in: [...new Set(eligible.map((instrument) => instrument.id))] },
        symbol: { in: [...new Set(eligible.map((instrument) => instrument.symbol))] },
        status: 'active',
        confirmedAt: { not: null },
        asset: { identityStatus: 'confirmed' },
      },
      select: { instrumentId: true, symbol: true },
    });
    const confirmed = new Set(associations.map((association) => `${association.instrumentId}:${association.symbol}`));
    return results.map((instrument) => ({
      ...instrument,
      confirmed: instrument.confirmable && confirmed.has(`${instrument.id}:${instrument.symbol}`),
    }));
  }
}
