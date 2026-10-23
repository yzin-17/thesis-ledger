import { z } from 'zod';

export const reportMetadataEndpoint = '/api/v3/thesis-ledger/market/research-report-metadata';
const symbol = z.string().regex(/^[0-9]{6}\.(SH|SZ)$/);
const text = z.string().min(1);
const optionalDate = z.iso.date().nullable().optional().default(null);
const orderedDates = (value: { start: string | null; end: string | null }) =>
  value.start === null || value.end === null || value.start <= value.end;

export const reportMetadataCurrentRevisions = {
  metadataVersion: 'research-report-metadata-v2',
  adapterRevision: 'eastmoney-report-metadata-page-v2',
  sourceRevision: 'eastmoney-report-list-single-page-v2',
} as const;

export const reportMetadataRequestSchema = z.strictObject({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  requestId: text.max(128),
  symbol,
  assetType: z.literal('STOCK').default('STOCK'),
  start: optionalDate,
  end: optionalDate,
  page: z.number().int().min(1).max(1000),
  pageSize: z.number().int().min(1).max(20),
  requestBudgetMs: z.number().int().min(500).max(5000),
}).refine(orderedDates, '研报日期筛选逆序');

export const reportMetadataItemSchema = z.strictObject({
  sourceReportId: text.max(128),
  reference: text.max(384),
  title: text.max(400).refine((value) => Boolean(value.trim())),
  publisher: text.max(160).refine((value) => Boolean(value.trim())),
  publishedDate: z.iso.date(),
  datePrecision: z.literal('date'),
  originalUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, '原文链接需要不含凭据的 HTTPS 地址'),
});

export const reportMetadataPageSchema = z.strictObject({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  capability: z.literal('RESEARCH_REPORT_METADATA'),
  metadataVersion: z.enum(['research-report-metadata-v1', 'research-report-metadata-v2']),
  adapterRevision: text,
  sourceRevision: text,
  requestId: text.max(128),
  symbol,
  start: z.iso.date().nullable(),
  end: z.iso.date().nullable(),
  page: z.number().int().min(1).max(1000),
  pageSize: z.number().int().min(1).max(20),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  historyComplete: z.literal(false),
  fetchedAt: z.iso.datetime({ offset: true }),
  providerId: text,
  upstreamSource: text,
  items: z.array(reportMetadataItemSchema).max(20),
  policyRevision: z.number().int().positive(),
  routeTarget: z.strictObject({ providerId: text, upstreamSource: text, routeIndex: z.number().int().min(0).max(1) }),
}).superRefine((page, context) => {
  const pages = Math.ceil(page.totalItems / page.pageSize);
  const expectedRows = Math.max(0, Math.min(page.pageSize, page.totalItems - (page.page - 1) * page.pageSize));
  if ((page.totalPages !== pages && !(page.totalItems === 0 && page.totalPages === 1))
    || page.items.length !== expectedRows || !orderedDates(page)
    || (page.metadataVersion === 'research-report-metadata-v1' && (page.start === null || page.end === null))) {
    context.addIssue({ code: 'custom', message: '研报分页总数、页内条数或窗口不一致' });
  }
  const ids = new Set(page.items.map((item) => item.sourceReportId));
  if (ids.size !== page.items.length || page.providerId !== page.routeTarget.providerId
    || page.upstreamSource !== page.routeTarget.upstreamSource) {
    context.addIssue({ code: 'custom', message: '研报身份重复或实际来源不一致' });
  }
  for (const item of page.items) {
    if (item.reference !== `${page.upstreamSource}:report:${item.sourceReportId}`
      || (page.start !== null && item.publishedDate < page.start)
      || (page.end !== null && item.publishedDate > page.end)) {
      context.addIssue({ code: 'custom', message: '研报引用或发布日期与请求范围不一致' });
    }
  }
});

export type ReportMetadataRequest = z.infer<typeof reportMetadataRequestSchema>;
export type ReportMetadataPage = z.infer<typeof reportMetadataPageSchema>;

export function correlateReportMetadata(request: ReportMetadataRequest, raw: unknown): ReportMetadataPage {
  const page = reportMetadataPageSchema.parse(raw);
  const fields = ['requestId', 'symbol', 'start', 'end', 'page', 'pageSize'] as const;
  if (fields.some((field) => page[field] !== request[field])) throw new Error('研报响应与本次请求不一致');
  return page;
}

export const reportMetadataCollectSchema = z.strictObject({
  instrumentId: z.uuid(), start: optionalDate, end: optionalDate,
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(20).default(10),
  requestBudgetMs: z.number().int().min(500).max(5000).default(3000),
}).refine(orderedDates, '研报日期筛选逆序');

export const reportMetadataSnapshotSchema = z.strictObject({
  snapshotId: z.uuid(), instrumentId: z.uuid(), symbol,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), collectedAt: z.iso.datetime({ offset: true }),
  request: reportMetadataRequestSchema, page: reportMetadataPageSchema,
}).superRefine((snapshot, context) => {
  try {
    correlateReportMetadata(snapshot.request, snapshot.page);
    if (snapshot.symbol !== snapshot.page.symbol) throw new Error('快照证券不一致');
  } catch { context.addIssue({ code: 'custom', message: '研报快照与请求或证券身份不一致' }); }
});

export const reportMetadataHistoryQuerySchema = z.strictObject({
  instrumentId: z.uuid(), limit: z.coerce.number().int().min(1).max(20).default(10), cursor: z.uuid().optional(),
});
export type ReportMetadataCollect = z.infer<typeof reportMetadataCollectSchema>;
export type ReportMetadataSnapshot = z.infer<typeof reportMetadataSnapshotSchema>;
