import type { Instrument } from '@prisma/client';
import type { CatalogItem } from '@thesis-ledger/schemas';
import type { PrismaService } from '../../platform/prisma.service.js';
import { searchFieldsForInstrument } from './instrument-search.js';

const identityKey = (item: Pick<CatalogItem, 'canonicalCode' | 'market' | 'instrumentType'>) =>
  JSON.stringify([item.canonicalCode, item.market, item.instrumentType]);

/** 正式目录代次从 1 开始，0 表示只经上游搜索发现的标的。 */
export async function cacheInstrumentSearchItems(
  prisma: PrismaService,
  items: readonly CatalogItem[],
): Promise<Instrument[]> {
  if (items.length === 0) return [];
  const unique = new Map(items.map((item) => [identityKey(item), item]));
  const rows = Array.from(unique.values(), (item) => ({
    ...item,
    ...searchFieldsForInstrument(item),
  }));
  // 单条语句按身份顺序写入。并发目录同步取得的正式记录保留其名称及代次。
  const [, saved] = await prisma.$transaction([
    prisma.$executeRaw`
    INSERT INTO "Instrument" ("id", "canonicalCode", "instrumentType", "market", "displayName",
      "pinyin", "pinyinInitials", "searchAliases", "generation", "active", "updatedAt")
    SELECT gen_random_uuid(), r."canonicalCode", r."instrumentType", r."market", r."displayName",
           r."pinyin", r."pinyinInitials", r."searchAliases", 0, true, CURRENT_TIMESTAMP
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
        "canonicalCode" text, "instrumentType" text, "market" text, "displayName" text,
        "pinyin" text, "pinyinInitials" text, "searchAliases" jsonb)
    ORDER BY "canonicalCode", "instrumentType", "market"
    ON CONFLICT ("canonicalCode", "instrumentType", "market") DO UPDATE SET
      "displayName" = EXCLUDED."displayName", "pinyin" = EXCLUDED."pinyin",
      "pinyinInitials" = EXCLUDED."pinyinInitials", "searchAliases" = EXCLUDED."searchAliases",
      "generation" = 0, "active" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE NOT "Instrument"."active" OR "Instrument"."generation" = 0
    `,
    prisma.instrument.findMany({
      where: {
        active: true,
        OR: rows.map(({ canonicalCode, market, instrumentType }) => ({
          canonicalCode,
          market,
          instrumentType,
        })),
      },
    }),
  ]);
  const byIdentity = new Map(saved.map((row) => [identityKey(row), row]));
  return Array.from(unique.keys(), (key) => byIdentity.get(key)!);
}
