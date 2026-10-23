import { describe, expect, it } from 'vitest';
import {
  correlateReportMetadata, reportMetadataCollectSchema, reportMetadataCurrentRevisions,
  reportMetadataPageSchema, reportMetadataRequestSchema,
} from '../src/research-report-metadata.js';

const request = reportMetadataRequestSchema.parse({
  contractVersion: 3, consumer: 'thesis-ledger', requestId: 'metadata-test', symbol: '600519.SH',
  start: '2026-08-01', end: '2026-10-23', page: 1, pageSize: 2, requestBudgetMs: 3000,
});
const response = {
  contractVersion: 3, consumer: 'thesis-ledger', capability: 'RESEARCH_REPORT_METADATA',
  metadataVersion: 'research-report-metadata-v1', adapterRevision: 'eastmoney-report-metadata-page-v1',
  sourceRevision: 'eastmoney-report-list-single-page-v1',
  requestId: request.requestId, symbol: request.symbol, start: request.start, end: request.end,
  page: 1, pageSize: 2, totalItems: 772, totalPages: 386, historyComplete: false,
  fetchedAt: '2026-10-22T16:27:04Z', providerId: 'akshare', upstreamSource: 'eastmoney',
  policyRevision: 164, routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
  items: [
    { sourceReportId: 'AP202609211829719676', reference: 'eastmoney:report:AP202609211829719676',
      title: '公司跟踪报告', publisher: '诚通证券', publishedDate: '2026-09-21', datePrecision: 'date',
      originalUrl: 'https://pdf.dfcfw.com/pdf/H3_AP202609211829719676_1.pdf' },
    { sourceReportId: 'AP202608211828244348', reference: 'eastmoney:report:AP202608211828244348',
      title: '中报点评', publisher: '西南证券', publishedDate: '2026-08-21', datePrecision: 'date',
      originalUrl: 'https://pdf.dfcfw.com/pdf/H3_AP202608211828244348_1.pdf' },
  ],
};

describe('研报最小元数据合同', () => {
  it.each(['600519.SH', '000001.SZ'])('全部已支持股票 %s 可省略日期且不补隐藏窗口', (symbol) => {
    const input = { ...request, symbol, start: undefined, end: undefined };
    const parsed = reportMetadataRequestSchema.parse(input);
    expect(parsed.start).toBeNull();
    expect(parsed.end).toBeNull();
    const page = correlateReportMetadata(parsed, {
      ...response, ...reportMetadataCurrentRevisions, symbol, start: null, end: null,
    });
    expect(page.items).toHaveLength(2);
    expect(page.historyComplete).toBe(false);
    expect(reportMetadataCollectSchema.parse({ instrumentId: '86b1de50-d50d-4007-84c0-918e7e5409ca' }))
      .toMatchObject({ start: null, end: null, page: 1, pageSize: 10 });
  });

  it('可选单边日期仍校验返回记录，旧版结果必须保留原日期', () => {
    const page = { ...response, ...reportMetadataCurrentRevisions, start: null, end: '2026-10-23' };
    expect(reportMetadataPageSchema.safeParse(page).success).toBe(true);
    expect(reportMetadataPageSchema.safeParse({ ...page, end: '2026-08-01' }).success).toBe(false);
    expect(reportMetadataPageSchema.safeParse({ ...page, metadataVersion: 'research-report-metadata-v1' }).success).toBe(false);
    expect(reportMetadataRequestSchema.safeParse({ ...request, start: '2026-02-30', end: null }).success).toBe(false);
  });

  it('保留日期精度、稳定引用及局部历史边界', () => {
    const page = correlateReportMetadata(request, response);
    expect(page.items[0]?.publishedDate).toBe('2026-09-21');
    expect(page.historyComplete).toBe(false);
  });

  it.each(['requestId', 'symbol', 'start', 'end', 'page', 'pageSize'] as const)('关联校验拒绝其他请求的 %s', (field) => {
    const changed = { ...response, [field]: typeof response[field] === 'number' ? response[field] + 1 : 'other' };
    expect(() => correlateReportMetadata(request, changed)).toThrow();
  });

  it.each([
    { ...response, historyComplete: true },
    { ...response, totalPages: 385 },
    { ...response, items: response.items.slice(0, 1) },
    { ...response, items: [response.items[0], response.items[0]] },
    { ...response, providerId: 'other' },
    { ...response, abstract: '不得保存的摘要' },
  ])('拒绝覆盖、分页、来源和额外字段失真', (value) => {
    expect(reportMetadataPageSchema.safeParse(value).success).toBe(false);
  });

  it('禁止凭据链接及来源窗口外的日期', () => {
    const item = response.items[0]!;
    for (const changed of [
      { ...item, originalUrl: 'https://secret@pdf.dfcfw.com/file.pdf' },
      { ...item, publishedDate: '2026-07-31' },
      { ...item, reference: 'other:report:AP202609211829719676' },
    ]) expect(reportMetadataPageSchema.safeParse({ ...response, items: [changed, response.items[1]] }).success).toBe(false);
  });
});
