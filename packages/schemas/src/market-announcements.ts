import { z } from 'zod';

export const marketAnnouncementSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
  title: z.string().min(1),
  url: z.url().refine((value) => /^https?:\/\//i.test(value)),
  publishedDate: z.iso.date(),
  fetchedAt: z.iso.datetime({ offset: true }).optional(),
  uses: z.array(z.enum(['suspension', 'risk'])),
  downloadState: z.enum(['pending', 'downloaded', 'failed']),
  parseState: z.enum(['unparsed', 'parsed', 'failed']),
  detail: z.string().optional(),
});
export const marketAnnouncementsSchema = z.object({
  providerId: z.literal('official-states'),
  items: z.array(marketAnnouncementSchema).max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
});
export type MarketAnnouncement = z.infer<typeof marketAnnouncementSchema>;
export type MarketAnnouncements = z.infer<typeof marketAnnouncementsSchema>;
