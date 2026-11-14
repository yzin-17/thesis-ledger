import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { MarketNewsResult } from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { MarketDataPage } from '../src/features/market-data/MarketDataPage.js';
import { NewsResult } from '../src/features/market-data/MarketNewsResult.js';
import { ProviderCredentialsSheet } from '../src/features/market-data/ProviderCredentialsSheet.js';
import { ProviderExactChecksSheet } from '../src/features/market-data/ProviderExactChecksSheet.js';
import { marketDataKeys } from '../src/features/market-data/market-data.queries.js';
import { routingConfigKey } from '../src/features/market-data/useRoutingConfig.js';
import { provider, policy, catalog } from './market-policy-defaults.fixture.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
});
const credentials = {
  ...provider,
  configVersion: 1,
  credentialSource: 'control' as const,
  credentialMethod: 'api_key',
  credentialFieldsConfigured: { apiKey: true },
  credentialSchema: {
    methods: [{ method: 'api_key', fields: [{ name: 'apiKey', secret: true, required: true }] }],
  },
};
client.setQueryData(marketDataKeys.providers(), [credentials]);
client.setQueryData(marketDataKeys.policy(), policy);
client.setQueryData(marketDataKeys.routeCapabilities(), catalog);
client.setQueryData(marketDataKeys.catalog(), { instrumentCount: 12 });
client.setQueryData(routingConfigKey, {
  revision: 9,
  catalogRevision: 10,
  catalogStatus: 'complete',
  syncState: 'applied',
  config: { version: 1, keys: [], preserved: [], rules: [] },
  diagnostics: [],
  newKeys: [],
});
client.setQueryData(['market-provider-oauth', 'current'], { session: null });
const news: MarketNewsResult = {
  instrument: { symbol: '600036.SH', market: 'CN', assetType: 'STOCK' },
  status: 'partial',
  nextCursor: 'controlled-next',
  source: null,
  fetchedAt: '2026-11-09T01:00:00Z',
  upstreamAttempts: 0,
  errors: [],
  cacheIdentity: null,
  items: [],
  coverage: {
    basis: 'current-search',
    complete: false,
    truncated: true,
    publishedStart: '2026-11-06T01:00:00Z',
    publishedEnd: '2026-11-09T01:00:00Z',
    unknownPublishedTimeCount: 0,
    examinedCount: 0,
    returnedCount: 0,
    uniqueEvidenceCount: 0,
    missingReasons: ['pagination_truncated'],
  },
};
function Harness() {
  const [open, setOpen] = useState<'credentials' | 'exact' | 'oauth' | null>(null);
  const [hasMore, setHasMore] = useState(true);
  return (
    <main className="content space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setOpen('credentials')}>
          受控凭证面板
        </Button>
        <Button variant="outline" onClick={() => setOpen('exact')}>
          受控精确检查
        </Button>
        <Button variant="outline" onClick={() => setOpen('oauth')}>
          受控认证切换
        </Button>
        <Button variant="outline" onClick={() => setHasMore(!hasMore)}>
          切换分页耗尽
        </Button>
      </div>
      <MarketDataPage />
      <NewsResult result={news} heading="受控新闻" hasMore={hasMore} />
      {open === 'credentials' && (
        <ProviderCredentialsSheet
          provider={credentials}
          catalog={catalog}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'oauth' && (
        <ProviderCredentialsSheet
          provider={{
            ...credentials,
            providerId: 'longbridge',
            displayName: 'Longbridge',
            credentialMethod: 'legacy',
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'exact' && (
        <ProviderExactChecksSheet
          provider={credentials}
          catalog={catalog}
          onClose={() => setOpen(null)}
          onConfigure={() => setOpen('credentials')}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ToastProvider>
        <ConfirmDialogProvider>
          <Harness />
        </ConfirmDialogProvider>
      </ToastProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
