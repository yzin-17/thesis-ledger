import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import type { MarketDetailPosition } from './market-detail.types.js';
import { fundNavTradeGroups } from './fund-nav-trade-model.js';

const unavailableReasons = {
  marker_budget_exceeded: '成交记录过多，暂时无法显示买卖点。',
  account_scope_unavailable: '当前账户与账户类型不匹配，无法读取成交。',
  projection_inconsistent: '成交记录正在更新，请稍后重试。',
};

export function useFundNavTrades(history: FundNavHistory, position?: MarketDetailPosition) {
  const symbol = history[0]?.symbol;
  const start = history[0]?.navDate.slice(0, 10);
  const end = history.at(-1)?.navDate.slice(0, 10);
  const accountId = position?.accountId;
  const mode = position?.mode;
  const enabled = Boolean(
    accountId && mode && symbol && position?.symbol === symbol && start && end,
  );
  const scope = JSON.stringify([accountId, mode, symbol, start, end]);
  const query = useQuery({
    queryKey: ['desktop', 'fund-nav-trades', accountId, mode, symbol, start, end],
    queryFn: ({ signal }) => {
      if (!accountId || !mode || !symbol || !start || !end) throw new Error('缺少账户或净值范围');
      return getDesktopApiClient().portfolio.getTradeChart(
        { accountId, mode, symbol, start, end },
        signal,
      );
    },
    enabled,
    staleTime: 15_000,
    retry: false,
  });
  const data = query.data;
  const response =
    enabled &&
    data?.version === 'trade-chart-v1' &&
    data.accountId === accountId &&
    data.mode === mode &&
    data.symbol === symbol &&
    data.start === start &&
    data.end === end
      ? data
      : undefined;
  const placed = useMemo(
    () => fundNavTradeGroups(history, response?.status === 'ready' ? response.markers : []),
    [history, response],
  );
  let notice = '';
  if (response?.status === 'unavailable') notice = unavailableReasons[response.reason];
  else if (response?.status === 'ready') {
    const count = placed.groups.reduce((sum, group) => sum + group.trades.length, 0);
    if (count === 0) notice = '净值历史范围内暂无可显示的买卖点。';
    if (placed.unmatched) notice += ` ${placed.unmatched}条成交当天无净值，未绘制。`;
    if (response.omittedCount)
      notice += ` ${response.omittedCount}条成交缺少有效价格、数量或时间，未绘制。`;
    if (response.unplacedCount) notice += ` 该标的另有${response.unplacedCount}条成交缺少日期。`;
  }
  return {
    enabled,
    scope,
    groups: placed.groups,
    notice,
    loading: enabled && query.isFetching,
    error: enabled && (query.isError || (query.isSuccess && !response)),
    unavailable: response?.status === 'unavailable',
    retry: () => void query.refetch(),
    position,
  };
}
export type FundNavTrades = ReturnType<typeof useFundNavTrades>;
