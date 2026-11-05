import {
  authoringContentSchema,
  authoringDraftReadSchema,
  authoringDraftPageSchema,
  authoringDraftCursorSchema,
  authoringOperationReadSchema,
  authoringOperationHistoryReadSchema,
  authoringSubmitIntentSchema,
  authoringProposalReadSchema,
  authoringActionReceiptSchema,
  authoringReviewReadSchema,
  authoringSaveRequestSchema,
  authoringSaveReceiptSchema,
  authoringUpdateSchema,
  authoringSourceReadSchema,
  authoringExpectedRevisionWireSchema,
  authoringObjectIdSchema,
  authoringOperationActionSchema,
  authoringProposalActionSchema,
  type AuthoringContent,
  type AuthoringDraftPage,
} from '@thesis-ledger/schemas';
import type { ParsedRequest, ParsedResponseSchema } from './parsed-request.js';
import { authoringModels } from './strategy-authoring-models.js';
const uuid = (id: string) => authoringObjectIdSchema.parse(id);
const draftPath = (id: string) => `/strategy-authoring/drafts/${uuid(id)}`;
const readInit = (signal?: AbortSignal) => (signal ? { signal } : undefined);
export function strategyAuthoringClient(request: ParsedRequest) {
  const post = <T>(path: string, body: unknown, schema: ParsedResponseSchema<T>) =>
    request(path, schema, { method: 'POST', body: JSON.stringify(body) });
  return {
    list: (cursor?: AuthoringDraftPage['nextCursor'], signal?: AbortSignal) => {
      if (cursor) authoringDraftCursorSchema.parse(cursor);
      return request(
        `/strategy-authoring/drafts?limit=20${cursor ? `&beforeUpdatedAt=${encodeURIComponent(cursor.updatedAt)}&beforeId=${cursor.id}` : ''}`,
        authoringDraftPageSchema,
        readInit(signal),
      );
    },
    read: (id: string, signal?: AbortSignal) =>
      request(
        draftPath(id),
        authoringDraftReadSchema.refine((v) => v.id === id),
        readInit(signal),
      ),
    create: (content: AuthoringContent) => {
      authoringContentSchema.parse(content);
      return post('/strategy-authoring/drafts', content, authoringDraftReadSchema);
    },
    update: (id: string, expectedRevision: number, content: AuthoringContent) => {
      const body = { expectedRevision, content };
      authoringUpdateSchema.parse(body);
      return request(
        draftPath(id),
        authoringDraftReadSchema.refine((v) => v.id === id),
        { method: 'PATCH', body: JSON.stringify(body) },
      );
    },
    discardDraft: (id: string, expectedRevision: number) => {
      const body = { expectedRevision };
      authoringExpectedRevisionWireSchema.parse(body);
      return post(
        draftPath(id) + '/discard',
        body,
        authoringDraftReadSchema.refine((v) => v.id === id),
      );
    },
    history: (id: string, signal?: AbortSignal) =>
      request(draftPath(id) + '/operations', authoringOperationHistoryReadSchema, readInit(signal)),
    operation: (id: string, signal?: AbortSignal) =>
      request(
        `/strategy-authoring/operations/${uuid(id)}`,
        authoringOperationReadSchema.refine((v) => v.id === id),
        readInit(signal),
      ),
    submit: (id: string, body: unknown) => {
      authoringSubmitIntentSchema.parse(body);
      return post(draftPath(id) + '/operations', body, authoringActionReceiptSchema);
    },
    action: (id: string, action: string, expectedRevision: number) => {
      const operation = authoringOperationActionSchema.parse(action);
      const body =
        operation === 'cancel'
          ? {}
          : authoringExpectedRevisionWireSchema.parse({ expectedRevision });
      if(operation === 'proposal') return post(
        `/strategy-authoring/operations/${uuid(id)}/proposal`, body, authoringProposalReadSchema);
      return post(
        `/strategy-authoring/operations/${uuid(id)}/${operation}`,
        body,
        authoringActionReceiptSchema,
      );
    },
    proposal: (id: string, signal?: AbortSignal) =>
      request(
        `/strategy-authoring/proposals/${uuid(id)}`,
        authoringProposalReadSchema.refine((v) => v.id === id),
        readInit(signal),
      ),
    proposalAction: (id: string, action: 'apply' | 'discard', expectedRevision: number) => {
      authoringProposalActionSchema.parse(action);
      const body = authoringExpectedRevisionWireSchema.parse({ expectedRevision });
      return post(
        `/strategy-authoring/proposals/${uuid(id)}/${action}`,
        body,
        authoringActionReceiptSchema,
      );
    },
    review: (id: string, signal?: AbortSignal) =>
      request(draftPath(id) + '/review', authoringReviewReadSchema, readInit(signal)),
    save: (id: string, body: unknown) => {
      authoringSaveRequestSchema.parse(body);
      return post(draftPath(id) + '/save', body, authoringSaveReceiptSchema);
    },
    source: (id: string, signal?: AbortSignal) =>
      request(
        `/strategy-authoring/versions/${uuid(id)}/source`,
        authoringSourceReadSchema.refine((v) => v.versionId === id),
        readInit(signal),
      ),
    models: (signal?: AbortSignal) => authoringModels(request, signal),
  };
}
