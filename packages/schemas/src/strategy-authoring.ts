import { z } from 'zod';
import { aiCostFactsSchema, aiUsageFactsSchema } from './ai-execution.js';
import { AUTHORING_CAPABILITY_VERSION, AUTHORING_LIMITS } from './strategy-authoring-definition.js';
import { authoringContentSchema } from './strategy-authoring-content.js';
import { authoringModificationTargetSchema } from './strategy-authoring-modification.js';
export {
  authoringContentSchema,
  authoringQuestionSchema,
  authoringRequirementSchema,
  type AuthoringContent,
} from './strategy-authoring-content.js';

const shortText = z.string().max(2_000);
const key = z.string().trim().min(1).max(120);
const revision = z.number().int().min(1).max(2_147_483_647);
const limited = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(AUTHORING_LIMITS.collectionItems);
export const authoringOwnerSchema = z.string().trim().min(1).max(200);
export const authoringUpdateSchema = z
  .object({ expectedRevision: revision, content: authoringContentSchema })
  .strict();
export const authoringOperationInputSchema = z
  .object({
    kind: z.enum(['analyze', 'generate', 'modify']),
    modificationTarget: authoringModificationTargetSchema.optional(),
    expectedRevision: revision,
    idempotencyKey: key,
    providerId: key,
    model: z.string().trim().min(1).max(240),
    configurationFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    pricingFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    promptVersion: key,
    capabilityVersion: z.literal(AUTHORING_CAPABILITY_VERSION),
    cost: aiCostFactsSchema,
    unknownCostAcknowledgedAt: z.iso.datetime().nullable(),
    intent: z.string().max(AUTHORING_LIMITS.descriptionCharacters),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.cost.status === 'unknown' && !value.unknownCostAcknowledgedAt)
      ctx.addIssue({
        code: 'custom',
        message: '费用未知时必须明确确认',
        path: ['unknownCostAcknowledgedAt'],
      });
  });
export type AuthoringOperationInput = z.infer<typeof authoringOperationInputSchema>;
export const authoringOperationSnapshotSchema = z
  .object({
    selection: authoringOperationInputSchema,
    content: authoringContentSchema,
  })
  .strict()
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).length <= AUTHORING_LIMITS.snapshotBytes,
    '模型输入快照超过字节上限',
  );
export const authoringValidationSchema = z
  .object({
    status: z.enum(['incomplete', 'invalid', 'structurally_valid']),
    issues: z.array(z.string()).max(20),
  })
  .strict();
export const authoringDraftReadSchema = z
  .object({
    id: z.uuid(),
    ownerId: authoringOwnerSchema,
    state: z.enum(['editing', 'saved', 'discarded']),
    revision,
    title: z.string().max(200),
    savedVersionId: z.uuid().nullable(),
    content: authoringContentSchema,
    validation: authoringValidationSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (value) => (value.state === 'saved') === (value.savedVersionId !== null),
    '已保存草稿必须有正式版本引用',
  );
export const authoringSourceSnapshotSchema = z
  .object({
    kind: z.literal('ai_assisted'),
    content: authoringContentSchema,
    operationIds: z.array(z.uuid()).min(1),
  })
  .strict();
export const authoringSourceReadSchema = z
  .object({
    versionId: z.uuid(),
    draftId: z.uuid(),
    ownerId: authoringOwnerSchema,
    revision,
    snapshot: authoringSourceSnapshotSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();
export const authoringOperationFinishSchema = z
  .object({
    attempt: z.number().int().positive(),
    status: z.enum(['succeeded', 'failed', 'cancelled']),
    externalResult: z.enum(['not_sent', 'received', 'unknown']),
    outputText: z.string().nullable(),
    errorCode: key.nullable(),
    usage: aiUsageFactsSchema.nullable(),
    cost: aiCostFactsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.outputText !== null &&
      new TextEncoder().encode(value.outputText).length > AUTHORING_LIMITS.outputBytes
    )
      ctx.addIssue({ code: 'custom', message: '操作输出超过字节上限' });
    if (
      value.status === 'succeeded' &&
      (value.externalResult !== 'received' || value.outputText === null)
    )
      ctx.addIssue({ code: 'custom', message: '成功操作必须有明确收到的结果' });
    if (value.status === 'failed' && !value.errorCode)
      ctx.addIssue({ code: 'custom', message: '失败操作必须有稳定错误码' });
  });
export type AuthoringOperationFinish = z.infer<typeof authoringOperationFinishSchema>;
export const authoringQueuedCancellationSchema = z
  .object({
    attempt: z.literal(0),
    status: z.literal('cancelled'),
    externalResult: z.literal('not_sent'),
    outputText: z.null(),
    errorCode: z.literal('AUTHORING_CANCELLED'),
    usage: z.null(),
    cost: aiCostFactsSchema.refine((value) => value.status === 'unknown', '未领取操作不宣称计费'),
  })
  .strict();
export type AuthoringQueuedCancellation = z.infer<typeof authoringQueuedCancellationSchema>;
export const authoringQueuedFailureSchema = authoringQueuedCancellationSchema.extend({
  status: z.literal('failed'),
  errorCode: z.literal('AUTHORING_DELIVERY_EXHAUSTED'),
});
export type AuthoringQueuedFailure = z.infer<typeof authoringQueuedFailureSchema>;
export const authoringProposalInputSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: revision,
    intent: z.string().min(1).max(AUTHORING_LIMITS.descriptionCharacters),
    allowedPaths: limited(key).min(1),
    beforeText: z.string().max(AUTHORING_LIMITS.definitionCharacters),
    afterText: z.string().max(AUTHORING_LIMITS.definitionCharacters),
    differences: limited(z.object({ path: key, before: shortText, after: shortText }).strict()).min(
      1,
    ),
  })
  .strict();
export type AuthoringProposalInput = z.infer<typeof authoringProposalInputSchema>;
export const authoringErrorCodeSchema = z.enum([
  'AUTHORING_NOT_FOUND',
  'AUTHORING_REVISION_CONFLICT',
  'AUTHORING_CLOSED',
  'AUTHORING_OPERATION_ACTIVE',
  'AUTHORING_OPERATION_CONFLICT',
  'AUTHORING_IDEMPOTENCY_CONFLICT',
  'AUTHORING_PROPOSAL_STALE',
  'AUTHORING_IDENTITY_REQUIRED',
]);
