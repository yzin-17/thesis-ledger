import { z } from 'zod';
import { marketRouteKeyV3Schema } from './market-route-v3.js';
const text = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const isoDate = z.iso.date();

export const backtestPreflightPurposeV3Schema = z.enum([
  'signal',
  'execution',
  'benchmark',
  'fx',
  'corporateActions',
  'calendar',
  'instrumentFacts',
  'nav',
]);
export type BacktestPreflightPurposeV3 = z.infer<typeof backtestPreflightPurposeV3Schema>;

export const backtestPreflightDateRangeV3Schema = z
  .strictObject({ startDate: isoDate, endDate: isoDate })
  .refine((range) => range.startDate <= range.endDate, {
    path: ['endDate'],
    message: 'endDate 不得早于 startDate',
  });
export type BacktestPreflightDateRangeV3 = z.infer<typeof backtestPreflightDateRangeV3Schema>;

export const backtestPreflightRequirementV3Schema = z
  .strictObject({
    symbol: text.nullable(),
    capability: text,
    purpose: backtestPreflightPurposeV3Schema,
    dateRange: backtestPreflightDateRangeV3Schema,
    routeKey: marketRouteKeyV3Schema.nullable(),
  })
  .superRefine((requirement, context) => {
    if (requirement.routeKey && requirement.routeKey.capability !== requirement.capability) {
      context.addIssue({
        code: 'custom',
        path: ['capability'],
        message: 'capability 必须与精确 RouteKey 一致',
      });
    }
  });
export type BacktestPreflightRequirementV3 = z.infer<typeof backtestPreflightRequirementV3Schema>;

export const backtestPreflightTargetSourceV3Schema = z.strictObject({
  providerId: text,
  upstreamSource: text,
  routeIndex: z.number().int().min(0).max(1),
});
export type BacktestPreflightTargetSourceV3 = z.infer<typeof backtestPreflightTargetSourceV3Schema>;

export const targetSourcesSchema = z
  .array(backtestPreflightTargetSourceV3Schema)
  .max(2)
  .superRefine((targets, context) => {
    const seen = new Set<number>();
    targets.forEach((target, index) => {
      if (seen.has(target.routeIndex)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'routeIndex'],
          message: 'target sequence 中 routeIndex 不能重复',
        });
      }
      seen.add(target.routeIndex);
      if (target.routeIndex !== index) {
        context.addIssue({
          code: 'custom',
          path: [index, 'routeIndex'],
          message: 'target sequence 必须按 Desired 顺序连续编号',
        });
      }
    });
  });

const targetSequenceSchema = z.strictObject({
  requirement: backtestPreflightRequirementV3Schema,
  targets: targetSourcesSchema,
});

export const backtestPreflightRevisionStampV3Schema = z.strictObject({
  strategyVersionId: text,
  strategyContentHash: sha256,
  runConfigChecksum: sha256,
  desiredRevision: z.number().int().positive().nullable(),
  effectiveRevision: z.number().int().positive().nullable(),
  catalogRevision: z.number().int().nonnegative().nullable(),
  targetSequences: z.array(targetSequenceSchema).min(1),
});
export type BacktestPreflightRevisionStampV3 = z.infer<
  typeof backtestPreflightRevisionStampV3Schema
>;

export const backtestPreflightRequestV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  requestId: text,
  strategyVersionId: text,
  strategyContentHash: sha256,
  runConfigChecksum: sha256,
  requirements: z.array(backtestPreflightRequirementV3Schema).min(1),
});
export type BacktestPreflightRequestV3 = z.infer<typeof backtestPreflightRequestV3Schema>;
