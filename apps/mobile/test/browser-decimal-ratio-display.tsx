import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fundDailyErrorSchema } from '@thesis-ledger/schemas';
import { DailyFundComparison } from '../src/features/market-detail/DailyFundComparison';

const tiny = '0.' + '0'.repeat(399) + '1';
const values: Record<string, string> = {
  ordinary: '0.33333333333333333333',
  grouped: '10',
  rounding: '0.01005000000000000000001',
  tiny,
  negative: '-' + tiny,
  huge: '1' + '0'.repeat(400),
  empty: tiny,
  error: tiny,
};
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
if (!(scenario in values)) throw new Error('未知的文本比例样本');
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } },
});
const key = ['ratio-display-sample', 'fund-daily-error', '000001.OF'];
if (scenario === 'error')
  client
    .getQueryCache()
    .build(client, { queryKey: key })
    .setState({ status: 'error', error: new Error('受控读取失败'), fetchStatus: 'idle' });
else
  client.setQueryData(
    key,
    scenario === 'empty'
      ? null
      : fundDailyErrorSchema.parse({
          symbol: '000001.OF',
          day: '2026-11-07',
          method: 'disclosed-holdings-qfq-v1',
          estimatedAt: '2026-11-07T07:00:00.000Z',
          estimatedNav: 1.01,
          pricedCoverage: 1e-9,
          quality: 'low_coverage',
          official: {
            unitNav: 1,
            navDate: '2026-11-07T00:00:00.000Z',
            provider: '受控来源',
            upstreamSource: '受控来源',
            fetchedAt: '2026-11-07T08:00:00.000Z',
            servedFromCache: true,
          },
          errors: { signed: '0.01', absolute: '0.01', relativeAbsolute: values[scenario] },
        }),
  );
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.decimalRatioReady = scenario;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <main style={{ padding: 16 }} data-decimal-mobile="">
        <DailyFundComparison symbol="000001.OF" />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
