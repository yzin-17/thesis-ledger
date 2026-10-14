import { z } from 'zod';

const text = z.string().trim().min(1);
const date = z.iso.date();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const document = z.strictObject({
  id: text,
  kind: z.enum(['issuerDisclosure', 'issuerAnnualReport']),
  title: text,
  url: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        ['static.cninfo.com.cn', 'www.sse.com.cn'].includes(url.hostname)
      );
    } catch {
      return false;
    }
  }),
  sha256: digest,
  publishedDate: date,
  observedAt: z.iso.datetime({ offset: true }),
  pages: z.array(z.number().int().positive()).min(1),
});
const event = z.strictObject({
  announcementDate: date,
  recordDate: date,
  effectiveDate: date,
  paymentDate: date,
  cashAmount: z
    .string()
    .regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/)
    .refine((value) => /[1-9]/.test(value)),
  unit: z.literal('CNY/10-fund-units'),
  currency: z.literal('CNY'),
  sourceDocumentId: text,
});
export const marketNoticeDividendPackV3Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    datasetId: text,
    symbol: z.string().regex(/^\d{6}\.SH$/),
    market: z.literal('CN'),
    instrumentType: z.literal('ETF'),
    currency: z.literal('CNY'),
    coverage: z.strictObject({
      start: date,
      end: date,
      basis: z.literal('annual-report-cash-distributions'),
      sourceDocumentId: text,
      reportStart: date,
      reportEnd: date,
      eventDates: z.array(date),
    }),
    sourceDocuments: z.array(document).min(2),
    events: z.array(event),
  })
  .superRefine((pack, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const coverage = pack.coverage;
    if (!(
      coverage.reportStart <= coverage.start &&
      coverage.start <= coverage.end &&
      coverage.end <= coverage.reportEnd
    ))
      fail('现金覆盖范围超出报告期');
    const documents = new Map(pack.sourceDocuments.map((item) => [item.id, item]));
    if (documents.size !== pack.sourceDocuments.length) fail('来源文档重复');
    for (const item of documents.values()) {
      if (Date.parse(`${item.publishedDate}T00:00:00Z`) > Date.parse(item.observedAt))
        fail('来源核验早于发布日期');
    }
    const report = documents.get(coverage.sourceDocumentId);
    if (report?.kind !== 'issuerAnnualReport' || report.publishedDate <= coverage.reportEnd)
      fail('缺期后年报现金覆盖依据');
    const dates = new Set<string>();
    for (const item of pack.events) {
      if (dates.has(item.effectiveDate)) fail('现金事件重复');
      dates.add(item.effectiveDate);
      const notice = documents.get(item.sourceDocumentId);
      if (notice?.kind !== 'issuerDisclosure' || notice.publishedDate !== item.announcementDate)
        fail('事件缺对应公告');
      if (!(
        item.announcementDate <= item.recordDate &&
        item.recordDate < item.effectiveDate &&
        item.effectiveDate <= item.paymentDate &&
        coverage.start <= item.effectiveDate &&
        item.effectiveDate <= coverage.end
      ))
        fail('现金事件日期次序或范围无效');
    }
    if (
      new Set(coverage.eventDates).size !== coverage.eventDates.length ||
      dates.size !== coverage.eventDates.length ||
      coverage.eventDates.some((day) => !dates.has(day))
    )
      fail('现金事件与独立覆盖清单不一致');
  });

export const marketNoticeDividendEvidenceV3Schema = z.strictObject({
  ref: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sha256: digest,
  content: z
    .string()
    .min(1)
    .max(256 * 1024),
});

/** 原文字节供摘要核验；词法检查拒绝所有层级的重复字段。 */
export function parseMarketNoticeDividendPackV3(content: string) {
  marketNoticeDividendEvidenceV3Schema.shape.content.parse(content);
  const value: unknown = JSON.parse(content);
  const stack: Array<{ object: boolean; keys: Set<string>; keyExpected: boolean }> = [];
  for (const match of content.matchAll(
    /"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
  )) {
    const token = match[0];
    const top = stack.at(-1);
    if (token === '{' || token === '[')
      stack.push({ object: token === '{', keys: new Set(), keyExpected: true });
    else if (token === '}' || token === ']') stack.pop();
    else if (top?.object) {
      if (token === ',') top.keyExpected = true;
      else if (token === ':') top.keyExpected = false;
      else if (top.keyExpected && token.startsWith('"')) {
        const key = JSON.parse(token) as string;
        if (top.keys.has(key)) throw new Error('公告原文包含重复字段');
        top.keys.add(key);
      }
    }
  }
  return marketNoticeDividendPackV3Schema.parse(value);
}

export function isMarketNoticeDividendRouteV3(value: {
  routeKey: { kind: string; market: string; assetType: string; capability: string };
  routeTarget: { providerId: string; upstreamSource: string };
}) {
  return (
    value.routeKey.kind === 'data' &&
    value.routeKey.market === 'CN' &&
    value.routeKey.assetType === 'ETF' &&
    value.routeKey.capability === 'CASH_DISTRIBUTION' &&
    value.routeTarget.providerId === 'official-dividends' &&
    value.routeTarget.upstreamSource === 'cn-etf-cash-notices'
  );
}
