import { z } from 'zod';
import { automationJobSchema, automationJobUpdateSchema } from './automation.js';
import { omitUndefinedDeep } from './exact-optional.js';
export const automationCreateInputSchema = automationJobSchema
  .omit({ systemKey: true, managed: true })
  .strict();
export const automationUpdateInputSchema = automationJobUpdateSchema
  .strict()
  .refine((row) => Object.keys(row).length > 0, '请填写修改内容');
export const automationRecordSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    type: z.string(),
    cron: z.string(),
    timezone: z.string(),
    enabled: z.boolean().nullable(),
    nextRunAt: z.string().nullable(),
    systemKey: z.string().nullable().optional(),
    managed: z.boolean().optional(),
    retryPolicy: z.unknown().optional(),
    lockTtlMs: z.number().optional(),
    source: z.enum(['server', 'rule-monitor']).optional(),
    readError: z.string().optional(),
    scheduleLabel: z.string().optional(),
  })
  .transform(omitUndefinedDeep);
export const automationRunResultSchema = z
  .object({ skipped: z.boolean(), reason: z.string().optional(), output: z.unknown().optional() })
  .transform(omitUndefinedDeep);
export const automationHistoryRecordSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    status: z.string(),
    startedAt: z.string().nullable(),
    error: z.string().nullable(),
    output: z.unknown().optional(),
    finishedAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    jobName: z.string().optional(),
    source: z.enum(['server', 'rule-monitor']).optional(),
    summary: z.string().optional(),
  })
  .transform(omitUndefinedDeep);
export const automationHistoryPageSchema = z.object({
  items: z.array(automationHistoryRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  sourceWarnings: z
    .array(
      z.object({
        source: z.literal('rule-monitor'),
        code: z.literal('rule_monitor_unavailable'),
      }),
    )
    .optional(),
});
export const riskMonitoringEnableSchema = z.strictObject({ jobId: z.uuid().optional() });
export const riskMonitoringStatusSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    enabled: z.boolean(),
    cron: z.string(),
    timezone: z.string(),
    nextRunAt: z.iso.datetime().nullable(),
    lastRun: z
      .object({
        status: z.string(),
        startedAt: z.iso.datetime(),
        actual: z
          .object({
            contextCount: z.number(),
            events: z.number(),
            errors: z.number(),
            missing: z.number(),
          })
          .nullable(),
      })
      .nullable(),
  }),
);
export type AutomationRecord = z.infer<typeof automationRecordSchema>;
export type AutomationCreateInput = z.input<typeof automationCreateInputSchema>;
export type AutomationUpdateInput = z.input<typeof automationUpdateInputSchema>;
export type AutomationHistoryRecord = z.infer<typeof automationHistoryRecordSchema>;
export type AutomationHistoryPage = z.infer<typeof automationHistoryPageSchema>;
