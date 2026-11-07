import { z } from 'zod';

import { marketQuoteSymbolSchema } from './market-quote-identity.js';

const id = z.uuid();
const revision = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(60);
const exchange = z.enum(['SH', 'SZ', 'BJ', 'HK', 'US', 'OF']);
const kind = z.enum(['STOCK', 'ETF', 'MUTUAL_FUND']);

export const watchlistInstrumentSchema = z
  .strictObject({
    id,
    canonicalCode: z.string().min(1),
    market: exchange,
    instrumentType: kind,
    active: z.boolean(),
  })
  .refine(
    (v) => (v.instrumentType === 'MUTUAL_FUND') === (v.market === 'OF'),
    '场外基金须使用场外市场身份',
  )
  .refine(
    (v) =>
      v.market === 'OF'
        ? /^\d{6}$/.test(v.canonicalCode)
        : marketQuoteSymbolSchema.safeParse(v.canonicalCode + '.' + v.market).success,
    '代码与市场不匹配',
  );
export const watchlistItemSchema = z.strictObject({
  id,
  displayName: z.string().min(1),
  instrument: watchlistInstrumentSchema,
  groupId: id.nullable(),
  pinned: z.boolean(),
  order: z.number().int(),
  addedAt: z.iso.datetime(),
});
export const watchlistGroupSchema = z.strictObject({ id, name });
export const watchlistPageQuerySchema = z.strictObject({
  group: z.union([id, z.literal('ungrouped')]).optional(),
  market: exchange.optional(),
  instrumentType: kind.optional(),
  offset: z.coerce.number().int().nonnegative().max(2147483647).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export const watchlistPageSchema = z.strictObject({
  revision,
  items: z.array(watchlistItemSchema).max(50),
  groups: z.array(watchlistGroupSchema),
  nextOffset: z.number().int().positive().nullable(),
});
export const watchlistAddSchema = z.strictObject({ instrumentId: id, groupId: id.optional() });
export const watchlistChangeSchema = z
  .discriminatedUnion('action', [
    z.strictObject({ action: z.literal('createGroup'), name, revision }),
    z.strictObject({ action: z.literal('renameGroup'), groupId: id, name, revision }),
    z.strictObject({ action: z.literal('deleteGroup'), groupId: id, revision }),
    z.strictObject({ action: z.literal('remove'), itemId: id, revision }),
    z.strictObject({
      action: z.literal('place'),
      itemId: id,
      groupId: id.nullable(),
      pinned: z.boolean(),
      beforeId: id.nullable(),
      revision,
    }),
  ])
  .refine((v) => v.action !== 'place' || v.beforeId !== v.itemId, '条目不能排在自身之前');
export const watchlistMutationSchema = z.strictObject({ revision });
export const watchlistConflictSchema = z.object({
  code: z.literal('WATCHLIST_REVISION_CONFLICT'),
  currentRevision: revision,
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type WatchlistPage = z.infer<typeof watchlistPageSchema>;
export type WatchlistQuery = z.input<typeof watchlistPageQuerySchema>;
export type WatchlistChange = z.infer<typeof watchlistChangeSchema>;
