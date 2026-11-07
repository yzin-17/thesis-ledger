import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { arenaRatio } from '@thesis-ledger/domain';
import { FundDailyComparison } from '../src/features/market-detail/FundDailyComparison';
import { NavBacktestResult } from '../src/features/strategy/NavBacktestResult';
import { NavBacktestModel } from '../src/features/strategy/NavBacktestModel';
import { navRatioResult, navRatioModel, fundRatioRow, tinyRatio } from './decimal-ratio-samples';
import '../src/ui/styles.css';

const values: Record<string, string> = {
  ordinary: '0.33333333333333333333',
  grouped: '10',
  rounding: '0.01005000000000000000001',
  tiny: tinyRatio,
  negative: '-' + tinyRatio,
  huge: '1' + '0'.repeat(400),
  empty: tinyRatio,
  error: tinyRatio,
};
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
if (!(scenario in values)) throw new Error('未知的文本比例样本');
const ratio = values[scenario]!;
const fee = scenario === 'grouped' ? '10' : tinyRatio;
const model = navRatioModel(fee);
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, staleTime: Infinity, retry: false } },
});
const key = ['market', 'fund-daily-error', '000001.OF'];
if (scenario === 'error')
  client
    .getQueryCache()
    .build(client, { queryKey: key })
    .setState({ status: 'error', error: new Error('受控读取失败'), fetchStatus: 'idle' });
else client.setQueryData(key, scenario === 'empty' ? null : fundRatioRow(ratio));
function Harness() {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.decimalRatioReady = scenario;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <h1 className="text-xl font-semibold">文本比例实际组件验收</h1>
        <section data-decimal-fund="">
          <FundDailyComparison symbol="000001.OF" />
        </section>
        <section data-decimal-arena="">竞赛观察 {arenaRatio(ratio)}</section>
        <section data-decimal-model="">
          <NavBacktestModel
            text={JSON.stringify(model)}
            symbol="000001.OF"
            startDate="2026-09-08"
            endDate="2026-09-15"
            confirmed={confirmed}
            onChange={() => {}}
            onConfirm={() => setConfirmed(true)}
          />
        </section>
        <section data-decimal-result="">
          <NavBacktestResult result={navRatioResult(ratio, fee)} />
        </section>
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
