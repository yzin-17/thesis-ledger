import { uniqBy } from 'es-toolkit';
import { canonicalNewsUrlV3, type MarketNewsResult, type MarketNewsFeedResult } from '@thesis-ledger/schemas';

type NewsPage = MarketNewsResult | MarketNewsFeedResult;

/** Presentation of loaded pages; this aggregate is never passed off as a single API page. */
export function projectMarketNewsPages<T extends NewsPage>(pages: readonly T[]): T | undefined {
  const last = pages.at(-1);
  if (!last) return undefined;
  if (pages.some((page) => page.source?.providerId !== pages[0]?.source?.providerId || page.source?.upstreamSource !== pages[0]?.source?.upstreamSource)) {
    throw new Error('新闻分页来源发生变化，请重新查询。');
  }
  const items = uniqBy(uniqBy(pages.flatMap((page) => page.items), (item) => item.id), (item) => canonicalNewsUrlV3(item.url));
  const errors = uniqBy(pages.flatMap((page) => page.errors), (error) => `${error.code}:${error.providerId}:${error.upstreamSource}`);
  const reasons = uniqBy(pages.flatMap((page) => page.coverage.missingReasons).filter((reason) => reason !== 'pagination_truncated'), (reason) => reason);
  const truncated = last.nextCursor !== null || last.coverage.truncated;
  if (truncated) reasons.push('pagination_truncated');
  const complete = last.coverage.complete && !truncated && !errors.length && !reasons.length;
  let status: NewsPage['status'] = 'partial';
  if (last.status === 'unavailable') status = 'unavailable';
  else if (complete) status = 'available';
  const examined = pages.map((page) => page.coverage.examinedCount);
  return {
    ...last, status, items, errors,
    coverage: {
      ...last.coverage, complete, truncated,
      returnedCount: items.length,
      uniqueEvidenceCount: new Set(items.map((item) => item.evidenceGroupId)).size,
      unknownPublishedTimeCount: items.filter((item) => item.publishedAt === null).length,
      examinedCount: examined.some((count) => count === null) ? null : examined.reduce<number>((sum, count) => sum + (count ?? 0), 0),
      missingReasons: reasons,
    },
  };
}
