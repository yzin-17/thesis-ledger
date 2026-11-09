import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { QuoteSection, FundNavSection } from '../src/features/market-detail/MarketDetailSections';
import { MarketNavChartReadout } from '../src/features/market-detail/MarketNavChartReadout';
import { MarketChartReadout } from '../src/features/market-detail/MarketChartReadout';
import { MarketPriceChart } from '../src/features/market-detail/MarketDetailCharts';
import { FundIntradayChart } from '../src/features/market-detail/FundIntradayChart';
import { MarketTradingOverlayControls } from '../src/features/market-detail/MarketTradingOverlayControls';
import { useMarketTradingOverlays } from '../src/features/market-detail/useMarketTradingOverlays';
import { marketNumberSample } from './market-number-samples';
import '../src/ui/styles.css';
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const values = marketNumberSample(scenario),
  plotValues = ['maximum', 'subnormal'].includes(scenario) ? marketNumberSample('integer') : values;
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false, staleTime: Infinity } },
});
client.setQueryData(['desktop', window.location.origin, 'local-workspace', 'arena-overlay', 'list'], []);
client.setQueryData(['market', 'fund-valuation', values.symbol], values.valuation);
client.setQueryData(
  ['market', 'fund-valuation-today', values.symbol, values.day],
  plotValues.today,
);
Object.defineProperty(window, '__readMarketNumberInput', {
  value: () =>
    JSON.stringify({
      values: { ...values, overlay: { measurement: values.overlay.measurement } },
      plot: plotValues.bars,
      valuation: client.getQueryData(['market', 'fund-valuation', values.symbol]),
      today: client.getQueryData(['market', 'fund-valuation-today', values.symbol, values.day]),
    }),
});
const retry = () => {
  throw new Error('数字验收不读取来源');
};
function Harness() {
  const overlay = useMarketTradingOverlays(plotValues.bars);
  useEffect(() => {
    document.documentElement.dataset.marketNumberReady = scenario;
  }, []);
  return (
    <MemoryRouter>
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-4 sm:p-6">
        <div data-qa-quote="">
          <QuoteSection
            section={{
              capability: 'quote',
              status: values.quote ? 'ready' : 'empty',
              ...(values.quote && { data: values.quote }),
            }}
            onRetry={retry}
            retrying={false}
          />
        </div>
        <div data-qa-nav="">
          <FundNavSection
            section={{
              capability: 'fund-nav',
              status: values.nav ? 'ready' : 'empty',
              ...(values.nav && { data: values.nav }),
            }}
            onRetry={retry}
            retrying={false}
          />
        </div>
        <div data-qa-nav-readout="">
          <MarketNavChartReadout
            selected={values.nav}
            selectedDate={null}
            locked={false}
            viewportChange={null}
          />
        </div>
        <div data-qa-chart-readout="">
          <MarketChartReadout
            selectedBar={values.bars.at(-1)}
            selectedPoint={values.point}
            selectedTimestamp={null}
            lockedTimestamp={null}
            visibleIndicators={['MA', 'MACD', 'RSI']}
            visibleMA={['ma5']}
            rsiPeriod={12}
            activePane="MACD"
            showBothPanes
          />
        </div>
        <div data-qa-measure="">
          <MarketTradingOverlayControls overlay={values.overlay} />
        </div>
        <button
          type="button"
          disabled={plotValues.bars.length === 0}
          onClick={() => overlay.update({ from: '2026-07-01', to: '2026-08-07' })}
        >
          受控选取区间
        </button>
        <div data-qa-stock="">
          <MarketPriceChart bars={plotValues.bars} tradingOverlay={overlay} />
        </div>
        <div data-qa-intraday="">
          <FundIntradayChart
            symbol={values.symbol}
            onHistory={() => {
              document.documentElement.dataset.marketNumberHistory = 'requested';
            }}
          />
        </div>
      </main>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Harness />
  </QueryClientProvider>,
);
