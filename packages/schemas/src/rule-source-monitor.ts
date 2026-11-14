import { z } from 'zod';

export const ruleSourceMonitorVersion = 'rule-source-monitor-v1' as const;
export const ruleMonitorDefaultSchedule = '@every24h' as const;
const version = z.literal(ruleSourceMonitorVersion);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });
const identity = z.string().min(1).max(2048);
const sourceId = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/);
const sourceIds = z
  .array(sourceId)
  .max(9)
  .refine((value) => new Set(value).size === value.length, '来源不得重复');
export const ruleMonitorJobIdSchema = z.uuid();
export const ruleMonitorConfigSchema = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    sourceIds,
    taskCreated: z.boolean().default(false),
    cron: z.string().min(5).max(120).default(ruleMonitorDefaultSchedule),
    timezone: z.string().min(1).max(80).default('Asia/Shanghai'),
    nextRunAt: instant.nullable().default(null),
  })
  .refine((value) => !value.enabled || value.sourceIds.length > 0, '定期检查需选择来源');
export const ruleMonitorTaskSchema = z
  .strictObject({
    version,
    expectedRevision: z.number().int().nonnegative(),
    sourceIds,
  })
  .refine((value) => value.sourceIds.length > 0, '创建任务需选择来源');
export const ruleMonitorScheduleSchema = z.strictObject({
  version,
  expectedRevision: z.number().int().nonnegative(),
  cron: z.string().min(5).max(120),
  timezone: z.string().min(1).max(80),
});
export type RuleMonitorTask = z.infer<typeof ruleMonitorTaskSchema>;
export type RuleMonitorSchedule = z.infer<typeof ruleMonitorScheduleSchema>;
export const ruleMonitorConfigureSchema = z
  .strictObject({
    version,
    expectedRevision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    sourceIds,
  })
  .refine((value) => !value.enabled || value.sourceIds.length > 0, '定期检查需选择来源');
export const ruleMonitorCheckSchema = z
  .strictObject({ version, requestId: z.uuid(), sourceIds })
  .refine((value) => value.sourceIds.length > 0, '手动检查需选择来源');
export const ruleMonitorConfigResponseSchema = z.strictObject({
  version,
  config: ruleMonitorConfigSchema,
});
const error = z
  .enum([
    'lease_expired',
    'monitor_stopped',
    'monitor_execution_failed',
    'run_budget_exceeded',
    'document_url_invalid',
    'document_http_error',
    'document_too_large',
    'document_invalid',
    'document_unavailable',
  ])
  .nullable();
export const ruleMonitorJobSchema = z
  .strictObject({
    id: ruleMonitorJobIdSchema,
    status: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'interrupted']),
    attempt: z.number().int().min(0).max(1),
    sourceIds,
    createdAt: instant,
    startedAt: instant.nullable(),
    finishedAt: instant.nullable(),
    counts: z.strictObject({
      documents: z.number().int().nonnegative(),
      changed: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(),
    }),
    errorCode: error,
  })
  .superRefine((job, context) => {
    if (job.status === 'queued') {
      if (job.attempt !== 0 || job.startedAt !== null || job.finishedAt !== null)
        context.addIssue({ code: 'custom', message: '待检查任务不得具有已开始或终态事实' });
      return;
    }
    if (
      job.attempt !== 1 ||
      job.startedAt === null ||
      (job.status === 'running') !== (job.finishedAt === null)
    )
      context.addIssue({ code: 'custom', message: '检查任务状态与执行事实不一致' });
  });
export const ruleMonitorJobResponseSchema = z.strictObject({ version, run: ruleMonitorJobSchema });
export const ruleMonitorStatusSchema = z.strictObject({
  version,
  config: ruleMonitorConfigSchema,
  sources: z
    .array(
      z.strictObject({
        identity: sourceId,
        market: z.enum(['CN', 'HK', 'US']),
        name: z.string().min(1),
        datasetId: z.string().min(1),
        packHash: hash,
        documentCount: z.number().int().min(1).max(24),
      }),
    )
    .max(10),
  latestRun: ruleMonitorJobSchema.nullable(),
  observations: z
    .array(
      z.strictObject({
        kind: z.enum(['pack', 'document']),
        identity,
        name: z.string().min(1),
        contentHash: hash.nullable(),
        rawHash: hash.nullable(),
        datasetId: z.string().nullable(),
        lastCheckedAt: instant,
        lastSuccessAt: instant.nullable(),
        lastChangeAt: instant.nullable(),
        status: z.enum(['baseline', 'unchanged', 'changed', 'unavailable']),
        errorCode: error,
        versionCount: z.number().int().nonnegative(),
      }),
    )
    .max(64),
});
export const ruleMonitorVersionsSchema = z.strictObject({
  version,
  kind: z.enum(['pack', 'document']),
  identity,
  versions: z
    .array(
      z.strictObject({
        contentHash: hash,
        rawHash: hash.nullable(),
        datasetId: z.string().nullable(),
        firstSeenAt: instant,
        lastSeenAt: instant,
      }),
    )
    .max(20),
});
export type RuleMonitorStatus = z.infer<typeof ruleMonitorStatusSchema>;
export type RuleMonitorVersions = z.infer<typeof ruleMonitorVersionsSchema>;
export type RuleMonitorJob = z.infer<typeof ruleMonitorJobSchema>;
export type RuleMonitorConfigure = z.infer<typeof ruleMonitorConfigureSchema>;
export type RuleMonitorCheck = z.infer<typeof ruleMonitorCheckSchema>;

export const ruleMonitorHistorySchema = z.strictObject({
  version,
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  items: z
    .array(
      ruleMonitorJobSchema.safeExtend({
        trigger: z.enum(['manual', 'scheduled', 'unknown']),
        failureDetailsAvailable: z.boolean(),
        failures: z
          .array(
            z.strictObject({
              kind: z.enum(['pack', 'document']),
              identity,
              name: z.string().min(1),
              errorCode: error.unwrap(),
            }),
          )
          .max(33),
      }),
    )
    .max(100),
});
export type RuleMonitorHistory = z.infer<typeof ruleMonitorHistorySchema>;
