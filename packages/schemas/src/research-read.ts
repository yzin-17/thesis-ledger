import { z } from 'zod';
import { aiRunStatusSchema, aiToolCallsPageSchema } from './ai.js';
import { instrumentDirectorySchema } from './market.js';
import { researchResultV2Schema } from './research-result-v2.js';
import { researchObservationCutoffInputSchema } from './research-observation.js';
import { researchQualityV2Schema, researchFrozenEvidenceV2Schema } from './research-evidence-v2.js';
import {
  researchHistoricalScopeV2Schema,
  researchScopeSnapshotV2Schema,
  researchScopeSelectionV2Schema,
  researchSubmissionV2Schema,
  researchScopeMatchesSubmissionV2,
  type ResearchScopeSnapshotV2,
} from './research-scope-v2.js';

export const researchReportIdSchema = z.uuid().transform((value) => value.toLowerCase());
const scoped = z.strictObject({
  view: z.literal('scoped'),
  mode: z.enum(['actual', 'shadow']),
  scope: z
    .enum(['all', 'instrument', 'portfolio', 'account', 'position', 'strategy'])
    .default('all'),
  kind: z.enum(['instrument', 'portfolio', 'account', 'position', 'strategy']).optional(),
  accountId: researchReportIdSchema.optional(),
  instrumentId: researchReportIdSchema.optional(),
  symbol: z.string().trim().min(1).max(256).toUpperCase().optional(),
  strategyVersionId: researchReportIdSchema.optional(),
  portfolioId: z.string().trim().min(1).max(256).optional(),
});
type Scoped = z.infer<typeof scoped>;
function selectionFields(value: object) {
  const names = new Set([
    'scope',
    'accountId',
    'instrumentId',
    'symbol',
    'strategyVersionId',
    'portfolioId',
  ]);
  return Object.fromEntries(
    Object.entries(value).filter(([key, field]) => names.has(key) && field !== undefined),
  );
}
function checkSelection(value: Scoped, context: z.RefinementCtx) {
  if (value.kind && value.scope !== 'all' && value.kind !== value.scope)
    context.addIssue({ code: 'custom', message: '研究类别与对象范围不一致' });
  const fields = selectionFields(value);
  if (fields.scope === 'all') {
    if (Object.keys(fields).length !== 1)
      context.addIssue({ code: 'custom', message: '全部范围不能夹带对象标识' });
    return;
  }
  const parsed = researchScopeSelectionV2Schema.safeParse(fields);
  if (!parsed.success) context.addIssue({ code: 'custom', message: '研究范围与对象标识不一致' });
}
export const researchReportLocatorSchema = scoped
  .superRefine(checkSelection);
const paging = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: aiRunStatusSchema.optional(),
};
export const researchReportListQuerySchema = scoped.extend(paging)
  .superRefine(checkSelection);
const toolPaging = { limit: paging.limit, cursor: paging.cursor };
export const researchReportToolsQuerySchema = scoped.extend(toolPaging)
  .superRefine(checkSelection);
export const researchReportToolsPageSchema = aiToolCallsPageSchema
  .extend({ runId: researchReportIdSchema })
  .refine((value) => value.hasMore === (value.nextCursor !== null), '工具分页状态不一致');
export const researchReportComparisonQuerySchema = scoped
  .extend({ beforeId: researchReportIdSchema.optional() })
  .superRefine(checkSelection);
export const researchObservationReadQuerySchema = scoped
  .extend({ asOf: researchObservationCutoffInputSchema.optional() })
  .superRefine(checkSelection);
export type ResearchReportLocator = z.infer<typeof researchReportLocatorSchema>;
export type ResearchReportListQuery = z.infer<typeof researchReportListQuerySchema>;
export type ResearchReportLocatorInput = z.input<typeof researchReportLocatorSchema>;
export type ResearchReportListInput = z.input<typeof researchReportListQuerySchema>;
export type ResearchReportToolsQuery = z.infer<typeof researchReportToolsQuerySchema>;
export type ResearchReportToolsInput = z.input<typeof researchReportToolsQuerySchema>;
export type ResearchReportComparisonQuery = z.infer<typeof researchReportComparisonQuerySchema>;
export type ResearchReportComparisonInput = z.input<typeof researchReportComparisonQuerySchema>;
export type ResearchObservationReadInput = z.input<typeof researchObservationReadQuerySchema>;
export function researchReportSelection(locator: ResearchReportLocator) {
  if (locator.scope === 'all') return null;
  return researchScopeSelectionV2Schema.parse(selectionFields(locator));
}
export function researchReportMatchesLocator(
  snapshot: ResearchScopeSnapshotV2,
  locator: ResearchReportLocator,
) {
  if (snapshot.mode !== locator.mode) return false;
  if (locator.kind && locator.kind !== snapshot.scope) return false;
  const selection = researchReportSelection(locator);
  return (
    selection === null ||
    researchScopeMatchesSubmissionV2({ mode: locator.mode, scope: selection }, snapshot)
  );
}

export function researchHistoricalScopeMatchesLocator(
  scope: z.infer<typeof researchHistoricalScopeV2Schema>,
  locator: ResearchReportLocator,
) {
  return scope.status === 'known' && researchReportMatchesLocator(scope.snapshot, locator);
}

const common = {
  id: z.uuid(),
  status: z.string().min(1).max(80),
  question: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  historicalScope: researchHistoricalScopeV2Schema,
  resultVersion: z.literal('research-report-result-v1').nullable(),
  availability: z.enum([
    'available',
    'pending',
    'missing',
    'invalid',
    'unsupported',
  ]),
  summary: z.string().nullable(),
  quality: researchQualityV2Schema.nullable(),
  errorCode: z.string().nullable(),
  errorSummary: z.string().nullable(),
};
export const researchReportSummarySchema = z
  .strictObject(common)
  .refine(
    (value) =>
      value.historicalScope.status === 'known'
        ? value.resultVersion === 'research-report-result-v1'
        : value.resultVersion !== 'research-report-result-v1',
    '报告版本与可信范围不一致',
  );
export const researchReportPageSchema = z
  .strictObject({
    items: z.array(researchReportSummarySchema).max(50),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).max(2048).nullable(),
    instrumentDirectory: instrumentDirectorySchema.optional(),
  })
  .refine((value) => value.hasMore === (value.nextCursor !== null), '研究分页状态不一致');
export const researchReportDetailSchema = z
  .strictObject({
    ...common,
    result: researchResultV2Schema.nullable(),
    submission: researchSubmissionV2Schema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.historicalScope.status === 'known' && value.resultVersion !== 'research-report-result-v1')
      context.addIssue({ code: 'custom', message: '可信范围必须属于 V2 产物' });
    if (
      (value.availability === 'available') !==
      (value.result !== null)
    )
      context.addIssue({ code: 'custom', message: '产物可用性与实际结果不一致' });
    if (value.result && value.result.version !== value.resultVersion)
      context.addIssue({ code: 'custom', message: '产物版本与结果不一致' });
    if (
      value.historicalScope.status === 'unrecorded' &&
      (value.resultVersion === 'research-report-result-v1' || value.submission !== null)
    )
      context.addIssue({ code: 'custom', message: '历史兼容报告不能提升为 V2 产物' });
    if (
      value.result?.version === 'research-report-result-v1' &&
      value.historicalScope.status === 'known' &&
      JSON.stringify(value.result.scopeSnapshot) !== JSON.stringify(value.historicalScope.snapshot)
    )
      context.addIssue({ code: 'custom', message: '产物与读取范围不一致' });
  });
export const researchReportEvidenceSchema = z.strictObject({
  version: z.literal('research-report-evidence-v1'),
  runId: z.uuid(),
  scopeSnapshot: researchScopeSnapshotV2Schema,
  evidence: researchFrozenEvidenceV2Schema,
  toolCallId: z.uuid(),
});
export type ResearchReportDetail = z.infer<typeof researchReportDetailSchema>;
export type ResearchReportSummary = z.infer<typeof researchReportSummarySchema>;
