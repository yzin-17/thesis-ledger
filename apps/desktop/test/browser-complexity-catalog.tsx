import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { InstrumentCatalogPanel } from '../src/features/market-data/InstrumentCatalogPanel';
import '../src/ui/styles.css';

function Fixture() {
  const [phase, setPhase] = useState('idle');
  const [confirmed, setConfirmed] = useState(false);
  const results = ['ready', 'refreshing'].includes(phase)
    ? [
        {
          id: 'controlled-stock',
          symbol: '00700.HK',
          canonicalCode: '00700',
          instrumentType: 'STOCK',
          market: 'HK',
          displayName: '受控长名称标的 · 腾讯控股目录样本',
          confirmable: true,
          confirmed,
        },
      ]
    : [];
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex flex-wrap gap-2">
        {['idle', 'loading', 'error', 'empty', 'ready', 'refreshing'].map((state) => (
          <Button key={state} variant="outline" onClick={() => setPhase(state)}>
            {state}
          </Button>
        ))}
      </div>
      <InstrumentCatalogPanel
        catalog={{ generation: 1, instrumentCount: 1234 }}
        disabled={false}
        syncing={false}
        searchBusy={phase === 'loading' || phase === 'refreshing'}
        searchRefreshing={phase === 'refreshing'}
        searchRequested={phase !== 'idle'}
        searchError={phase === 'error' ? '受控读取失败' : null}
        searchResults={results}
        confirmingId={null}
        onSync={() => {}}
        onSearch={() => setPhase('ready')}
        onRetrySearch={() => setPhase('ready')}
        onConfirm={() => setConfirmed(true)}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
