import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { QuoteSection, ChipSection } from '../src/features/market-detail/MarketDetailSections';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts';
import { FundNavHistoryChart } from '../src/features/market-detail/MarketNavChart';
import { MarketNavChartReadout } from '../src/features/market-detail/MarketNavChartReadout';
import { FundCurrentValuation } from '../src/features/market-detail/FundCurrentValuation';
import { marketPercentSample } from './market-percent-unit-samples';
import '../src/ui/styles.css';
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const values = marketPercentSample(scenario),
  { sample, quote, chip, bars, history, valuation, today, symbol, day } = values;
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
client.setQueryData(['market', 'fund-valuation', symbol], valuation);
client.setQueryData(['market', 'fund-valuation-today', symbol, day], today);
Object.defineProperty(window, '__readMarketPercentInput', {
  value: () =>
    JSON.stringify({
      values,
      valuation: client.getQueryData(['market', 'fund-valuation', symbol]),
      today: client.getQueryData(['market', 'fund-valuation-today', symbol, day]),
    }),
});
const retry = () => {
  throw new Error('验收不发起来源请求');
};
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.marketPercentRaw = JSON.stringify(values);
    document.documentElement.dataset.marketPercentReady = scenario;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <main className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6">
          <div data-qa-quote="">
            <QuoteSection
              section={{ capability: 'quote', status: 'ready', data: quote }}
              onRetry={retry}
              retrying={false}
            />
          </div>
          <div data-qa-chip="">
            <ChipSection
              section={{
                capability: 'chip',
                status: chip ? 'ready' : 'empty',
                ...(chip && { data: chip }),
              }}
              onRetry={retry}
              retrying={false}
            />
          </div>
          <FundCurrentValuation symbol={symbol} />
          <MarketPriceChart bars={bars} />
          <div data-qa-history="">
            <FundNavHistoryChart history={history} />
          </div>
          <div data-qa-direct-readout="">
            <MarketNavChartReadout
              selectedDate={null}
              selected={history.at(-1)}
              locked={false}
              viewportChange={scenario === 'maximum-percent' ? Number.MAX_VALUE : sample.ratio}
            />
          </div>
        </main>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
