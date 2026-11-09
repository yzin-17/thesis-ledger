import { z } from 'zod';
export const marketSessionSchema = z.strictObject({
  state: z.enum(['open', 'closed', 'unknown']),
  tradingDayState: z.enum(['open', 'closed', 'unknown']),
  evaluatedAt: z.iso.datetime({ offset: true }),
  date: z.iso.date().optional(), market: z.enum(['CN', 'HK', 'US']).optional(), timezone: z.string().optional(),
  calendarRevision: z.string().optional(), latestTradingDate: z.iso.date().optional(),
  latestCompletedTradingDate: z.iso.date().optional(),
  nextBoundaryAt: z.iso.datetime({ offset: true }).optional(),
  reason: z.enum(['calendar_unavailable', 'calendar_incomplete', 'calendar_future', 'calendar_invalid']).optional(),
  sessions: z.array(z.strictObject({ tradingDate: z.iso.date(), startAt: z.iso.datetime({ offset: true }), endAt: z.iso.datetime({ offset: true }) })),
});
export type MarketSession = z.infer<typeof marketSessionSchema>;
