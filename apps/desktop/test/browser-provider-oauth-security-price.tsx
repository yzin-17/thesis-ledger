import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { securityStaticInfoResponseSchema } from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button.js';
import { ProviderOAuthPanel } from '../src/features/market-data/ProviderOAuthPanel.js';
import { SecurityStaticPriceDialog } from '../src/features/market-data/SecurityStaticPriceDialog.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
client.setQueryData(['market-provider-oauth', 'current'], { session: null });
const info = securityStaticInfoResponseSchema.parse({
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'controlled',
  symbol: 'SPY.US',
  assetType: 'ETF',
  market: 'US',
  name: '受控 SPY',
  securityId: '9007199254740993',
  sharesPerLot: '1',
  listingDate: null,
  delisted: false,
  exchange: null,
  provider: 'futu',
  historicalChanges: 'unverified',
  observedAt: '2026-11-12T01:00:00Z',
  fetchedAt: '2026-11-12T01:01:00Z',
  policyRevision: 1,
  routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
});
const rootKey = ['desktop', 'security-static-price', info.symbol, info.assetType];
const priceWindow = { start: '2026-11-10', end: '2026-11-12' };
for (const timeframe of ['1d', '1m']) {
  client.setQueryData([...rootKey, 'plan', timeframe], {
    window: priceWindow,
    options: ['none', 'qfq', 'hfq'].map((adjustment) => ({ adjustment, available: true })),
  });
  for (const adjustment of ['none', 'qfq', 'hfq']) {
    client.setQueryData([...rootKey, 'bars', timeframe, adjustment, priceWindow], {
      identity: { symbol: info.symbol, timeframe, adjustment },
      inputFingerprint: 'controlled',
      provenance: {
        providerId: 'controlled',
        upstreamSource: 'controlled',
        cacheStatus: 'fresh',
        servedFromCache: true,
        fetchedAt: info.fetchedAt,
      },
      points: [0, 1, 2].map((index) => ({
        timestamp: new Date(Date.UTC(2026, 10, 10 + index, 20)).toISOString(),
        open: 600 + index,
        high: 605 + index,
        low: 599 + index,
        close: 603 + index,
        volume: 1000 + index,
        completionStatus: 'complete',
      })),
    });
  }
}
client.setQueryData([...rootKey, 'quote'], {
  version: 3,
  symbol: info.symbol,
  price: 605,
  units: { priceCurrency: 'USD' },
  provider: 'controlled',
  marketTime: '2026-11-12T20:00:00Z',
  fetchedAt: info.fetchedAt,
  stale: false,
  freshness: 'delayed',
});

function Harness() {
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setConfigured(!configured)}>
          切换既有授权
        </Button>
        <Button variant="outline" onClick={() => setOpen(true)}>
          证券行情
        </Button>
      </div>
      <ProviderOAuthPanel credentialConfigured={configured} />
      {open && <SecurityStaticPriceDialog info={info} onClose={() => setOpen(false)} />}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Harness />
  </QueryClientProvider>,
);
