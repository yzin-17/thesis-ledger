import { formatMarketNumber, formatPercentValue } from '@thesis-ledger/domain';
import { Spinner } from '@/components/ui/spinner';
import { useQuery } from '@tanstack/react-query';
import type { FundValuation } from '@thesis-ledger/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { marketToneClass, marketToneForValue } from '@/ui/market-color';
import { getDesktopApiClient } from '../../shared/api/client.js';

const clock = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const reasonLabels: Record<FundValuation['reasons'][number], string> = {
  market_closed: '已休市', nav_unavailable: '净值不可用', disclosure_unavailable: '持仓证据不足',
  prices_unavailable: '报价不可用', source_unavailable: '来源不可用',
  low_coverage: '低覆盖', partial_coverage: '部分覆盖',
  currency_unverified: '币种待确认', currency_unsupported: '币种暂不支持',
  calendar_unavailable: '交易日历不可用',
};

export function FundCurrentValuation({ symbol }: { symbol: string }) {
  const query = useQuery({
    queryKey: ['market', 'fund-valuation', symbol],
    queryFn: ({ signal }) => getDesktopApiClient().market.getFundValuation(symbol, signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const value = query.data;
  let status = '估算';
  if (query.isPending) status = '读取中';
  else if (query.isError) status = '读取失败';
  else if (value?.marketState === 'unknown') status = '交易时段未知';
  else if (value?.marketState === 'closed') {
    status = '已休市';
    if (value.quality === 'low_coverage') status += ' · 低覆盖';
    else if (value.quality === 'partial') status += ' · 部分覆盖';
  }
  else if (value?.reasons[0]) status = reasonLabels[value.reasons[0]];
  const showRetry = query.isError || value?.quality === 'unavailable' && value.marketState !== 'closed';
  const change = value?.changePercent;
  const tone = marketToneForValue(change ?? null);

  return (
    <div className="grid min-w-0 content-start gap-1 py-2" data-fund-current-valuation={symbol}>
      <span className="text-xs text-muted-foreground">盘中估值</span>
      <div className="flex min-h-7 flex-wrap items-baseline gap-x-2">
        <strong className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatMarketNumber(value?.estimatedNav, 'valuation')}
        </strong>
        {change != null ? (
          <span className={cn('text-xs tabular-nums', marketToneClass(tone))}>
            {formatPercentValue(change, 'always')}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-4 flex-wrap items-center gap-x-2 text-xs text-muted-foreground" role="status">
        {query.isFetching && <Spinner aria-label="正在读取盘中估值" />}
        <span>{status}{value?.estimatedAt ? ` · ${clock.format(new Date(value.estimatedAt))}` : ''}</span>
        {showRetry ? (
          <Button className="h-auto p-0 text-xs" type="button" size="sm" variant="link" onClick={() => void query.refetch()}>
            重试估值
          </Button>
        ) : null}
      </div>
    </div>
  );
}
