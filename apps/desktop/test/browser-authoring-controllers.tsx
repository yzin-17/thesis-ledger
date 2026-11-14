import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authoringDraftReadSchema, authoringOperationReadSchema } from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { AuthoringConfirmation } from '../src/features/strategy-authoring/AuthoringConfirmation.js';
import { AuthoringOperation } from '../src/features/strategy-authoring/AuthoringOperation.js';
import { AuthoringWorkPage } from '../src/features/strategy-authoring/AuthoringWorkPage.js';
import { emptyAuthoringContent } from '../src/features/strategy-authoring/use-authoring-draft.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
});
const owner = 'local-workspace';
const id = '00000000-0000-4000-8000-000000000001';
const at = '2026-11-12T00:00:00Z';
const draft = authoringDraftReadSchema.parse({
  id,
  ownerId: owner,
  state: 'editing',
  revision: 1,
  title: '受控编写草稿',
  savedVersionId: null,
  content: emptyAuthoringContent,
  validation: { status: 'incomplete', issues: [] },
  createdAt: at,
  updatedAt: at,
});
client.setQueryData(['desktop', 'identity-context', undefined], {
  mode: 'local',
  principal: { id: owner, username: 'controlled-user', displayName: '受控本地工作区' },
});
client.setQueryData(['desktop', 'authoring-list', owner], {
  pages: [{ items: [draft], nextCursor: null }],
  pageParams: [null],
});
client.setQueryData(['desktop', 'authoring', owner, id], draft);
client.setQueryData(['desktop', 'authoring-history', owner, id], []);
client.setQueryData(['desktop', 'authoring-models'], []);
const cost = {
  status: 'unknown',
  amount: null,
  currency: null,
  source: null,
  pricingVersion: null,
};
const operation = authoringOperationReadSchema.parse({
  id,
  revision: 1,
  status: 'failed',
  disposition: 'unapplied',
  input: {
    content: emptyAuthoringContent,
    selection: {
      kind: 'generate',
      expectedRevision: 1,
      idempotencyKey: 'controlled-intent',
      providerId: 'controlled-provider',
      model: 'controlled-model',
      promptVersion: 'controlled-prompt',
      capabilityVersion: 'authoring-v1',
      cost,
      unknownCostAcknowledgedAt: at,
      intent: '',
    },
  },
  outcome: {
    attempt: 1,
    status: 'failed',
    externalResult: 'unknown',
    outputText: '{}',
    errorCode: 'AUTHORING_RESULT_UNKNOWN',
    usage: null,
    cost,
  },
});
function Harness() {
  const [view, setView] = useState<'confirmation' | 'workspace' | 'operation'>('confirmation');
  const [content, setContent] = useState(emptyAuthoringContent);
  return (
    <main className="content space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setView('confirmation')}>
          受控确认表单
        </Button>
        <Button variant="outline" onClick={() => setView('workspace')}>
          受控草稿工作区
        </Button>
        <Button variant="outline" onClick={() => setView('operation')}>
          受控未知结果
        </Button>
      </div>
      {view === 'confirmation' && (
        <AuthoringConfirmation content={content} onChange={setContent} disabled={false} />
      )}
      {view === 'workspace' && (
        <AuthoringWorkPage
          onDirtyChange={() => undefined}
          onSaved={() => {
            throw new Error('受控验收不保存策略');
          }}
        />
      )}
      {view === 'operation' && (
        <AuthoringOperation
          operation={operation}
          busy={false}
          stale
          onAction={() => {
            throw new Error('受控验收不执行模型操作');
          }}
          onProposal={() => {
            throw new Error('受控验收不应用建议');
          }}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ConfirmDialogProvider>
        <Harness />
      </ConfirmDialogProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
