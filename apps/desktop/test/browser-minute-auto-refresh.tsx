import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketDetailDialog } from '../src/features/market-detail/MarketDetailDialog.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
const symbol = '600036.SH';
localStorage.setItem('thesis-ledger:market-period-preference', '1m');
for (const limit of [90, 2])
  client.setQueryData(['desktop', 'market-period-options', symbol, 'qfq', limit], { options: [] });
client.setQueryData(['desktop', 'market-minute-options', symbol, '1m'], {
  symbol,
  timeframe: '1m',
  options: [{ adjustment: 'none', available: true }],
});
client.setQueryData(['desktop', 'market-derived-minute-options', symbol, 90], {
  version: 'market-minute-options-v1',
  symbol,
  options: [],
});
function Fixture() {
  const [open, setOpen] = useState(true);
  return (
    <QueryClientProvider client={client}>
      <main className="p-4">
        <h1 className="text-xl">分钟行情自动刷新（受控样本）</h1>
        <button onClick={() => setOpen(true)}>打开行情</button>
        {open && (
          <MarketDetailDialog
            position={{ symbol, asset: { name: '招商银行', assetType: 'stock' } }}
            onClose={() => setOpen(false)}
          />
        )}
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
