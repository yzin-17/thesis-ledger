import { z } from 'zod';

export const marketAnnouncementPreparationSchema = z.strictObject({
  status: z.enum(['preparing', 'ready']),
  jobIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(1805),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  downloaded: z.number().int().nonnegative(),
  parsed: z.number().int().nonnegative(),
  errors: z.array(z.object({ stage: z.string(), reason: z.string() })).max(20),
}).superRefine((value, context) => {
  if (value.completed > value.total || value.failed > value.completed ||
      (value.status === 'ready' && value.completed !== value.total)) {
    context.addIssue({ code: 'custom', message: '公告准备进度无效' });
  }
});
export type MarketAnnouncementPreparation = z.infer<typeof marketAnnouncementPreparationSchema>;
