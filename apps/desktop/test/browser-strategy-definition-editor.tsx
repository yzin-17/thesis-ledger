import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyEditorSheet } from '../src/features/strategy/StrategyEditorSheet';
import type { StrategySchema } from '../src/features/strategy/strategy.types';
import '../src/ui/styles.css';
function Harness() {
  const [saved, setSaved] = useState<StrategySchema | null>(null);
  const schema = (window as unknown as { strategyEditorFixture: StrategySchema })
    .strategyEditorFixture;
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <StrategyEditorSheet
          open
          presentation="page"
          mode="edit"
          version={{ id: 'editor-version', version: 1, schema, createdAt: '' }}
          busy={false}
          onOpenChange={() => {}}
          onSave={setSaved}
        />
        <output className="hidden" data-testid="saved-definition">
          {saved ? JSON.stringify(saved) : ''}
        </output>
      </QueryClientProvider>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
