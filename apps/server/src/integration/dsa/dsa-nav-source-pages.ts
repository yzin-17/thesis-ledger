import { z } from 'zod';
import type { NavEnvelope } from './dsa-nav-envelope.js';
import { navCanonical, navEqual, navHash, navInvalid, parseNavRaw } from './dsa-nav-raw.js';

export const navNativeRecordSchema = z
  .object({ FSRQ: z.iso.date(), DWJZ: z.string().regex(/^\d+(?:\.\d+)?$/) })
  .passthrough();
const pageSchema = z
  .object({
    Success: z.literal(true),
    ErrCode: z.literal(0),
    ErrorCode: z.union([z.literal('0'), z.literal(0)]),
    TotalCount: z.number().int().positive(),
    Datas: z.array(navNativeRecordSchema),
  })
  .passthrough();

/** 核对全部原文页、来源自报总量及日期唯一性，另核对每条实际消费的原生片段。 */
export function verifyNavPages(envelope: NavEnvelope) {
  const source = envelope.navSource;
  const dates: string[] = [];
  const pageRecords = new Map<number, Map<string, unknown>>();
  let bytes = 0;
  source.pages.forEach((page, index) => {
    const size = Buffer.byteLength(page.rawResponse);
    bytes += size;
    if (
      size > 4 * 1024 * 1024 ||
      bytes > 32 * 1024 * 1024 ||
      page.pageIndex !== index + 1 ||
      navHash(page.rawResponse) !== page.contentHash
    )
      navInvalid();
    const parsed = pageSchema.parse(parseNavRaw(page.rawResponse));
    if (
      parsed.TotalCount !== source.totalCount ||
      parsed.Datas.length !== Math.min(1000, source.totalCount - dates.length)
    )
      navInvalid();
    if (parsed.Datas.some((record) => !/[1-9]/.test(record.DWJZ))) navInvalid();
    pageRecords.set(page.pageIndex, new Map(parsed.Datas.map((record) => [record.FSRQ, record])));
    dates.push(...parsed.Datas.map((record) => record.FSRQ));
  });
  if (dates.length !== source.totalCount || new Set(dates).size !== dates.length) navInvalid();
  const batch = {
    fundCode: source.fundCode,
    endpoint: source.endpoint,
    readerRevision: source.readerRevision,
    pages: source.pages.map(({ pageIndex, contentHash }) => ({ pageIndex, contentHash })),
  };
  if (navHash(navCanonical(batch)) !== source.contentHash) navInvalid();
  for (const record of envelope.records) {
    const native = navNativeRecordSchema.parse(parseNavRaw(record.nativeRecordRaw));
    const page = source.pages[record.sourcePageIndex - 1];
    if (
      record.symbol !== envelope.symbol ||
      record.nativeRecordHash !== navHash(record.nativeRecordRaw) ||
      record.sourceRecordId !==
        `eastmoney-nav-raw-v1:${envelope.symbol}:${record.nativeRecordHash}` ||
      native.FSRQ !== record.valuationDate ||
      native.DWJZ !== record.nav ||
      !page?.rawResponse.includes(record.nativeRecordRaw) ||
      !navEqual(pageRecords.get(record.sourcePageIndex)?.get(record.valuationDate), native)
    )
      navInvalid();
  }
  return dates.sort();
}
