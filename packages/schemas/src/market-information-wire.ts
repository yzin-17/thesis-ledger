import { z } from 'zod';
import { marketAnnouncementSymbolSchema } from './market-announcements.js';
export const marketAnnouncementQuerySchema = z
  .object({
    symbol: marketAnnouncementSymbolSchema.optional(),
    start: z.iso.date().optional(),
    end: z.iso.date().optional(),
    q: z.string().max(200).default(''),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .strict().refine(v => !v.start || !v.end || v.start <= v.end, '公告日期范围无效');
export type MarketAnnouncementQuery = z.input<typeof marketAnnouncementQuerySchema>;
