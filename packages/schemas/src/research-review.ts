import { z } from 'zod';
import { researchHistoricalScopeV2Schema } from './research-scope-v2.js';
import {
  RESEARCH_OBSERVATION_METHOD,
  researchObservationAttemptSchema,
  researchObservationVersionSchema,
  researchObservationReasonSchema,
  researchObservationCutoffInputSchema,
} from './research-observation.js';
import { compareMarketPitEvidenceInstantStringsV1 as compareEvidenceInstants } from './market-pit-evidence-instant-v1.js';

const instant = z.iso
  .datetime({ offset: true })
  .refine((value) => compareEvidenceInstants(value, value) === 0, '复核时刻必须具备明确时区');
export const researchObservationSubmissionSchema = z.strictObject({
  submissionId: z.uuid().transform((value) => value.toLowerCase()),
  claimId: z.string().min(1).max(80),
  asOf: researchObservationCutoffInputSchema,
});
export const researchObservationStatisticsSchema = z
  .strictObject({
    methodVersion: z.literal(RESEARCH_OBSERVATION_METHOD),
    coverage: z.enum(['complete', 'truncated']),
    samples: z.number().int().nonnegative(),
    dueSamples: z.number().int().nonnegative(),
    dueUnknownSamples: z.number().int().nonnegative(),
    calculatedSamples: z.number().int().nonnegative(),
    notDueSamples: z.number().int().nonnegative(),
    notApplicableSamples: z.number().int().nonnegative(),
    matchedSamples: z.number().int().nonnegative(),
    exclusions: z.array(
      z.strictObject({
        reason: researchObservationReasonSchema,
        count: z.number().int().positive(),
      }),
    ),
    sampleStatus: z.enum(['insufficient', 'descriptive_only', 'incomplete']),
    directionMatchRate: z
      .string()
      .regex(/^(?:0|1|0\.\d+)$/)
      .nullable(),
    returnBasis: z.literal('economic-close'),
  })
  .superRefine((value, context) => {
    if (
      value.calculatedSamples > value.dueSamples ||
      value.matchedSamples > value.calculatedSamples ||
      value.dueSamples > value.samples ||
      value.dueSamples +
        value.dueUnknownSamples +
        value.notDueSamples +
        value.notApplicableSamples !==
        value.samples ||
      (value.calculatedSamples < 20 && value.directionMatchRate !== null) ||
      (value.coverage === 'truncated' && value.directionMatchRate !== null)
    )
      context.addIssue({ code: 'custom', message: '复核分母、样本限制或覆盖状态不一致' });
  });
export const researchReportObservationsSchema = z
  .strictObject({
    version: z.literal('research-observations-v1'),
    reportId: z.uuid(),
    historicalScope: researchHistoricalScopeV2Schema,
    asOf: instant,
    availability: z.enum(['available', 'not_applicable', 'unavailable']),
    issues: z.array(z.string().min(1).max(300)).max(10),
    items: z
      .array(
        z.strictObject({
          id: z.uuid().nullable(),
          claimId: z.string().min(1).max(80),
          instrumentId: z.uuid().nullable(),
          direction: z.enum(['up', 'down']).nullable(),
          tradingDays: z.union([z.literal(5), z.literal(20)]).nullable(),
          current: researchObservationVersionSchema.nullable(),
        }),
      )
      .max(100),
    statistics: researchObservationStatisticsSchema,
  })
  .superRefine((value, context) => {
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (value.availability === 'available' && value.historicalScope.status !== 'known')
      reject('自动复核必须记录原报告范围');
    if (value.availability !== 'available' && (value.items.length || !value.issues.length))
      reject('不可自动复核时必须说明原因且不提供观察项');
    if (new Set(value.items.map((item) => item.claimId)).size !== value.items.length)
      reject('观察断言不能重复');
    for (const item of value.items) {
      if (
        item.current &&
        (item.id !== item.current.observationId ||
          item.tradingDays !== item.current.evaluation.window.tradingDays)
      )
        reject('观察版本与逻辑观察或窗口不一致');
      if (
        item.current &&
        (compareEvidenceInstants(item.current.inputs.visibleAt, value.asOf) ?? 1) > 0
      )
        reject('当前投影不能使用截止时点以后的观察版本');
    }
  });
export const researchObservationSubmissionResultSchema = z.strictObject({
  reportId: z.uuid(),
  historicalScope: researchHistoricalScopeV2Schema,
  claimId: z.string().min(1).max(80),
  attempt: researchObservationAttemptSchema,
});
export const researchObservationHistorySchema = z
  .strictObject({
    reportId: z.uuid(),
    historicalScope: researchHistoricalScopeV2Schema,
    observationId: z.uuid(),
    versions: z.array(researchObservationVersionSchema).max(100),
    truncated: z.boolean(),
  })
  .refine(
    (value) => value.versions.every((entry) => entry.observationId === value.observationId),
    '历史版本不得指向其他逻辑观察',
  );
export type ResearchObservationSubmissionInput = z.infer<
  typeof researchObservationSubmissionSchema
>;
export type ResearchReportObservations = z.infer<typeof researchReportObservationsSchema>;
export type ResearchObservationStatistics = z.infer<typeof researchObservationStatisticsSchema>;
