import { z } from 'zod';
import { quoteSchema, fundNavSchema } from './market.js';

export const watchlistPricesInputSchema = z.strictObject({
  itemIds: z.array(z.uuid()).min(1).max(50),
  mode: z.enum(['actual', 'shadow']),
});
const price = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('quote'), quote: quoteSchema }),
  z.strictObject({ kind: z.literal('nav'), nav: fundNavSchema }),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.string().min(1) }),
]);
export const watchlistPricesSchema = z
  .array(
    z.strictObject({
      itemId: z.uuid(),
      held: z.boolean().nullable(),
      price,
      minRefreshSeconds: z.number().int().positive().optional(),
      quoteContext: z
        .strictObject({
          session: z.enum(['closed_snapshot', 'older_snapshot', 'trading', 'unknown']),
          evaluatedAt: z.iso.datetime({ offset: true }),
          nextBoundaryAt: z.iso.datetime({ offset: true }).optional(),
          calendarRevision: z.string().optional(),
          reason: z
            .enum([
              'calendar_unavailable',
              'source_time_unknown',
              'source_time_future',
              'calendar_no_session',
            ])
            .optional(),
        })
        .optional(),
    }),
  )
  .max(50);
export type WatchlistPrice = z.infer<typeof watchlistPricesSchema>[number];
