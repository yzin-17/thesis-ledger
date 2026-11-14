import { z } from 'zod';

export const arenaLiveTimelineSchema = z.strictObject({
  phase: z.enum(['replay', 'live']),
  status: z.enum(['ready', 'research', 'blocked']),
  originAt: z.iso.datetime(),
  cursorAt: z.iso.datetime(),
  pendingAt: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
});
export type ArenaLiveTimeline = z.infer<typeof arenaLiveTimelineSchema>;
