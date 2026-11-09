import { useMemo, useState, type ReactNode } from 'react';
import type { ChartRange } from './chart-date-range.js';
import { useFundRangeHistory } from './useFundRangeHistory.js';
import { useQuery } from '@tanstack/react-query';
import type { Currency, FundNavHistory } from '@thesis-ledger/schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { performancePnlKeys } from '../performance/performance-pnl.queries.js';
import { FundNavHistoryChart } from './MarketNavChart.js';
import type { MarketDetailPosition } from './market-detail.types.js';
import { instrumentPnlPoints } from './instrument-pnl-model.js';
import { useFundNavTrades, type FundNavTrades } from './useFundNavTrades.js';

export function FundNavPnlChart({
  history,
  position,
}: {
  history: FundNavHistory;
  position?: MarketDetailPosition | undefined;
}) {
  const [range, setRange] = useState<ChartRange>(30);
  const rangeHistory = useFundRangeHistory(history, range);
  const rangeProps = { range, onRangeChange: setRange, historyLoading: rangeHistory.loading,
    historyNotice: rangeHistory.notice ? <p className="m-0 text-xs text-muted-foreground" role="status">
      {rangeHistory.notice}{rangeHistory.error && <Button type="button" size="sm" variant="outline" onClick={rangeHistory.retry}>重试区间</Button>}
    </p> : null };
  const trades = useFundNavTrades(rangeHistory.history, position);
  if (!position?.accountId || !position.mode || !position.currency || !position.valuedAt)
    return <FundNavHistoryChart history={rangeHistory.history} position={position} trades={trades} {...rangeProps} />;
  return (
    <ScopedFundNavPnlChart
      key={`${position.accountId}:${position.mode}:${position.symbol}`}
      history={rangeHistory.history}
      {...rangeProps}
      trades={trades}
      position={position}
      accountId={position.accountId}
      mode={position.mode}
      currency={position.currency}
      at={position.valuedAt}
    />
  );
}

function ScopedFundNavPnlChart({
  history,
  position,
  accountId,
  mode,
  currency,
  at,
  trades,
  range, onRangeChange, historyLoading, historyNotice,
}: {
  history: FundNavHistory;
  position: MarketDetailPosition;
  accountId: string;
  mode: 'actual' | 'shadow';
  currency: Currency;
  at: string;
  trades: FundNavTrades;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  historyLoading: boolean;
  historyNotice: ReactNode;
}) {
  const query = useQuery({
    queryKey: [
      ...performancePnlKeys.scope(mode, accountId),
      currency,
      'ALL',
      { symbol: position.symbol, asOf: at },
    ],
    queryFn: ({ signal }) =>
      getDesktopApiClient().performance.getPnlSeries(
        {
          mode,
          accountId,
          symbol: position.symbol,
          baseCurrency: currency,
          range: 'ALL',
          asOf: at,
        },
        signal,
      ),
    staleTime: 15_000,
    retry: false,
  });
  const points = useMemo(
    () =>
      instrumentPnlPoints(
        query.data?.points ?? [],
        at,
        position.pnl,
        query.data?.currentRealizedPnl,
      ),
    [query.data, at, position.pnl],
  );
  const notice = (
    <>
      {query.isError ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>盈亏历史读取失败{query.data ? '，保留上次记录。' : ''}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
              重试标的盈亏
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
  return (
    <FundNavHistoryChart
      history={history}
      position={position}
      range={range} onRangeChange={onRangeChange} historyLoading={historyLoading} historyNotice={historyNotice}
      pnl={{ points, currency, notice, loading: query.isFetching }}
      trades={trades}
    />
  );
}
