import { z } from 'zod';

export const localHistorySourceSchema = z
  .object({
    datasetId: z.string().min(1),
    symbols: z.array(z.string().min(1)),
    coverage: z
      .object({ start: z.iso.date(), end: z.iso.date() })
      .refine((value) => value.start <= value.end, '资料覆盖起点不能晚于终点'),
    scope: z
      .object({
        market: z.string().min(1),
        exchange: z.string().min(1),
        assetType: z.string().min(1),
        tradingMethod: z.string().min(1),
      })
      .optional(),
    updateMode: z.literal('bundled'),
    documents: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          url: z
            .string()
            .url()
            .refine((value) => /^https?:\/\//i.test(value), '原文链接仅支持 HTTP(S)'),
          publishedDate: z.iso.date().optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (value) => value.symbols.length > 0 || value.scope !== undefined,
    '资料必须声明覆盖标的或交易范围',
  );

export type LocalHistorySource = z.infer<typeof localHistorySourceSchema>;

export const providerUpstreamSourceSchema = z.object({
  sourceId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.record(z.string(), z.array(z.string().min(1))),
  localHistory: localHistorySourceSchema.optional(),
  documentCatalog: z.literal('announcements').optional(),
});
