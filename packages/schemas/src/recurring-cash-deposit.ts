import { z } from 'zod';
import { currencyCodeSchema, positiveDecimalStringSchema } from './ledger-v2.js';

export const recurringCashDepositPlanStatuses = ['ACTIVE', 'PAUSED', 'ENDED'] as const;
export const recurringCashDepositOccurrenceStatuses = [
  'PENDING',
  'CONFIRMED',
  'SKIPPED',
] as const;

export const recurringCashDepositPlanStatusSchema = z.enum(recurringCashDepositPlanStatuses);
export const recurringCashDepositOccurrenceStatusSchema = z.enum(
  recurringCashDepositOccurrenceStatuses,
);

const periodKeySchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, '月份必须使用 YYYY-MM');
const planNameSchema = z.string().trim().min(1).max(80);
const expectedVersionSchema = z.number().int().positive();

export const createRecurringCashDepositPlanSchema = z
  .object({
    accountId: z.uuid(),
    name: planNameSchema,
    expectedAmount: positiveDecimalStringSchema,
    dayOfMonth: z.number().int().min(1).max(31),
    startPeriod: periodKeySchema,
    timezone: z.literal('Asia/Shanghai').default('Asia/Shanghai'),
  })
  .strict();

export const updateRecurringCashDepositPlanSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    name: planNameSchema.optional(),
    expectedAmount: positiveDecimalStringSchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.expectedAmount !== undefined ||
      input.dayOfMonth !== undefined,
    '至少修改一个计划字段',
  );

export const recurringCashDepositPlanStateCommandSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const confirmRecurringCashDepositOccurrenceSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    actualAmount: positiveDecimalStringSchema,
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const skipRecurringCashDepositOccurrenceSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const reopenRecurringCashDepositOccurrenceSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const recurringCashDepositPlanQuerySchema = z
  .object({
    accountId: z.uuid().optional(),
    status: recurringCashDepositPlanStatusSchema.optional(),
  })
  .strict();

export const recurringCashDepositOccurrenceQuerySchema = z
  .object({
    accountId: z.uuid().optional(),
    planId: z.uuid().optional(),
    status: recurringCashDepositOccurrenceStatusSchema.optional(),
  })
  .strict();

export const recurringCashDepositPlanSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    name: z.string(),
    expectedAmount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    dayOfMonth: z.number().int().min(1).max(31),
    timezone: z.literal('Asia/Shanghai'),
    startPeriod: periodKeySchema,
    status: recurringCashDepositPlanStatusSchema,
    nextDueAt: z.iso.datetime().nullable(),
    version: expectedVersionSchema,
    pausedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const recurringCashDepositOccurrenceSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid(),
    accountId: z.uuid(),
    periodKey: periodKeySchema,
    planName: z.string(),
    scheduledFor: z.iso.datetime(),
    expectedAmount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    status: recurringCashDepositOccurrenceStatusSchema,
    actualAmount: positiveDecimalStringSchema.nullable(),
    occurredAt: z.iso.datetime().nullable(),
    ledgerEventId: z.uuid().nullable(),
    ledgerFactId: z.uuid().nullable(),
    version: expectedVersionSchema,
    skippedReason: z.string().nullable(),
    confirmedAt: z.iso.datetime().nullable(),
    skippedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const recurringCashDepositPlansResponseSchema = z.array(recurringCashDepositPlanSchema);
export const recurringCashDepositOccurrencesResponseSchema = z.array(
  recurringCashDepositOccurrenceSchema,
);

export type CreateRecurringCashDepositPlan = z.infer<
  typeof createRecurringCashDepositPlanSchema
>;
export type UpdateRecurringCashDepositPlan = z.infer<
  typeof updateRecurringCashDepositPlanSchema
>;
export type ConfirmRecurringCashDepositOccurrence = z.infer<
  typeof confirmRecurringCashDepositOccurrenceSchema
>;
export type RecurringCashDepositPlan = z.infer<typeof recurringCashDepositPlanSchema>;
export type RecurringCashDepositOccurrence = z.infer<
  typeof recurringCashDepositOccurrenceSchema
>;
