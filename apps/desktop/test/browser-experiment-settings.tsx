import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OptimizationPricePreparation } from '../src/features/strategy/OptimizationPricePreparation';
import { Button } from '../src/components/ui/button';
import { researchModel } from '../../../packages/schemas/test/price-research-fixture';
import type { OptimizationPreparationTarget } from '@thesis-ledger/schemas';
import '../src/ui/styles.css';

Object.assign(window, { experimentSettingsQa: { model: researchModel } });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const existing: OptimizationPreparationTarget = {
  sourceMode: 'existing',
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
};
const discovery: OptimizationPreparationTarget = {
  sourceMode: 'discovery',
  discoveryScope: {
    executionInstrument: { symbol: researchModel.scope.symbol, market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
  },
};
function Harness() {
  const [target, setTarget] = useState(existing);
  const [startDate, setStartDate] = useState('2024-01-02');
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-5">
      <h1 className="text-xl font-semibold">预算与确认</h1>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setTarget(discovery)}>
          切换探索样本
        </Button>
        <Button variant="outline" onClick={() => setStartDate('2024-02-01')}>
          切换区间样本
        </Button>
      </div>
      <OptimizationPricePreparation
        target={target}
        startDate={startDate}
        endDate="2024-03-29"
        currency="CNY"
        initialCash="10000"
        onPrepared={() => undefined}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Harness />
  </QueryClientProvider>,
);
