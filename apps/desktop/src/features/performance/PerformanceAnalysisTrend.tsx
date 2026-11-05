import { useMemo, type ComponentProps } from 'react';
import type { Portfolio, PortfolioMode } from '../portfolio/portfolio.types.js';
import { PerformanceSnapshotTable } from './PerformanceTrendSection.js';
import { usePerformancePnlQuery } from './performance-pnl.queries.js';
import { portfolioPnlPoints } from './performance-pnl-model.js';
import { pnlPointsInRange, pnlQueryRange } from './performance-trend-range.js';
import type { Currency } from './performance.types.js';

const noHistory: never[] = [];

export function PerformanceAnalysisTrend({
  portfolio,
  mode,
  accountId,
  baseCurrency,
  ...trend
}: ComponentProps<typeof PerformanceSnapshotTable> & {
  portfolio: Portfolio | null;
  mode: PortfolioMode;
  accountId: string;
  baseCurrency: Currency;
}) {
  const currency = portfolio?.baseCurrency ?? baseCurrency;
  const query = usePerformancePnlQuery(mode, accountId, currency, pnlQueryRange(trend.range));
  const history = query.data?.points ?? noHistory;
  const points = useMemo(() => {
    const all = portfolio
      ? portfolioPnlPoints(history, portfolio)
      : history.map((point) => ({ ...point, current: false }));
    return pnlPointsInRange(all, trend.range, portfolio?.valuedAt ?? new Date().toISOString());
  }, [history, portfolio, trend.range]);
  return (
    <PerformanceSnapshotTable
      {...trend}
      pnl={{
        points,
        currency,
        loading: query.isPending,
        error: query.isError,
        historyEmpty: history.length === 0,
        truncated: query.data?.truncated === true,
        currentUnavailable: !portfolio,
        onRetry: () => void query.refetch(),
      }}
    />
  );
}
