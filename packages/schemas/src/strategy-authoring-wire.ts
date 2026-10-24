import { z } from 'zod';
import { aiProviderModelExecutionSchema } from './ai-execution.js';
import {
  authoringDraftReadSchema,
  authoringOperationInputSchema,
  authoringOperationSnapshotSchema,
  authoringOperationFinishSchema,
  authoringQueuedCancellationSchema,
  authoringQueuedFailureSchema,
  authoringProposalInputSchema,
} from './strategy-authoring.js';
import { AUTHORING_LIMITS } from './strategy-authoring-definition.js';
import { authoringModificationTargetSchema } from './strategy-authoring-modification.js';
const id = z.uuid(),
  revision = z.number().int().positive();
export const authoringObjectIdSchema = id;
export const authoringOperationActionSchema = z.enum([
  'cancel',
  'discard',
  'apply-analysis',
  'apply-generation',
  'proposal',
]);
/** HTTP 接收用户意图；费用、提示词和能力快照由服务端生成。 */
export const authoringSubmitIntentSchema = z.object({
  kind: z.enum(['analyze', 'generate', 'modify']), expectedRevision: revision,
  idempotencyKey: z.string().trim().min(1).max(120),
  providerId: z.string().trim().min(1).max(120), model: z.string().trim().min(1).max(240),
  intent: z.string().max(AUTHORING_LIMITS.descriptionCharacters),
  unknownCostAcknowledgedAt: z.iso.datetime().nullable(),
  modificationTarget: authoringModificationTargetSchema.optional(),
}).strict().refine(v => v.kind === 'modify' || v.modificationTarget === undefined,
  { message: '只有局部修改可以选择修改范围' });
export type AuthoringSubmitIntent = z.infer<typeof authoringSubmitIntentSchema>;
export const authoringProposalActionSchema = z.enum(['apply', 'discard']);
const pricing = z.object({
  costPer1kInput: z.number().optional(),
  costPer1kOutput: z.number().optional(),
  costCurrency: z.string().optional(),
});
export const authoringProviderListReadSchema = z.array(
  pricing
    .extend({
      name: z.string(),
      models: z.array(z.string()),
      modelPricing: z.record(z.string(), pricing).optional(),
    })
    .passthrough(),
);
export const authoringModelRoutesReadSchema = z.array(aiProviderModelExecutionSchema);
const fields = authoringDraftReadSchema.shape;
export const authoringDraftSummarySchema = z
  .object({
    id: fields.id,
    ownerId: fields.ownerId,
    state: fields.state,
    revision: fields.revision,
    title: fields.title,
    savedVersionId: fields.savedVersionId,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  })
  .strict();
export const authoringDraftCursorSchema = z.object({ updatedAt: z.iso.datetime(), id }).strict();
export const authoringDraftPageSchema = z
  .object({
    items: z.array(authoringDraftSummarySchema),
    nextCursor: authoringDraftCursorSchema.nullable(),
  })
  .strict();
export const authoringOperationSummaryReadSchema = z
  .object({
    id,
    revision,
    status: z.string(),
    disposition: z.string(),
    selection: authoringOperationInputSchema,
    errorCode: z.string().nullable(),
    proposalId: id.nullable(),
    proposalStatus: z.string().nullable(),
    updatedAt: z.string(),
  })
  .passthrough();
export const authoringOperationReadSchema = z
  .object({
    id,
    revision,
    status: z.string(),
    disposition: z.string(),
    input: authoringOperationSnapshotSchema,
    outcome: z
      .union([
        authoringOperationFinishSchema,
        authoringQueuedCancellationSchema,
        authoringQueuedFailureSchema,
      ])
      .nullable(),
    invocations: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();
export const authoringOperationHistoryReadSchema = z.array(authoringOperationSummaryReadSchema);
export const authoringProposalReadSchema = z
  .object({ id, revision, status: z.string(), payload: authoringProposalInputSchema })
  .passthrough();
export const authoringActionReceiptSchema = z.object({ id }).passthrough();
export const authoringReviewReadSchema = z
  .object({
    revision,
    definition: z.record(z.string(), z.unknown()),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export const authoringSaveRequestSchema = z
  .object({
    expectedRevision: revision,
    name: z.string().trim().min(1).max(200),
    reviewedDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export const authoringSaveReceiptSchema = z
  .object({ strategyId: id, versionId: id, version: revision })
  .strict();
export const authoringExpectedRevisionWireSchema = z
  .object({ expectedRevision: revision })
  .strict();
export type AuthoringDraftPage = z.infer<typeof authoringDraftPageSchema>;
