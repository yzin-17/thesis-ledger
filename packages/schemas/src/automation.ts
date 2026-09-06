import { z } from 'zod';

export const automationJobTypes = [
  'market-sync',
  'risk-evaluation',
  'daily-digest',
  'snapshot',
  'backup',
  'provider-health',
  'cash-deposit-materialization',
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

/** 任务类型创建后绑定运行时处理器，不可更新；retry/lockTtl 不对外暴露编辑。 */
export const automationJobUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  cron: z.string().min(5).optional(),
  timezone: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});
