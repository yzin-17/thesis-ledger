import { z } from 'zod';
export const marketAnnouncementQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export type MarketAnnouncementQuery = z.input<typeof marketAnnouncementQuerySchema>;
