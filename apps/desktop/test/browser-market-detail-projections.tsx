import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { marketDisplayDetailResponseSchema } from '@thesis-ledger/schemas';
import { MarketDetailDialogContent } from '../src/features/market-detail/MarketDetailDialogContent';
import { marketNumberSample } from './market-number-samples';
import '../src/ui/styles.css';

const values = marketNumberSample('ordinary');
const detail = marketDisplayDetailResponseSchema.parse({
  contractVersion: 1,
  symbol: values.symbol,
  assetType: 'STOCK',
  identity: { source: 'asset', status: 'confirmed' },
  requested: ['quote'],
  capabilities: { supported: ['quote'], unsupported: ['chip'] },
  limits: { bars: 90, nav: 90 },
  sections: { quote: { capability: 'quote', status: 'ready', data: values.quote } },
  dependencies: {},
  requestId: 'controlled-market-detail',
  generatedAt: '2026-11-08T00:00:00Z',
});
const noop = () => {};
function Harness() {
  const [open, setOpen] = useState(true);
  if (!open) return <button onClick={() => setOpen(true)}>重新打开详情</button>;
  return (
    <MarketDetailDialogContent
      position={{ symbol: values.symbol, asset: { name: '受控行情详情', assetType: 'stock' } }}
      unit="股"
      queryNotice={null}
      loading={false}
      stale={false}
      staleNotice={{ state: 'info', title: '', description: '' }}
      retryError={null}
      visibleDetail={detail}
      quoteInfoNotice={null}
      quoteSection={detail.sections.quote}
      barsSection={undefined}
      chartIndicators={[]}
      chartPoints={undefined}
      onIndicatorParamsChange={noop}
      onLoadEarlier={noop}
      canLoadEarlier={false}
      historyLoading={false}
      historyError={null}
      onRetryEarlier={noop}
      onLoadLater={noop}
      onRetryLater={noop}
      canLoadLater={false}
      latestLoading={false}
      latestNotice={null}
      latestError={null}
      chipSection={undefined}
      fundNavSection={undefined}
      fundNavHistorySection={undefined}
      indicatorCapabilities={[]}
      retrying={null}
      onRetrySection={async () => {}}
      onClose={() => setOpen(false)}
    />
  );
}
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>
  </MemoryRouter>,
);
