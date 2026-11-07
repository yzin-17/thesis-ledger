import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  StrategyVersionPage,
  type StrategyVersionTabState,
} from '../src/features/strategy/StrategyLibraryPages';
import { strategySummarySamples, strategySummaryVersion } from './strategy-summary-ratio-samples';
import '../src/ui/styles.css';
const name = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const sample = strategySummarySamples.find((s) => s.name === name);
if (!sample && !['missing', 'invalid'].includes(name)) throw new Error('未知策略摘要样本');
const version = sample
  ? strategySummaryVersion(sample.ratio, sample.cost, 'target' in sample && sample.target)
  : strategySummaryVersion(name === 'invalid' ? '0' : '0.25');
if (name === 'missing') delete version.schema!.entry;
const strategies = [
  { id: 'ratio-strategy', name: '精度验收策略', status: 'active', versions: [version] },
];
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
function Harness() {
  const [tabState, setTabState] = useState<StrategyVersionTabState>({
    sourceKey: 'ratio-strategy:ratio-version',
    value: 'definition',
  });
  useEffect(() => {
    document.documentElement.dataset.summaryRatioReady = name;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/strategy/ratio-strategy/ratio-version']}>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">
          <Routes>
            <Route
              path="/strategy/:strategyId/:versionId"
              element={
                <StrategyVersionPage
                  strategies={strategies}
                  loading={false}
                  onBacktest={() => {
                    throw new Error('验收不创建回测');
                  }}
                  tabState={tabState}
                  onTabChange={setTabState}
                />
              }
            />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
