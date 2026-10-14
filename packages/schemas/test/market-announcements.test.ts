import { describe, expect, it } from 'vitest';
import { marketAnnouncementsSchema } from '../src/market-announcements.js';
import { providerUpstreamSourceSchema } from '../src/market-provider-source.js';

describe('公告查询合同', () => {
  it('保留目录能力标识，同时兼容旧清单', () => {
    const old = { sourceId: 'cn-stock-daily-suspension', displayName: '停复牌', capabilities: {} };
    expect(providerUpstreamSourceSchema.parse(old).documentCatalog).toBeUndefined();
    expect(
      providerUpstreamSourceSchema.parse({ ...old, documentCatalog: 'announcements' })
        .documentCatalog,
    ).toBe('announcements');
  });
  const item = {
    id: 'a',
    symbol: '000881.SZ',
    title: '停牌公告',
    url: 'https://static.cninfo.com.cn/a.PDF',
    publishedDate: '2023-08-21',
    uses: ['suspension'],
    downloadState: 'failed',
    parseState: 'unparsed',
  };
  const response = {
    providerId: 'official-states',
    items: [item],
    total: 1,
    page: 1,
    pageSize: 50,
  };
  it('下载失败与未解析的公告仍然是合法目录项', () => {
    expect(marketAnnouncementsSchema.parse(response).items).toHaveLength(1);
  });
  it('拒绝错误标的和失控分页', () => {
    expect(marketAnnouncementsSchema.safeParse({ ...response, pageSize: 101 }).success).toBe(false);
    expect(
      marketAnnouncementsSchema.safeParse({ ...response, items: [{ ...item, symbol: 'AAPL' }] })
        .success,
    ).toBe(false);
  });
});
