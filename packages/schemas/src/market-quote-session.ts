import { z } from 'zod';
import { marketSessionSchema } from './market-session.js';

export const marketQuoteSessionSchema = z.strictObject({
  session: z.enum(['closed_snapshot', 'older_snapshot', 'trading', 'unknown']),
  evaluatedAt: z.iso.datetime({ offset: true }),
  nextBoundaryAt: z.iso.datetime({ offset: true }).optional(),
  calendarRevision: z.string().optional(),
  latestTradingDate: z.iso.date().optional(),
  marketSession: marketSessionSchema.optional(),
  reason: z.enum([
    'calendar_unavailable', 'calendar_incomplete', 'source_time_unknown',
    'source_time_future', 'calendar_no_session', 'calendar_future', 'calendar_invalid',
  ]).optional(),
});
export type MarketQuoteSession = z.infer<typeof marketQuoteSessionSchema>;
