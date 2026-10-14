import { z } from 'zod';
import {
  decimalStringSchema,
  currencyCodeSchema,
  positiveDecimalStringSchema,
} from './monetary-values.js';
import { tradeDetailResponseSchema } from './trade-api.js';
import { journalBehaviorEvidenceSchema } from './journal-review-behavior.js';
import { journalAnalysisDraftSchema } from './journal-analysis-draft.js';
import { journalAiSnapshotMetadataSchema } from './journal-review-ai-metadata.js';

const id = z.string().trim().min(1);
const instant = z.iso.datetime({ offset: true });
const revision = z.string().regex(/^\d+$/);
export const journalStatisticsExclusionReasonSchema = z.enum([
  'ACTIVE_TRADE',
  'NON_SELL_ENDING',
  'UNKNOWN_OPENED_AT',
  'ESTIMATED_COST',
  'COST_CONFLICT',
  'FX_MISSING',
  'EVIDENCE_INCOMPLETE',
  'STALE_PROJECTION',
  'LEGACY_UNCONFIRMED',
]);
export const journalStatisticsEligibilitySchema = z
  .object({
    eligible: z.boolean(),
    reasons: z.array(journalStatisticsExclusionReasonSchema),
  })
  .strict()
  .refine((value) => value.eligible === (value.reasons.length === 0), '统计资格与排除原因不一致');

export const journalReviewObjectReferenceSchema = z
  .discriminatedUnion('reviewObjectType', [
    z
      .object({ reviewObjectType: z.literal('TRADE_CYCLE'), reviewObjectId: id, tradeId: id })
      .strict(),
    z
      .object({
        reviewObjectType: z.literal('CLOSE_SLICE'),
        reviewObjectId: id,
        tradeId: id,
        closeSliceId: id,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    const sourceId = value.reviewObjectType === 'TRADE_CYCLE' ? value.tradeId : value.closeSliceId;
    if (value.reviewObjectId !== `${value.reviewObjectType}:${sourceId}`)
      context.addIssue({
        code: 'custom',
        path: ['reviewObjectId'],
        message: '复盘对象 ID 与对象类型及来源不一致',
      });
  });

export const journalReviewEvidenceProjectionSchema = z
  .object({
    ledgerRevision: revision,
    projectionGeneration: revision,
    projectionFingerprint: id,
    evidenceFingerprint: id,
    factIds: z.array(z.uuid()),
    eventIds: z.array(z.uuid()),
    fxEvidenceVersion: id.nullable(),
    conversionFingerprint: id.nullable(),
  })
  .strict();

export const journalDecimalPlanSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    tradeId: id.nullable(),
    symbol: id,
    side: id.nullable(),
    plannedEntry: decimalStringSchema.nullable(),
    plannedExit: decimalStringSchema.nullable(),
    stopLoss: decimalStringSchema.nullable(),
    takeProfit: decimalStringSchema.nullable(),
    targetWeight: decimalStringSchema.nullable(),
    expectedHoldingDays: z.number().int().nonnegative().nullable(),
    plannedEntryAt: instant.nullable(),
    plannedExitAt: instant.nullable(),
    reason: z.string().nullable(),
    thesis: z.string().nullable(),
    association: z
      .object({
        kind: z.enum(['DIRECT_TRADE', 'JOURNAL_EVENT']),
        journalEntryIds: z.array(z.uuid()),
        eventIds: z.array(z.uuid()),
        references: z
          .array(
            z
              .object({
                journalEntryId: z.uuid(),
                ledgerEventId: z.uuid(),
                tradePlanId: z.uuid(),
                accountId: z.uuid(),
              })
              .strict(),
          )
          .default([]),
      })
      .strict()
      .default({ kind: 'DIRECT_TRADE', journalEntryIds: [], eventIds: [], references: [] }),
    status: id,
  })
  .strict();

export const journalFxEvidenceSchema = z
  .object({
    fromCurrency: currencyCodeSchema,
    toCurrency: currencyCodeSchema,
    rate: positiveDecimalStringSchema,
    observedAt: instant,
    source: id,
    version: id,
  })
  .strict();

export const journalReviewNoteSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    entryType: id,
    ledgerEventId: z.uuid().nullable(),
    tradePlanId: z.uuid().nullable(),
    symbol: id.nullable(),
    side: id.nullable(),
    reason: z.string(),
    content: z.string().nullable(),
    thesis: z.string().nullable(),
    catalyst: z.string().nullable(),
    risk: z.string().nullable(),
    exitReason: z.string().nullable(),
    emotion: z.string().nullable(),
    notes: z.string().nullable(),
    tags: z.unknown().nullable(),
    createdAt: instant,
  })
  .strict();

function planAssociationValid(
  plan: z.infer<typeof journalDecimalPlanSchema>,
  tradeId: string,
  eventIds: ReadonlySet<string>,
) {
  if (plan.association.kind === 'DIRECT_TRADE')
    return (
      plan.tradeId === tradeId &&
      plan.association.journalEntryIds.length === 0 &&
      plan.association.eventIds.length === 0 &&
      plan.association.references.length === 0
    );
  if (plan.tradeId !== null && plan.tradeId !== tradeId) return false;
  if (plan.association.journalEntryIds.length === 0 || plan.association.eventIds.length === 0)
    return false;
  const linked = plan.association.references;
  if (
    linked.length !== plan.association.journalEntryIds.length ||
    new Set(linked.map((row) => row.journalEntryId)).size !== linked.length
  )
    return false;
  if (
    linked.some(
      (row) =>
        row.tradePlanId !== plan.id ||
        row.accountId !== plan.accountId ||
        !eventIds.has(row.ledgerEventId) ||
        !plan.association.journalEntryIds.includes(row.journalEntryId) ||
        !plan.association.eventIds.includes(row.ledgerEventId),
    )
  )
    return false;
  return (
    plan.association.journalEntryIds.every((journalId) =>
      linked.some(
        (note) =>
          note.journalEntryId === journalId &&
          plan.association.eventIds.includes(note.ledgerEventId),
      ),
    ) &&
    plan.association.eventIds.every((eventId) =>
      linked.some((note) => note.ledgerEventId === eventId),
    )
  );
}

export const journalReviewEvidenceInputSchema = z
  .object({
    reference: journalReviewObjectReferenceSchema,
    trade: tradeDetailResponseSchema,
    plan: journalDecimalPlanSchema.nullable(),
    fxEvidence: z.array(journalFxEvidenceSchema),
    journalEntries: z.array(journalReviewNoteSchema).default([]),
    analysisDraft: journalAnalysisDraftSchema.nullable().default(null),
    projection: journalReviewEvidenceProjectionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reference.tradeId !== value.trade.id)
      context.addIssue({
        code: 'custom',
        path: ['reference', 'tradeId'],
        message: '复盘引用必须属于输入交易周期',
      });
    if (value.reference.reviewObjectType === 'CLOSE_SLICE') {
      const sliceId = value.reference.closeSliceId;
      if (!value.trade.closeSlices.some((slice) => slice.id === sliceId))
        context.addIssue({
          code: 'custom',
          path: ['reference', 'closeSliceId'],
          message: '减仓片段必须属于输入交易周期',
        });
    }
    if (
      value.plan &&
      (value.plan.accountId !== value.trade.accountId || value.plan.symbol !== value.trade.symbol)
    )
      context.addIssue({
        code: 'custom',
        path: ['plan'],
        message: '计划必须显式关联输入账户、标的及交易周期',
      });
    const eventIds = new Set(
      [
        ...value.trade.entryLegs,
        ...value.trade.baselineComponents,
        ...value.trade.corporateActions,
        ...value.trade.closeSlices,
        ...value.trade.dividendAttributions,
        ...value.trade.evidenceSources,
      ]
        .map((row) => row.eventId)
        .concat(
          value.trade.closeSlices.flatMap((slice) =>
            slice.allocations.map((row) => row.sourceEventId),
          ),
        ),
    );
    for (const note of value.journalEntries) {
      const byEvent = note.ledgerEventId !== null && eventIds.has(note.ledgerEventId);
      const byPlan = note.tradePlanId !== null && note.tradePlanId === value.plan?.id;
      if (
        note.accountId !== value.trade.accountId ||
        (!byEvent && !byPlan) ||
        (note.ledgerEventId !== null && !eventIds.has(note.ledgerEventId))
      )
        context.addIssue({
          code: 'custom',
          path: ['journalEntries'],
          message: '复盘说明必须显式关联输入对象',
        });
    }
    if (value.plan && !planAssociationValid(value.plan, value.trade.id, eventIds))
      context.addIssue({
        code: 'custom',
        path: ['plan'],
        message: '计划缺少明确的交易或 Journal 事件关联证明',
      });
    if (
      value.trade.projectionGeneration !== value.projection.projectionGeneration ||
      value.trade.projectionFingerprint !== value.projection.projectionFingerprint
    )
      context.addIssue({
        code: 'custom',
        path: ['projection'],
        message: '输入交易与投影版本不一致',
      });
  });

export const journalDecimalMetricSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('AVAILABLE'),
      value: decimalStringSchema,
      unit: z.enum(['AMOUNT', 'PRICE', 'RATIO', 'DAYS', 'COUNT', 'QUANTITY']),
      currency: currencyCodeSchema.nullable(),
      missingEvidence: z.array(id).length(0),
    })
    .strict(),
  z
    .object({
      status: z.literal('INSUFFICIENT_EVIDENCE'),
      value: z.null(),
      unit: z.enum(['AMOUNT', 'PRICE', 'RATIO', 'DAYS', 'COUNT', 'QUANTITY']),
      currency: currencyCodeSchema.nullable(),
      missingEvidence: z.array(id).min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal('NOT_APPLICABLE'),
      value: z.null(),
      unit: z.enum(['AMOUNT', 'PRICE', 'RATIO', 'DAYS', 'COUNT', 'QUANTITY']),
      currency: currencyCodeSchema.nullable(),
      missingEvidence: z.array(id).length(0),
    })
    .strict(),
]);

export const journalDeterministicReviewSchema = z
  .object({
    reviewObjectId: id,
    algorithmVersion: id,
    statisticsEligibility: journalStatisticsEligibilitySchema,
    metrics: z.record(id, journalDecimalMetricSchema),
    aiExplanation: journalAiSnapshotMetadataSchema.nullable().default(null),
    behaviorNotes: z.array(z.string()),
    behaviors: z.array(journalBehaviorEvidenceSchema).default([]),
    assumptions: z.array(z.string()).default([]),
    rounding: z
      .object({
        mode: z.literal('HALF_UP'),
        amountFractionDigits: z.number().int().nonnegative(),
        ratioFractionDigits: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const behavior of value.behaviors) {
      const metrics = behavior.metricKeys.map((key) => value.metrics[key]);
      if (metrics.some((metric) => metric === undefined))
        context.addIssue({
          code: 'custom',
          path: ['behaviors'],
          message: '行为必须引用本次分析的实际指标',
        });
      if (
        behavior.status !== 'INSUFFICIENT_EVIDENCE' &&
        metrics.some((metric) => metric?.status !== 'AVAILABLE')
      )
        context.addIssue({
          code: 'custom',
          path: ['behaviors'],
          message: '缺少可用指标时不能判定行为偏差',
        });
    }
  });

export const journalReviewCandidateContractSchema = z
  .object({
    input: journalReviewEvidenceInputSchema,
    openedAt: instant.nullable(),
    effectiveClosedAt: instant.nullable(),
    executedAt: instant.nullable(),
    statisticsEligibility: journalStatisticsEligibilitySchema,
    reviewStatus: z.enum(['CURRENT', 'STALE']),
    missingEvidence: z.array(id),
  })
  .strict()
  .superRefine((value, context) => {
    const { trade, reference } = value.input;
    if (value.openedAt !== trade.openedAt)
      context.addIssue({ code: 'custom', path: ['openedAt'], message: '开仓时间必须保留原始事实' });
    let effectiveClosedAt: string | null = null;
    let executedAt: string | null = null;
    if (reference.reviewObjectType === 'TRADE_CYCLE') {
      if (trade.lifecycle === 'ENDED') effectiveClosedAt = trade.closedAt;
    } else {
      const sliceId = reference.closeSliceId;
      executedAt = trade.closeSlices.find((slice) => slice.id === sliceId)?.occurredAt ?? null;
    }
    if (value.effectiveClosedAt !== effectiveClosedAt || value.executedAt !== executedAt)
      context.addIssue({
        code: 'custom',
        path: ['effectiveClosedAt'],
        message: '统计时间必须对应真实对象事实',
      });
  });

export const journalReviewSnapshotContractSchema = z
  .object({
    id: z.uuid(),
    inputSnapshot: journalReviewEvidenceInputSchema,
    outputSnapshot: journalDeterministicReviewSchema,
    status: z.enum(['CURRENT', 'STALE']),
    createdAt: instant,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.inputSnapshot.reference.reviewObjectId !== value.outputSnapshot.reviewObjectId)
      context.addIssue({
        code: 'custom',
        path: ['outputSnapshot', 'reviewObjectId'],
        message: '快照输出必须对应原始输入对象',
      });
  });

export const journalReviewSnapshotRequestSchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    reference: journalReviewObjectReferenceSchema,
    evidenceFingerprint: id,
    analysisDraft: journalAnalysisDraftSchema.nullable().optional(),
    aiRunId: z.uuid().optional(),
    expectedAlgorithmVersion: id.optional(),
  })
  .strict();

export const journalReviewQuerySchema = z
  .object({
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']).default('actual'),
    symbol: id.optional(),
    start: instant.optional(),
    end: instant.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const journalReviewCursorSchema = z
  .object({
    version: z.literal(1),
    accountId: z.uuid(),
    mode: z.enum(['actual', 'shadow']),
    symbol: id.nullable(),
    start: instant.nullable(),
    end: instant.nullable(),
    ledgerRevision: revision,
    projectionGeneration: revision,
    afterObjectId: id,
  })
  .strict();

export type JournalReviewEvidenceInput = z.infer<typeof journalReviewEvidenceInputSchema>;
export type JournalDeterministicReview = z.infer<typeof journalDeterministicReviewSchema>;
export type JournalReviewCandidateContract = z.infer<typeof journalReviewCandidateContractSchema>;
export type JournalReviewSnapshotContract = z.infer<typeof journalReviewSnapshotContractSchema>;
export type JournalReviewQuery = z.infer<typeof journalReviewQuerySchema>;
export type JournalReviewCursor = z.infer<typeof journalReviewCursorSchema>;
export type JournalReviewSnapshotRequest = z.infer<typeof journalReviewSnapshotRequestSchema>;
