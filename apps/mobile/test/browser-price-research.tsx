import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BacktestInputFields } from '../src/features/backtest-setup/BacktestInputFields';
import { PriceResearchResult } from '../src/features/backtest-results/PriceResearchResult';
import { newBacktestForm } from '../src/features/backtest-setup/backtest-intent';
import { researchResult } from '../../../packages/schemas/test/price-research-fixture';
import {
  legacyVersion,
  researchVersion,
  sampleStrategy,
  researchModel,
} from '../../../packages/schemas/test/price-research-fixture';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  OptimizationResearchChoice,
  useOptimizationResearch,
} from '../src/features/optimization-setup/OptimizationResearch';
import { useStrategyLibrary } from '../src/features/strategy-library/useStrategyLibrary';
import { PreparedPriceSources } from '../src/features/backtest-setup/PreparedPriceSources';
import { Section } from '../src/components/MobilePrimitives';
import { OptimizationInstrument } from '../src/features/optimization-results/OptimizationInstrument';

const namedExperiment = { executionSymbol: '300058.SZ', instrumentDirectory: { generation: 1, unresolvedSymbols: [], items: [
  { symbol: '300058.SZ', canonicalCode: '300058', market: 'SZ', instrumentType: 'STOCK', displayName: '蓝色光标', active: true },
] } };

const baseSource = researchResult.actualSources.find(source => source.purpose === 'execution')!;
const preparedSources = {
  runConfig: { priceResearch: { actualPriceWindow: {} } },
  actualSource: { ...baseSource, provenance: { ...baseSource.provenance, providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 } },
  actualPriceSource: { ...baseSource, routeKey: { ...baseSource.routeKey, adjustment: 'none' }, provenance: { ...baseSource.provenance, providerId: 'hithink', upstreamSource: 'hithink-financial-api', routeIndex: 1 } },
};

Object.assign(window, {
  optimizationResearchQa: { legacyVersion, researchVersion, sampleStrategy, researchModel },
});
function OptimizationHarness() {
  const library = useStrategyLibrary();
  const [versionId, setVersionId] = useState(legacyVersion.id);
  const value = useOptimizationResearch({
    source: 'existing',
    versionId,
    discovery: '',
    library,
    onAdopt: setVersionId,
    form: { ...newBacktestForm('600519.SH'), start: '2024-01-02', end: '2024-03-29' },
  });
  return (
    <main style={{ padding: 16 }} data-price-research-qa="mobile-optimization">
      <OptimizationResearchChoice value={value} disabled={false} />
      <output>{versionId}</output>
    </main>
  );
}

function Harness() {
  const [form, setForm] = useState(newBacktestForm('600519.SH'));
  return (
    <main style={{ padding: 16 }} data-price-research-qa="mobile">
      <BacktestInputFields
        kind="ordinary"
        priceResearch
        value={form}
        onChange={setForm}
        disabled={false}
      />
      <PriceResearchResult result={researchResult} currency="CNY" />
      <Section title="实验准备结果"><PreparedPriceSources value={preparedSources as never} /></Section>
      <Section title="实验标的"><OptimizationInstrument value={namedExperiment as never} /></Section>
    </main>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    {new URLSearchParams(location.search).has('optimization') ? (
      <OptimizationHarness />
    ) : (
      <Harness />
    )}
  </QueryClientProvider>,
);
