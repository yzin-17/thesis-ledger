import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routingAuthoringSchema, type MarketRouteCatalogReadV3 } from '@thesis-ledger/schemas';
import { MarketProviderPanel } from '../src/features/market-data/MarketProviderPanel';
import { RoutingSourcePair } from '../src/features/market-data/RoutingSourcePair';
import { ProviderExactChecksSheet } from '../src/features/market-data/ProviderExactChecksSheet';
import { Button } from '../src/components/ui/button';
import { catalog, provider, key, target } from './market-policy-defaults.fixture';
import '../src/ui/styles.css';

const sample = {
  ...provider,
  accountAccessSupported: true,
  configVersion: 1,
  credentialSource: 'control' as const,
};
const scope = {
  category: 'market',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;

function Fixture() {
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [config, setConfig] = useState(() =>
    routingAuthoringSchema.parse({ version: 1, rules: [], keys: [key], preserved: [] }),
  );
  const current: MarketRouteCatalogReadV3 = {
    ...catalog,
    entries: [
      {
        key,
        target,
        state: 'ready',
        accountAccess: { state: 'unknown', attempted: false },
        verification: verified
          ? {
              state: 'verified',
              verifiedAt: '2026-11-11T09:00:00Z',
              configVersion: 1,
              evidenceHash: 'a'.repeat(64),
            }
          : { state: 'unverified' },
      },
    ],
  };
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <h1 className="text-xl">能力首次使用验收</h1>
      <RoutingSourcePair
        label=""
        config={config}
        scope={scope}
        catalog={current.entries}
        providers={[sample]}
        onChange={setConfig}
      />
      <MarketProviderPanel
        providers={[sample]}
        catalog={current}
        disabled={false}
        busyAction={null}
        onProviderChange={() => undefined}
        onConfigure={() => undefined}
        onRemove={() => undefined}
        onTest={() => setChecking(true)}
      />
      <Button onClick={() => setVerified(true)}>切换受控成功记录</Button>
      {checking && (
        <ProviderExactChecksSheet
          provider={sample}
          catalog={current}
          onClose={() => setChecking(false)}
          onConfigure={() => undefined}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>,
);
