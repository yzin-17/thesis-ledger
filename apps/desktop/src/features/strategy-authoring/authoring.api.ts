import type { AuthoringContent } from '@thesis-ledger/schemas';
import { omitUndefinedDeep } from '@thesis-ledger/schemas';
import { strategyClients } from '@thesis-ledger/api-client';
import { parsedDesktopRequest } from '../shared/request.js';
type SharedAuthoring = ReturnType<typeof strategyClients>['authoring'];
export type AuthoringDraftView = Awaited<ReturnType<SharedAuthoring['read']>>;
export type DraftPage = Awaited<ReturnType<SharedAuthoring['list']>>;
export type OperationSummary = Awaited<ReturnType<SharedAuthoring['history']>>[number];
export type OperationView = Awaited<ReturnType<SharedAuthoring['operation']>>;
export type ProposalView = Awaited<ReturnType<SharedAuthoring['proposal']>>;
export type AuthoringModel = Awaited<ReturnType<SharedAuthoring['models']>>[number];
const shared = () => strategyClients(parsedDesktopRequest()).authoring;
export const authoringApi = {
  list: (cursor?: DraftPage['nextCursor']) => shared().list(cursor).then(omitUndefinedDeep),
  read: (id: string) => shared().read(id),
  create: (content: AuthoringContent) => shared().create(content),
  update: (id: string, expectedRevision: number, content: AuthoringContent) =>
    shared().update(id, expectedRevision, content),
  discardDraft: (id: string, expectedRevision: number) =>
    shared().discardDraft(id, expectedRevision),
  history: (id: string) => shared().history(id).then(omitUndefinedDeep),
  operation: (id: string) => shared().operation(id).then(omitUndefinedDeep),
  submit: (id: string, body: unknown) => shared().submit(id, body),
  action: (id: string, action: string, expectedRevision: number) =>
    shared().action(id, action, expectedRevision),
  proposal: (id: string) => shared().proposal(id).then(omitUndefinedDeep),
  proposalAction: (id: string, action: 'apply' | 'discard', expectedRevision: number) =>
    shared().proposalAction(id, action, expectedRevision),
  review: (id: string) => shared().review(id),
  save: (id: string, body: unknown) => shared().save(id, body),
};
export async function fetchAuthoringModels(): Promise<AuthoringModel[]> {
  return shared().models();
}
