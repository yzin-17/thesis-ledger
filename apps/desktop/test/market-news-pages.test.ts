import { expect, it } from 'vitest';
import type { MarketNewsResult } from '@thesis-ledger/schemas';
import { projectMarketNewsPages } from '../src/features/market-data/market-news-pages.js';

const instrument = { symbol: '600036.SH', market: 'CN', assetType: 'STOCK' } as const;
function page(start: number, count: number, nextCursor: string | null): MarketNewsResult {
  const items = Array.from({ length: count }, (_, offset) => {
    const id = String(start + offset);
    return {
      id, title: `新闻 ${id}`, url: `https://news.10jqka.com.cn/${id}`, originalUrl: null,
      providerId: 'hithink', publisher: '受控媒体', sourceItemId: id,
      contentFingerprint: 'a'.repeat(64), evidenceGroupId: `group-${id}`, excerpt: null,
      summaryKind: 'provider-excerpt' as const, publishedAt: '2026-11-09T00:00:00Z',
      sourceAvailableAt: null, fetchedAt: '2026-11-09T01:00:00Z', relatedInstruments: [instrument],
      sourceUrls: [`https://news.10jqka.com.cn/${id}`],
    };
  });
  return {
    instrument, items, status: nextCursor ? 'partial' : 'available', nextCursor,
    source: { providerId: 'hithink', upstreamSource: 'timeline', policyRevision: '1', routeRevision: '2', credentialRevision: '1' },
    fetchedAt: '2026-11-09T01:00:00Z', upstreamAttempts: 1, errors: [], cacheIdentity: null,
    coverage: { basis: 'current-search', complete: !nextCursor, truncated: Boolean(nextCursor),
      publishedStart: '2026-11-06T01:00:00Z', publishedEnd: '2026-11-09T01:00:00Z',
      unknownPublishedTimeCount: 0, examinedCount: count, returnedCount: count,
      uniqueEvidenceCount: count, missingReasons: nextCursor ? ['pagination_truncated'] : [] },
  };
}

it('可展示超过单页上限的已加载集合并在耗尽后移除临时分页缺口', () => {
  const result = projectMarketNewsPages([page(1, 50, 'next'), page(46, 30, null)])!;
  expect(result.items).toHaveLength(75);
  expect(result.coverage).toMatchObject({ complete: true, returnedCount: 75, uniqueEvidenceCount: 75, examinedCount: 80, missingReasons: [] });
  expect(result.items[0]!.id).toBe('1');
  expect(result.items.at(-1)!.id).toBe('75');
});

it('未知时间与实际来源失败不能因最后一页正常就变成完整', () => {
  const first = page(1, 2, 'next');
  first.coverage.missingReasons.push('published_time_unknown');
  const result = projectMarketNewsPages([first, page(3, 2, null)])!;
  expect(result.status).toBe('partial');
  expect(result.coverage.complete).toBe(false);
  expect(result.coverage.missingReasons).toEqual(['published_time_unknown']);
});

it('跨页 URL 重复保留首条且拒绝混合来源', () => {
  const first = page(1, 1, 'next');
  const last = page(2, 1, null);
  last.items[0]!.url = first.items[0]!.url;
  expect(projectMarketNewsPages([first, last])!.items).toHaveLength(1);
  last.source = { ...last.source!, upstreamSource: 'different' };
  expect(() => projectMarketNewsPages([first, last])).toThrow('来源发生变化');
});
