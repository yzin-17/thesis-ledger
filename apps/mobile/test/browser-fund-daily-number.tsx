import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DailyFundComparison } from '../src/features/market-detail/DailyFundComparison';
import { fundDailySamples, fundDailyNumberSample } from './fund-daily-number-samples';
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const sampleName = fundDailySamples.some((value) => value.name === scenario)
  ? scenario
  : 'ordinary';
let row: ReturnType<typeof fundDailyNumberSample> = fundDailyNumberSample(sampleName);
if (scenario === 'waiting') row = { ...row!, official: null, errors: null };
else if (scenario === 'empty') row = null;
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } },
});
const key = ['ratio-display-sample', 'fund-daily-error', '000001.OF'];
if (scenario === 'error')
  client
    .getQueryCache()
    .build(client, { queryKey: key })
    .setState({ status: 'error', error: new Error('受控读取失败'), fetchStatus: 'idle' });
else if (scenario === 'loading')
  client
    .getQueryCache()
    .build(client, { queryKey: key })
    .setState({ status: 'pending', fetchStatus: 'fetching' });
else {
  client.setQueryData(key, row);
  if (scenario === 'refresh')
    client.getQueryCache().find({ queryKey: key })!.setState({ fetchStatus: 'fetching' });
}
Object.defineProperty(window, '__readFundDailyData', {
  value: () => JSON.stringify({ source: row, cache: client.getQueryData(key) }),
});
Object.defineProperty(window, '__readFundDailyQuery', {
  value: () => {
    const state = client.getQueryState(key);
    return {
      status: state?.status,
      fetchStatus: state?.fetchStatus,
      error: state?.error instanceof Error ? state.error.message : null,
    };
  },
});
function finish() {
  client.setQueryData(key, row);
  client.getQueryCache().find({ queryKey: key })!.setState({ fetchStatus: 'idle' });
}
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.fundDailyNumberReady = scenario;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <main style={{ padding: 16 }}>
        <div data-fund-daily-number="">
          <DailyFundComparison symbol="000001.OF" />
        </div>
        {['refresh', 'loading'].includes(scenario) ? (
          <button type="button" onClick={finish}>
            完成受控读取
          </button>
        ) : null}
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
