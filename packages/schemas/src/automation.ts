import { z } from 'zod';

export const automationJobTypes = [
  'market-sync',
  'risk-evaluation',
  'daily-digest',
  'snapshot',
  'backup',
  'provider-health',
] as const;

export const automationJobTypeSchema = z.enum(automationJobTypes);
export type AutomationJobType = z.infer<typeof automationJobTypeSchema>;

export const marketAutomationJobTypes = [
  'market-sync',
  'risk-evaluation',
  'daily-digest',
  'snapshot',
] as const satisfies readonly AutomationJobType[];

const marketAutomationJobTypeSet = new Set<AutomationJobType>(marketAutomationJobTypes);

export const isMarketAutomationJobType = (type: AutomationJobType) =>
  marketAutomationJobTypeSet.has(type);

export const automationJobSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  type: automationJobTypeSchema,
  cron: z.string().min(5),
  timezone: z.string().default('Asia/Shanghai'),
  enabled: z.boolean(),
  retry: z.object({ maxAttempts: z.number().int().min(1), backoffMs: z.number().int().positive() }),
  lockTtlMs: z.number().int().positive(),
});
