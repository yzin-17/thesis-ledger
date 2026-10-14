import {
  aiProviderModelExecutionSchema,
  authoringDraftReadSchema,
  type AuthoringContent,
  type AuthoringOperationInput,
  type AuthoringProposalInput,
} from '@thesis-ledger/schemas';
import { requestDesktopJson } from '../shared/request.js';

export type AuthoringDraftView = ReturnType<typeof authoringDraftReadSchema.parse>;
export type DraftPage = {
  items: Array<Omit<AuthoringDraftView, 'content' | 'validation'>>;
  nextCursor: { updatedAt: string; id: string } | null;
};
export type OperationSummary = {
  id: string;
  revision: number;
  status: string;
  disposition: string;
  selection: AuthoringOperationInput;
  errorCode: string | null;
  proposalId: string | null;
  proposalStatus: string | null;
  updatedAt: string;
};
export type OperationView = {
  id: string;
  revision: number;
  status: string;
  disposition: string;
  input: { selection: AuthoringOperationInput };
  outcome: {
    outputText: string | null;
    errorCode: string | null;
    externalResult: string;
    cost: AuthoringOperationInput['cost'];
    usage: { status: string; inputTokens?: number; outputTokens?: number } | null;
  } | null;
};
export type ProposalView = {
  id: string;
  revision: number;
  status: string;
  payload: AuthoringProposalInput;
};
export type AuthoringModel = {
  key: string;
  providerId: string;
  model: string;
  available: Record<'analyze' | 'generate' | 'modify', boolean>;
  pricingLabel: string;
  costUnknown: boolean;
};
const post = <T>(path: string, body: unknown) =>
  requestDesktopJson<T>(path, { method: 'POST', body: JSON.stringify(body) });
const draftPath = (id: string) => `/strategy-authoring/drafts/${encodeURIComponent(id)}`;
export const authoringApi = {
  list: (cursor?: DraftPage['nextCursor']) =>
    requestDesktopJson<DraftPage>(
      `/strategy-authoring/drafts?limit=20${cursor ? `&beforeUpdatedAt=${encodeURIComponent(cursor.updatedAt)}&beforeId=${cursor.id}` : ''}`,
    ),
  read: async (id: string) =>
    authoringDraftReadSchema.parse(await requestDesktopJson(draftPath(id))),
  create: async (content: AuthoringContent) =>
    authoringDraftReadSchema.parse(await post('/strategy-authoring/drafts', content)),
  update: async (id: string, expectedRevision: number, content: AuthoringContent) =>
    authoringDraftReadSchema.parse(
      await requestDesktopJson(draftPath(id), {
        method: 'PATCH',
        body: JSON.stringify({ expectedRevision, content }),
      }),
    ),
  discardDraft: (id: string, expectedRevision: number) =>
    post(draftPath(id) + '/discard', { expectedRevision }),
  history: (id: string) => requestDesktopJson<OperationSummary[]>(draftPath(id) + '/operations'),
  operation: (id: string) =>
    requestDesktopJson<OperationView>(`/strategy-authoring/operations/${id}`),
  submit: (id: string, body: unknown) => post<{ id: string }>(draftPath(id) + '/operations', body),
  action: (id: string, action: string, expectedRevision: number) =>
    post(
      `/strategy-authoring/operations/${id}/${action}`,
      action === 'cancel' ? {} : { expectedRevision },
    ),
  proposal: (id: string) => requestDesktopJson<ProposalView>(`/strategy-authoring/proposals/${id}`),
  proposalAction: (id: string, action: 'apply' | 'discard', expectedRevision: number) =>
    post(`/strategy-authoring/proposals/${id}/${action}`, { expectedRevision }),
  review: (id: string) =>
    requestDesktopJson<{
      revision: number;
      definition: Record<string, unknown>;
      definitionHash: string;
    }>(draftPath(id) + '/review'),
  save: (id: string, body: unknown) =>
    post<{ strategyId: string; versionId: string; version: number }>(draftPath(id) + '/save', body),
};
type Pricing = { costPer1kInput?: number; costPer1kOutput?: number; costCurrency?: string };
type Provider = Pricing & {
  name: string;
  models: string[];
  modelPricing?: Record<string, Pricing>;
};
export async function fetchAuthoringModels(): Promise<AuthoringModel[]> {
  const providers = await requestDesktopJson<Provider[]>('/ai/providers');
  const routes = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      routes: (
        await requestDesktopJson<unknown[]>(
          `/ai/providers/${encodeURIComponent(provider.name)}/readiness`,
        )
      ).map((route) => aiProviderModelExecutionSchema.parse(route)),
    })),
  );
  const purposes = {
    analyze: 'strategy_authoring_analysis',
    generate: 'strategy_authoring_generation',
    modify: 'strategy_authoring_modification',
  };
  return routes.flatMap(({ provider, routes: entries }) =>
    provider.models.map((model) => {
      const price = provider.modelPricing?.[model] ?? provider;
      const known =
        price.costPer1kInput !== undefined &&
        price.costPer1kOutput !== undefined &&
        Boolean(price.costCurrency);
      const available = Object.fromEntries(
        Object.entries(purposes).map(([kind, id]) => [
          kind,
          entries.some(
            (entry) =>
              entry.model === model &&
              entry.contract.id === id &&
              entry.liveValidation.status === 'passed' &&
              entry.readiness.reasons.every((reason) => reason === 'budget_not_authorized'),
          ),
        ]),
      ) as AuthoringModel['available'];
      const pricingLabel = known
        ? `每千 tokens 输入 ${price.costPer1kInput} / 输出 ${price.costPer1kOutput} ${price.costCurrency}（配置估算）`
        : '费用未知';
      return {
        key: JSON.stringify([provider.name, model]),
        providerId: provider.name,
        model,
        available,
        pricingLabel,
        costUnknown: !known,
      };
    }),
  );
}
