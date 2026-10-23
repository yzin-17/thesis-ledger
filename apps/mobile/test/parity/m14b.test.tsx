// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { MarketNewsScreen } from '../../src/features/market-news/MarketNewsScreen';
import { AnnouncementsScreen } from '../../src/features/market-news/AnnouncementsScreen';
import { localDocumentGroups } from '../../src/features/market-news/document-groups';
import { safeExternalUrl } from '../../src/platform/links/external-url';
vi.mock('../../src/components/SourceLink', () => ({ SourceLink: () => null }));
describe('M14b 资讯、公告与原文', () => {
  it('资讯由明确读取触发，未准入结果保留原因及覆盖说明', async () => {
    view.params = {};
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        market: 'CN',
        status: 'unavailable',
        items: [],
        fetchedAt: null,
        source: null,
        upstreamAttempts: 0,
        nextCursor: null,
        cacheIdentity: null,
        coverage: {
          basis: 'current-feed',
          publishedStart: body.publishedStart,
          publishedEnd: body.publishedEnd,
          complete: false,
          truncated: false,
          unknownPublishedTimeCount: 0,
          examinedCount: null,
          returnedCount: 0,
          uniqueEvidenceCount: 0,
          missingReasons: ['not_admitted'],
        },
        errors: [
          {
            code: 'not_admitted',
            message: '当前快讯尚未准入',
            providerId: null,
            upstreamSource: null,
          },
        ],
      });
    });
    setApi(fetcher);
    await mount(<MarketNewsScreen />);
    expect(fetcher).not.toHaveBeenCalled();
    await click(button('读取资讯'));
    expect(document.body.textContent).toContain('当前快讯尚未准入');
    expect(document.body.textContent).toContain('不代表该期间没有新闻');
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      providerId: 'cls',
      limit: 5,
      requestBudgetMs: 15000,
    });
  });
  it('公告翻页后查询重置第一页，下载失败仍可见原文记录', async () => {
    view.params = {};
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const query = new URL(String(url)).searchParams;
      return Response.json({
        providerId: 'official-states',
        total: 61,
        page: Number(query.get('page')),
        pageSize: 30,
        items: [],
      });
    });
    setApi(fetcher);
    await mount(<AnnouncementsScreen />);
    await click(button('下一页公告'));
    expect(new URL(String(fetcher.mock.calls.at(-1)![0])).searchParams.get('page')).toBe('2');
    await input(field('搜索公告标题或标的'), '600519');
    await click(button('查询公告'));
    const query = new URL(String(fetcher.mock.calls.at(-1)![0])).searchParams;
    expect(query.get('page')).toBe('1');
    expect(query.get('q')).toBe('600519');
  });
  it('同一原文合并但保留所有用途范围，公开 HTTP 来源单独允许且不接受凭据', () => {
    const data = {
      datasetId: 'rules-v1',
      symbols: ['510300.SH'],
      coverage: { start: '2026-01-01', end: '2026-10-23' },
      updateMode: 'bundled' as const,
      documents: [{ id: 'one', title: '受控规则原文', url: 'http://example.test/rule.pdf' }],
    };
    const result = localDocumentGroups([
      {
        providerId: 'official-rules',
        displayName: '官方规则',
        sourceKind: 'local_history',
        upstreamSources: [
          { sourceId: 'fees', displayName: '费用', capabilities: {}, localHistory: data },
          { sourceId: 'lots', displayName: '数量规则', capabilities: {}, localHistory: data },
        ],
      },
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.references).toHaveLength(2);
    expect(() => safeExternalUrl(data.documents[0]!.url)).toThrow();
    expect(safeExternalUrl(data.documents[0]!.url, undefined, { allowHttp: true })).toBe(
      data.documents[0]!.url,
    );
    expect(() =>
      safeExternalUrl('http://user:password@example.test/rule.pdf', undefined, { allowHttp: true }),
    ).toThrow();
  });
});
