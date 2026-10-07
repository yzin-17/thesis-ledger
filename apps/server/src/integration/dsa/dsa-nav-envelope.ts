import { z } from 'zod';

const text = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });
export const navEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal('nav-source-record-envelope-v1'),
  symbol: text,
  fundType: z.enum(['domestic', 'qdii']),
  capturedAt: instant,
  identity: z.strictObject({
    symbol: text,
    fundType: z.enum(['domestic', 'qdii']),
    sourceType: text,
    endpoint: z.literal('https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx'),
    readerRevision: z.literal('eastmoney-fund-identity-v1'),
    responseRaw: text,
    responseHash: hash,
    capturedAt: instant,
  }),
  navSource: z.strictObject({
    fundCode: z.string().regex(/^\d{6}$/),
    endpoint: z.literal('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList'),
    readerRevision: z.literal('eastmoney-fund-nav-raw-v1'),
    capturedAt: instant,
    totalCount: z.number().int().positive().max(100000),
    contentHash: hash,
    pages: z
      .array(
        z.strictObject({
          pageIndex: z.number().int().positive(),
          rawResponse: text,
          contentHash: hash,
        }),
      )
      .min(1)
      .max(100),
  }),
  records: z
    .array(
      z.strictObject({
        sourceRecordId: text,
        symbol: text,
        valuationDate: z.iso.date(),
        nav: z.string().regex(/^\d+(?:\.\d+)?$/),
        projectionRevision: z.literal('dsa-eastmoney-nav-record-v1'),
        nativeRecordRaw: text,
        nativeRecordHash: hash,
        sourcePageIndex: z.number().int().positive(),
      }),
    )
    .min(1),
  ruleDocument: z.strictObject({
    kind: z.enum(['research-config', 'fund-prospectus']),
    encoding: z.literal('base64'),
    raw: text,
    contentHash: hash,
    capturedAt: instant,
    readerRevision: text,
  }),
  ruleRaw: text,
  calendarRaw: text,
  assumptionRaw: text,
  calendarDecisionRaw: text,
});
export type NavEnvelope = z.infer<typeof navEnvelopeSchema>;
