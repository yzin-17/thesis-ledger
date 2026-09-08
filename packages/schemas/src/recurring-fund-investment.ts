import { z } from 'zod';
import { currencyCodeSchema, positiveDecimalStringSchema } from './ledger-v2.js';

export const recurringFundInvestmentPlanStatuses = ['ACTIVE', 'PAUSED', 'ENDED'] as const;
export const recurringFundInvestmentOccurrenceStatuses = [
  'PENDING',
  'CONFIRMED',
  'SKIPPED',
] as const;

const planStatusSchema = z.enum(recurringFundInvestmentPlanStatuses);
const occurrenceStatusSchema = z.enum(recurringFundInvestmentOccurrenceStatuses);
const periodKeySchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, '月份必须使用 YYYY-MM');
const expectedVersionSchema = z.number().int().positive();

export const createRecurringFundInvestmentPlanSchema = z
  .object({
    accountId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{6}\.OF$/, '基金代码必须使用 000000.OF'),
    expectedAmount: positiveDecimalStringSchema,
    dayOfMonth: z.number().int().min(1).max(31),
    startPeriod: periodKeySchema,
    timezone: z.literal('Asia/Shanghai').default('Asia/Shanghai'),
  })
  .strict();

export const updateRecurringFundInvestmentPlanSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    name: z.string().trim().min(1).max(80).optional(),
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

export const recurringFundInvestmentStateCommandSchema = z
  .object({ expectedVersion: expectedVersionSchema })
  .strict();

export const confirmRecurringFundInvestmentOccurrenceSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    actualQuantity: positiveDecimalStringSchema,
    unitPrice: positiveDecimalStringSchema,
    commission: positiveDecimalStringSchema.optional(),
    occurredAt: z.iso.date(),
  })
  .strict();

export const skipRecurringFundInvestmentOccurrenceSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const reopenRecurringFundInvestmentOccurrenceSchema =
  recurringFundInvestmentStateCommandSchema;

export const recurringFundInvestmentPlanQuerySchema = z
  .object({ accountId: z.uuid().optional(), status: planStatusSchema.optional() })
  .strict();

export const recurringFundInvestmentOccurrenceQuerySchema = z
  .object({
    accountId: z.uuid().optional(),
    planId: z.uuid().optional(),
    status: occurrenceStatusSchema.optional(),
  })
  .strict();

export const recurringFundInvestmentPlanSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    name: z.string(),
    symbol: z.string(),
    fundName: z.string(),
    expectedAmount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    dayOfMonth: z.number().int().min(1).max(31),
    timezone: z.literal('Asia/Shanghai'),
    startPeriod: periodKeySchema,
    status: planStatusSchema,
    nextDueAt: z.iso.datetime().nullable(),
    version: expectedVersionSchema,
    pausedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const recurringFundInvestmentOccurrenceSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid(),
    accountId: z.uuid(),
    periodKey: periodKeySchema,
    planName: z.string(),
    symbol: z.string(),
    fundName: z.string(),
    scheduledFor: z.iso.datetime(),
    expectedAmount: positiveDecimalStringSchema,
    currency: currencyCodeSchema,
    status: occurrenceStatusSchema,
    actualQuantity: positiveDecimalStringSchema.nullable(),
    unitPrice: positiveDecimalStringSchema.nullable(),
    commission: positiveDecimalStringSchema.nullable(),
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

export const recurringFundInvestmentPlansResponseSchema = z.array(
  recurringFundInvestmentPlanSchema,
);
export const recurringFundInvestmentOccurrencesResponseSchema = z.array(
  recurringFundInvestmentOccurrenceSchema,
);

export type CreateRecurringFundInvestmentPlan = z.infer<
  typeof createRecurringFundInvestmentPlanSchema
>;
export type UpdateRecurringFundInvestmentPlan = z.infer<
  typeof updateRecurringFundInvestmentPlanSchema
>;
export type ConfirmRecurringFundInvestmentOccurrence = z.infer<
  typeof confirmRecurringFundInvestmentOccurrenceSchema
>;
export type RecurringFundInvestmentPlan = z.infer<typeof recurringFundInvestmentPlanSchema>;
export type RecurringFundInvestmentOccurrence = z.infer<
  typeof recurringFundInvestmentOccurrenceSchema
>;
