import { z } from 'zod';

export const automationJobSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  type: z.enum([
    'market-sync',
    'risk-evaluation',
    'daily-digest',
    'snapshot',
    'backup',
    'provider-health',
  ]),
  cron: z.string().min(5),
  timezone: z.string().default('Asia/Shanghai'),
  enabled: z.boolean(),
  retry: z.object({ maxAttempts: z.number().int().min(1), backoffMs: z.number().int().positive() }),
  lockTtlMs: z.number().int().positive(),
});
