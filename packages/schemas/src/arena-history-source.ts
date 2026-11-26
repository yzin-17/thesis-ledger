import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stamp = z.string().datetime({ offset: true });
const symbol = z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/);
const envelope = { contractVersion: z.literal(1), consumer: z.literal('thesis-ledger'), requestId: z.string().min(1), archiveRef: z.string().regex(/^arena-history\/[0-9a-f]{64}\.json$/) };
export const arenaHistoryCatalogSchema = z.object({ ...envelope, kind: z.literal('reconstructed-catalog'),
  market: z.literal('CN'), date: day, observedAt: stamp, providerId: z.literal('tushare'),
  providerVersion: z.number().int().nonnegative(), responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  items: z.array(z.object({ symbol, assetType: z.enum(['STOCK', 'ETF']), name: z.string().min(1), listedOn: day }).strict()).min(1),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.items.map((i) => i.symbol)).size !== value.items.length || value.items.some((i) => i.listedOn > value.date || i.name !== i.symbol))
    ctx.addIssue({ code: 'custom', message: '历史目录包含重复、未来或未认证名称' });
});
const minute = z.object({ timestamp: stamp, open: z.number().positive().finite(), high: z.number().positive().finite(),
  low: z.number().positive().finite(), close: z.number().positive().finite(), volume: z.number().nonnegative().nullable(),
  amount: z.number().nonnegative().nullable(), complete: z.boolean().nullable() }).strict();
export const arenaHistoryMinutesSchema = z.object({ ...envelope, kind: z.literal('reconstructed-minutes'), date: day,
  providerId: z.string().min(1), policyRevision: z.number().int().positive(),
  value: z.object({ symbol, assetType: z.enum(['STOCK', 'ETF']), market: z.literal('CN'), source: z.string().min(1),
    rows: z.array(minute).min(1).max(64000), observedAt: stamp, timezone: z.literal('Asia/Shanghai'), timeframe: z.enum(['1m', '5m', '15m', '30m', '60m']),
    timestampConvention: z.enum(['interval-start', 'interval-end']), session: z.literal('regular'),
    fieldUnits: z.object({ volume: z.enum(['hand', 'share', 'fund-unit', 'unknown']), amount: z.enum(['CNY', 'unknown']) }).strict(),
    responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
}).strict();
export type ArenaHistoryCatalog = z.infer<typeof arenaHistoryCatalogSchema>;
export type ArenaHistoryMinutes = z.infer<typeof arenaHistoryMinutesSchema>;
export const arenaHistoryInstrumentsSchema = z.object({ ...envelope, kind: z.literal('current-instrument-discovery'),
  historicalEligibility: z.literal('unverified'), market: z.literal('CN'), date: day, query: z.string().min(1).max(80),
  providerId: z.literal('hithink'), providerVersion: z.number().int().nonnegative(), observedAt: stamp,
  sourceTimestamp: z.number().int().positive(), responseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  items: z.array(z.object({ symbol, assetType: z.enum(['STOCK', 'ETF']), name: z.string() }).strict()).max(20),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.items.map((i) => i.symbol)).size !== value.items.length || value.items.some((i) => i.name !== i.symbol))
    ctx.addIssue({ code: 'custom', message: '证券身份重复或名称未经历史认证' });
});
export type ArenaHistoryInstruments = z.infer<typeof arenaHistoryInstrumentsSchema>;
