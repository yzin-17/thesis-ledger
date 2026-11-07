import { z } from 'zod';
import { omitUndefinedDeep } from './exact-optional.js';
const time = z.iso.datetime({ offset: true });
const threshold = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .refine(Number.isFinite);
export const riskRuleResponseSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    kind: z.string().min(1),
    scope: z.enum(['security', 'account', 'portfolio']),
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    threshold,
    enabled: z.boolean(),
    needsRepair: z.boolean(),
    repairReason: z.string().nullable(),
    archivedAt: time.nullable(),
    symbol: z.string().nullable(),
    accountId: z.uuid().nullable(),
    assetName: z.string().nullable().optional(),
    effectiveAt: time,
    sourcePlanId: z.uuid().nullable().optional(),
    parameters: z.record(z.string(), z.unknown()).nullable().optional(),
    condition: z.record(z.string(), z.unknown()).nullable().optional(),
    config: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough()
  .transform(omitUndefinedDeep);
export const riskRulesResponseSchema = z.array(riskRuleResponseSchema);
export const riskTestResultsResponseSchema = z.array(
  z
    .object({
      triggered: z.boolean(),
      id: z.string().optional(),
      ruleId: z.string().optional(),
      severity: z.string().optional(),
      message: z.string().optional(),
      evaluatedAt: time.optional(),
      context: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
    .transform(omitUndefinedDeep),
);
export const riskScanResponseSchema = z
  .object({
    traceId: z.uuid(),
    scanId: z.uuid(),
    results: z.array(
      z
        .object({
          ruleId: z.uuid(),
          eventId: z.uuid().optional(),
          error: z.string().optional(),
          errorCode: z
            .enum(['input-unavailable', 'evaluation-failed', 'notification-enqueue-failed'])
            .optional(),
        })
        .passthrough()
        .transform(omitUndefinedDeep),
    ),
  })
  .passthrough();
export const riskAuditResponseSchema = z.array(
  z
    .object({
      id: z.uuid(),
      action: z.string(),
      ruleVersion: z.number().int().positive(),
      createdAt: time,
      actor: z.string().nullable().optional(),
      before: z.record(z.string(), z.unknown()).nullable().optional(),
      after: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .passthrough()
    .transform(omitUndefinedDeep),
);
export const riskNotificationsResponseSchema = z.array(
  z
    .object({
      id: z.uuid(),
      subjectId: z.string(),
      subjectType: z.string(),
      channel: z.string(),
      severity: z.string(),
      status: z.string(),
      attemptCount: z.number().int().nonnegative(),
      scheduledAt: time,
      lastError: z.string().nullable(),
    })
    .passthrough(),
);
export const notificationRoutingResponseSchema = z
  .object({
    routes: z.array(z.object({ channel: z.string(), provider: z.string() }).passthrough()),
  })
  .passthrough();
export type RiskRuleWire = z.infer<typeof riskRuleResponseSchema>;
export type RiskTestResultsWire = z.infer<typeof riskTestResultsResponseSchema>;

export const riskMonitoringSourceSchema = z.object({
  symbol: z.string(),
  assetName: z.string().optional(),
  assetType: z.string(),
  acquisition: z.string(),
  reason: z.string(),
  provider: z.string().nullable(),
  minIntervalSeconds: z.number().nullable(),
  sourceUpdateIntervalSeconds: z.number().nullable(),
  sourceTime: z.string().nullable(),
  fetchedAt: time.nullable(),
  nextAttemptAt: time.nullable(),
});
export const riskAutomaticMonitoringStatusSchema = z.object({
  mode: z.literal('observed-data'),
  continuousSource: z.literal(false),
  eligibleRules: z.number().int().nonnegative(),
  futureRules: z.number().int().nonnegative(),
  unsupportedRules: z.number().int().nonnegative(),
  checkedAt: time.nullable(),
  evaluatedAt: time.nullable(),
  gapAt: time.nullable(),
  missingPrices: z.number().int().nonnegative(),
  inputUnavailable: z.number().int().nonnegative().default(0),
  inputReason: z.string().nullable().default(null),
  delayedPrices: z.number().int().nonnegative(),
  processorAvailable: z.boolean(),
  error: z.string().nullable(),
  limitation: z.string(),
  acquisitionCheckedAt: time.nullable().default(null),
  acquisitionAvailable: z.boolean().default(false),
  sources: z.array(riskMonitoringSourceSchema).default([]),
});
