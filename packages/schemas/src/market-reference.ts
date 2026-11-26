import { z } from 'zod';
import {
  marketReferenceCatalog,
  marketReferenceIndexInfo,
  referenceSingleDayDatasets,
  type MarketReferenceDataset,
} from './market-reference-catalog.js';
import { marketReferenceSources } from './market-reference-sources.js';
import { validMarketReferenceSymbol } from './market-reference-identity.js';
import { derivativeReferenceSingleDay } from './market-reference-derivative-catalog.js';

export const marketReferenceEndpoint = '/api/v1/thesis-ledger/market/reference';
const dataset = z.enum(
  Object.keys(marketReferenceCatalog) as [MarketReferenceDataset, ...MarketReferenceDataset[]],
);
const nullableDate = z.iso.date().nullable().default(null);
const cursor = z
  .string()
  .max(128)
  .regex(/^[0-9A-Za-z_.:-]+$/)
  .nullable()
  .default(null);
const fields = {
  dataset,
  symbol: z.string().nullable().default(null),
  indexCode: z.string().nullable().default(null),
  start: nullableDate,
  end: nullableDate,
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(20).default(5),
  cursor,
  requestBudgetMs: z.number().int().min(1000).max(120000).default(60000),
};

type Scope = z.infer<z.ZodObject<typeof fields>>;
function validIdentity(v: Scope): boolean {
  const entry = marketReferenceCatalog[v.dataset];
  if (!validMarketReferenceSymbol(v.dataset, v.symbol)) return false;
  if (
    entry.scope === 'index'
      ? v.indexCode !== marketReferenceIndexInfo(v.dataset)?.code
      : v.indexCode !== null
  )
    return false;
  return true;
}

function validDates(v: Scope): boolean {
  const entry = marketReferenceCatalog[v.dataset];
  if ((v.start || v.end) && entry.dateFilter === null) return false;
  if (v.start && v.end && v.start > v.end) return false;
  const limits: Record<string, number> = {
    'valuation-history': 3660,
    'macro-calendar': 6,
    'chinabond-curves': 359,
  };
  if (limits[v.dataset] !== undefined) {
    if (!v.start || !v.end) return false;
    const days = (Date.parse(v.end) - Date.parse(v.start)) / 86400000;
    if (days > limits[v.dataset]!) return false;
  }
  if (
    referenceSingleDayDatasets.includes(v.dataset) ||
    derivativeReferenceSingleDay.includes(v.dataset)
  ) {
    if (!v.start || v.start !== v.end) return false;
  }
  return true;
}

function validScope(v: Scope): boolean {
  if (!validIdentity(v) || !validDates(v)) return false;
  if (v.dataset === 'global-news') return (v.page === 1) === (v.cursor === null);
  return v.cursor === null;
}

export const marketReferenceInputSchema = z
  .strictObject(fields)
  .refine(validScope, '资料类型、证券、日期或分页无效');
export const marketReferenceRequestSchema = z
  .strictObject({
    ...fields,
    requestId: z.string().trim().min(1).max(128),
    contractVersion: z.literal(1),
    consumer: z.literal('thesis-ledger'),
  })
  .refine(validScope, '市场资料请求无效');
export type MarketReferenceInput = z.infer<typeof marketReferenceInputSchema>;
export type MarketReferenceRequest = z.infer<typeof marketReferenceRequestSchema>;

export const referenceHttpsUrlSchema = z.url().refine((v) => {
  const url = new URL(v);
  return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
});
const column = z.strictObject({
  key: z.string(),
  label: z.string(),
  format: z.enum(['text', 'decimal', 'integer', 'date', 'datetime', 'url']),
  unit: z.string().nullable(),
});
const resultFields = {
  dataVersion: z.literal('market-reference-v1'),
  requestId: z.string().min(1).max(128),
  dataset,
  symbol: z.string().nullable(),
  indexCode: z.string().nullable(),
  start: z.iso.date().nullable(),
  end: z.iso.date().nullable(),
  page: z.number().int().min(1).max(1000),
  pageSize: z.number().int().min(1).max(20),
  cursor,
  nextCursor: cursor,
  providerId: z.string().min(1),
  upstreamSource: z.string().min(1),
  adapterRevision: z.literal('market-reference-projection-v1'),
  sourceRevision: z.string().min(1),
  fetchedAt: z.iso.datetime({ offset: true }),
  sourceUrl: referenceHttpsUrlSchema,
  columns: z.array(column).min(1).max(20),
  items: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-f0-9]{64}$/),
        values: z.record(z.string(), z.string().max(8000).nullable()),
      }),
    )
    .max(20),
  status: z.enum(['ok', 'empty']),
  hasMore: z.boolean(),
  totalSourceRecords: z.number().int().nonnegative().nullable(),
  historyComplete: z.literal(false),
  notes: z.array(z.string().max(2000)).min(1).max(20),
  contractVersion: z.literal(1),
  consumer: z.literal('thesis-ledger'),
  policyRevision: z.number().int().positive(),
  routeTarget: z.strictObject({
    providerId: z.string().min(1),
    upstreamSource: z.string().min(1),
    routeIndex: z.literal(0),
  }),
};

const resultBase = z.strictObject(resultFields);
type ReferenceResultBase = z.infer<typeof resultBase>;

function validResultMetadata(v: ReferenceResultBase): boolean {
  const source = marketReferenceSources[v.dataset];
  return (
    v.providerId === source.providerId &&
    v.upstreamSource === source.upstreamSource &&
    v.sourceRevision === source.sourceRevision &&
    JSON.stringify(v.columns) === JSON.stringify(marketReferenceCatalog[v.dataset].columns) &&
    v.status === (v.items.length ? 'ok' : 'empty') &&
    v.items.length <= v.pageSize &&
    new Set(v.items.map((row) => row.id)).size === v.items.length &&
    v.providerId === v.routeTarget.providerId &&
    v.upstreamSource === v.routeTarget.upstreamSource
  );
}

function validResultPaging(v: ReferenceResultBase): boolean {
  if (v.dataset === 'global-news') {
    return v.hasMore === (v.nextCursor !== null) && (!v.hasMore || v.nextCursor !== v.cursor);
  }
  return v.nextCursor === null;
}

function validValue(value: string, format: z.infer<typeof column>['format']): boolean {
  if (format === 'decimal')
    return value.length <= 132 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
  if (format === 'integer') return value.length <= 132 && /^-?(?:0|[1-9]\d*)$/.test(value);
  if (format === 'date') return z.iso.date().safeParse(value).success;
  if (format === 'datetime') return z.iso.datetime({ offset: true }).safeParse(value).success;
  if (format === 'url') return referenceHttpsUrlSchema.safeParse(value).success;
  return true;
}

function validRows(v: ReferenceResultBase): boolean {
  const keys = v.columns.map((c) => c.key).sort();
  for (const row of v.items) {
    if (JSON.stringify(Object.keys(row.values).sort()) !== JSON.stringify(keys)) return false;
    for (const c of v.columns) {
      const value = row.values[c.key];
      if (value === null) continue;
      if (value === undefined || !validValue(value, c.format)) return false;
    }
  }
  return true;
}

export const marketReferenceResultSchema = resultBase.superRefine((v, ctx) => {
  const scope = marketReferenceInputSchema.safeParse({
    dataset: v.dataset,
    symbol: v.symbol,
    indexCode: v.indexCode,
    start: v.start,
    end: v.end,
    page: v.page,
    pageSize: v.pageSize,
    cursor: v.cursor,
  });
  if (!scope.success || !validResultMetadata(v) || !validResultPaging(v) || !validRows(v)) {
    ctx.addIssue({ code: 'custom', message: '资料列、值、来源或分页与合同不符' });
  }
});
export type MarketReferenceResult = z.infer<typeof marketReferenceResultSchema>;

export function correlateMarketReference(
  input: MarketReferenceInput,
  raw: unknown,
  requestId?: string,
): MarketReferenceResult {
  const result = marketReferenceResultSchema.parse(raw);
  const keys = [
    'dataset',
    'symbol',
    'indexCode',
    'start',
    'end',
    'page',
    'pageSize',
    'cursor',
  ] as const;
  if (
    keys.some((key) => input[key] !== result[key]) ||
    (requestId !== undefined && requestId !== result.requestId)
  )
    throw new Error('市场资料响应与本次查询不符');
  return result;
}
