import { z } from 'zod';
import { quoteSchema, fundNavSchema } from './market.js';
import { marketQuoteSessionSchema } from './market-quote-session.js';

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
      quoteContext: marketQuoteSessionSchema.optional(),
    }),
  )
  .max(50);
export type WatchlistPrice = z.infer<typeof watchlistPricesSchema>[number];
