import { useEffect, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { PerformanceResults } from '../src/features/performance-read/PerformanceResults';

const values: Record<string, number | null> = {
  ordinary: 1 / 3,
  rounding: 0.01005,
  small: 1e-9,
  negative: -1e-9,
  minimum: Number.MIN_VALUE,
  maximum: Number.MAX_VALUE,
  above: 2.25,
  zero: 0,
  unavailable: null,
};
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
if (!(scenario in values)) throw new Error('未知的比例验收样本');
const value = values[scenario]!;
function query<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    fetchStatus: 'idle',
    error: null,
    refetch() {
      throw new Error('只读隔离样本不应发起请求');
    },
  };
}
const queries = {
  summary: query({ ttwror: value, xirr: value }),
  series: query({
    range: '1m',
    interval: '1d',
    currency: 'CNY',
    dataQuality: 'COMPLETE',
    points: [
      {
        at: '2026-11-07T00:00:00.000Z',
        value: 100,
        currency: 'CNY',
        valuationBasis: 'OFFICIAL',
        disclosureCoverage: value,
        pricedCoverage: value,
      },
    ],
  }),
  layers: query(undefined),
  targets: query(undefined),
  history: query([]),
  allocationUnavailable: false,
  allocation: query({
    partial: false,
    allocation: [{ category: 'stock', value: 100, weight: value }],
    rebalance: [{ category: 'stock', targetWeight: value, amountGap: 0, direction: 'balanced' }],
  }),
} as unknown as ComponentProps<typeof PerformanceResults>['queries'];

function Harness() {
  useEffect(() => {
    document.documentElement.dataset.ratioReady = scenario;
  }, []);
  return (
    <main
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}
      data-mobile-ratio=""
    >
      <PerformanceResults queries={queries} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
