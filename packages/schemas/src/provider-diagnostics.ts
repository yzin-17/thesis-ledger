import { z } from 'zod';
import { omitUndefinedDeep } from './exact-optional.js';
import { providerHealthDetailsSchema } from './provider-health-details.js';
export {
  providerHealthDetailsSchema,
  providerProbeDetailsSchema,
} from './provider-health-details.js';
export const providerHealthRecordSchema = z
  .object({
    provider: z.string(),
    state: z.string(),
    errorCode: z.string().nullish(),
    latencyMs: z.number().nullable(),
    checkedAt: z.string(),
    source: z.string().optional(),
    details: providerHealthDetailsSchema.nullish().transform((value) => value ?? undefined),
  })
  .transform(omitUndefinedDeep);
export type ProviderHealthRecord = z.infer<typeof providerHealthRecordSchema>;
export const providerHealthPageSchema = z.object({
  items: z.array(providerHealthRecordSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const providerIssueRecordSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    symbol: z.string().nullable(),
    severity: z.string(),
    code: z.string(),
    status: z.string(),
    capability: z.string().optional(),
    detectedAt: z.string().optional(),
    details: z.record(z.string(), z.unknown()).nullable(),
  })
  .transform(omitUndefinedDeep);
export const notificationFailureRecordSchema = z
  .object({
    id: z.string(),
    provider: z.string(),
    status: z.string(),
    lastError: z.string().nullable(),
  })
  .transform(omitUndefinedDeep);
