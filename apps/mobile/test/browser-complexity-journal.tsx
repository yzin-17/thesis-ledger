import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { researchResultV2Schema } from '@thesis-ledger/schemas';
import { JournalAiPanel } from '../src/features/journal-ai/JournalAiPanel';
import { JournalEvidenceScreen } from '../src/features/journal-ai/JournalEvidenceScreen';
import { params } from './browser-complexity-journal-navigation';
import { ArenaLiveAccount } from '../src/features/model-arena/ArenaLiveAccount';
import { arenaAccountFixture } from './arena-account-fixture';

const response = await fetch(
  new URL('../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
);
const samples = JSON.parse(await response.text()) as { result: unknown };

const result = researchResultV2Schema.parse(samples.result);
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
const run = {
  id: params.runId,
  accountId: params.accountId,
  mode: params.mode,
  status: 'succeeded',
  provider: 'controlled',
  model: 'fixture',
  result,
  errorSummary: null,
};
client.setQueryData(
  ['watchlist-number-browser', 'journal-ai', params.accountId, 'object', params.runId],
  run,
);
client.setQueryData(['watchlist-number-browser', 'journal-evidence-run', params], run);

function Fixture() {
  const [evidence, setEvidence] = useState(false);
  useEffect(() => {
    const open = () => setEvidence(true);
    window.addEventListener('controlled-journal-evidence', open);
    return () => window.removeEventListener('controlled-journal-evidence', open);
  }, []);
  if (new URLSearchParams(location.search).get('view') === 'arena') {
    return (
      <ArenaLiveAccount
        detail={arenaAccountFixture()}
        agentId="agent"
        busy={false}
        onRetry={() => {}}
      />
    );
  }
  return (
    <main style={{ maxWidth: 900, margin: 'auto', minWidth: 0 }}>
      <button onClick={() => setEvidence(false)}>返回解读</button>
      {evidence ? (
        <JournalEvidenceScreen />
      ) : (
        <JournalAiPanel
          accountId={params.accountId}
          mode={params.mode}
          kind="object"
          existingRunId={params.runId}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Fixture />
  </QueryClientProvider>,
);
