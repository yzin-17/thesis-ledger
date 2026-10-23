import { z } from 'zod';
import { researchFingerprintV2Schema } from './research-evidence-v2.js';
import { compareMarketPitEvidenceInstantStringsV1 as compareEvidenceInstants } from './market-pit-evidence-instant-v1.js';

export const RESEARCH_OBSERVATION_METHOD = 'research-price-direction-v1' as const;
const instant = z.iso
  .datetime({ offset: true })
  .refine((value) => compareEvidenceInstants(value, value) === 0, '复核时刻必须具备明确时区');
export const researchObservationCutoffInputSchema = instant.transform((value) =>
  new Date(value).toISOString(),
);
const decimal = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(100);
const day = z.iso.date();
export const researchObservationStatusSchema = z.enum([
  'not_due',
  'insufficient_data',
  'completed',
  'not_applicable',
]);
export const researchObservationReasonSchema = z.enum([
  'ambiguous_claims',
  'unsupported_claim',
  'legacy_result',
  'result_unavailable',
  'calendar_unqualified',
  'calendar_incomplete',
  'calendar_unavailable',
  'not_due',
  'price_unavailable',
  'price_missing',
  'suspended',
  'price_basis_unknown',
  'price_basis_mismatch',
  'coverage_incomplete',
  'source_unavailable',
]);
export const researchObservationWindowSchema = z.strictObject({
  tradingDays: z.union([z.literal(5), z.literal(20)]).nullable(),
  startSession: day.nullable(),
  endSession: day.nullable(),
  startCloseAt: instant.nullable(),
  endCloseAt: instant.nullable(),
});
export const researchObservationEvaluationSchema = z
  .strictObject({
    status: researchObservationStatusSchema,
    reasons: z.array(researchObservationReasonSchema).max(20),
    window: researchObservationWindowSchema,
    economic: z.strictObject({
      basis: z.literal('economic-close'),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable(),
      startPrice: decimal.nullable(),
      endPrice: decimal.nullable(),
      returnRate: decimal.nullable(),
      directionMatched: z.boolean().nullable(),
    }),
  })
  .superRefine((value, context) => {
    const fail = (message: string) => context.addIssue({ code: 'custom', message });
    const { window, economic } = value;
    const hasWindow = [
      window.startSession,
      window.endSession,
      window.startCloseAt,
      window.endCloseAt,
    ].every((entry) => entry !== null);
    if (value.status === 'completed') {
      if (
        !window.tradingDays ||
        !hasWindow ||
        value.reasons.length ||
        Object.values(economic).some((entry) => entry === null)
      )
        fail('完成观察必须具备固定窗口、两端价格及经济结果');
      if (Number(economic.startPrice) <= 0 || Number(economic.endPrice) <= 0)
        fail('复核价格必须为正数');
    } else {
      if (!value.reasons.length) fail('未完成观察必须保留原因');
      if (economic.returnRate !== null || economic.directionMatched !== null)
        fail('未完成观察不能提供收益或方向判断');
    }
    if (
      hasWindow &&
      (window.startSession! >= window.endSession! ||
        (compareEvidenceInstants(window.startCloseAt!, window.endCloseAt!) ?? 0) >= 0)
    )
      fail('观察终点必须严格晚于第零日');
  });
export const researchObservationInputsSchema = z
  .strictObject({
    visibleAt: instant,
    calendar: z.json(),
    prices: z.json(),
  })
  .refine((value) => JSON.stringify(value).length <= 200_000, '观察输入超过保存预算');
export const researchObservationVersionSchema = z
  .strictObject({
    id: z.uuid(),
    observationId: z.uuid(),
    inputFingerprint: researchFingerprintV2Schema,
    recordedAt: instant,
    inputs: researchObservationInputsSchema,
    evaluation: researchObservationEvaluationSchema,
  })
  .superRefine((value, context) => {
    const end = value.evaluation.window.endCloseAt;
    if (end === null) return;
    const order = compareEvidenceInstants(end, value.inputs.visibleAt);
    const due = order !== undefined && order <= 0;
    if (
      order === undefined ||
      (value.evaluation.status === 'completed' && !due) ||
      (value.evaluation.status === 'not_due' && due)
    )
      context.addIssue({ code: 'custom', message: '观察状态与输入截止时点不一致' });
  });
export const researchObservationAttemptSchema = z
  .strictObject({
    submissionId: z.uuid(),
    observationId: z.uuid(),
    state: z.enum(['pending', 'succeeded', 'failed']),
    expiresAt: instant,
    errorCode: z.enum(['attempt_expired', 'data_read_failed']).nullable(),
    version: researchObservationVersionSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      (value.state === 'succeeded') !== (value.version !== null) ||
      (value.state === 'failed') !== (value.errorCode !== null)
    )
      context.addIssue({ code: 'custom', message: '提交状态与结果版本不一致' });
    if (value.version && value.version.observationId !== value.observationId)
      context.addIssue({ code: 'custom', message: '提交不得指向其他逻辑观察' });
  });
export type ResearchObservationEvaluation = z.infer<typeof researchObservationEvaluationSchema>;
export type ResearchObservationInputs = z.infer<typeof researchObservationInputsSchema>;
export type ResearchObservationVersion = z.infer<typeof researchObservationVersionSchema>;
export type ResearchObservationAttempt = z.infer<typeof researchObservationAttemptSchema>;
