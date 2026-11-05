import { z } from 'zod';
import { tradeListQuerySchema } from './trade-api.js';

export const tradeInstrumentsQuerySchema = tradeListQuerySchema.pick({
  mode: true,
  accountId: true,
});
export const tradeInstrumentsResponseSchema = z
  .object({
    mode: z.enum(['actual', 'shadow']),
    accountId: z.uuid().nullable(),
    items: z.array(
      z.object({ symbol: z.string().min(1), displayName: z.string().min(1) }).strict(),
    ),
  })
  .strict();
export type TradeInstrumentsQueryInput = z.input<typeof tradeInstrumentsQuerySchema>;
export type TradeInstrumentsQuery = z.infer<typeof tradeInstrumentsQuerySchema>;
export type TradeInstrumentsResponse = z.infer<typeof tradeInstrumentsResponseSchema>;
