import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import {
  Action,
  Choices,
  Copy,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import type { PortfolioStackParams } from '../../app/navigation-types';
export function TradesScreen() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'Trades'>>();
  const accountId = params?.accountId ?? 'all';
  return <TradesWorkspace key={accountId} initialAccountId={accountId} />;
}
function TradesWorkspace({ initialAccountId }: { initialAccountId: string }) {
  const { api, mode, scope } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<PortfolioStackParams>>();
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [symbol, setSymbol] = useState('');
  const [search, setSearch] = useState('');
  const query = useInfiniteQuery({
    queryKey: [...scope, 'trades', accountId, search],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const result = await api.portfolio.getTrades({
        mode,
        limit: 20,
        ...(accountId !== 'all' ? { accountId } : {}),
        ...(search ? { symbol: search } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      if (
        result.mode !== mode ||
        result.items.some(
          (trade) =>
            trade.accountMode !== mode || (accountId !== 'all' && trade.accountId !== accountId),
        )
      )
        throw new Error('交易响应与当前范围不一致。');
      return result;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page title="交易">
      <Choices
        label="账户范围"
        value={accountId}
        options={[
          { value: 'all', label: '全部账户' },
          ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
        ]}
        onChange={setAccountId}
      />
      <Field label="标的代码筛选" value={symbol} onChange={setSymbol} />
      <Action label="筛选交易" onPress={() => setSearch(symbol.trim())} />
      <QueryStatus query={query} empty={items.length === 0} retry={() => void query.refetch()} />
      {items.map((trade) => (
        <Section key={trade.id} title={trade.assetName ?? trade.symbol}>
          <Copy>
            {trade.symbol} · {trade.lifecycle === 'ACTIVE' ? '进行中' : '已结束'} · 剩余数量{' '}
            {trade.remainingQuantity}
          </Copy>
          <Copy>已实现净盈亏 {trade.netRealizedPnl ?? '不可用'}</Copy>
          <Copy muted>
            {trade.completeness === 'COMPLETE' ? '事实完整' : '事实不完整'} ·{' '}
            {trade.openedAt ?? '建仓时间未知'}
          </Copy>
          <Action
            label="查看交易详情"
            onPress={() =>
              navigation.navigate('TradeDetail', {
                accountId: trade.accountId,
                tradeId: trade.id,
                mode,
              })
            }
          />
        </Section>
      ))}
      {query.hasNextPage ? (
        <Action
          label={query.isFetchingNextPage ? '加载中…' : '加载更多交易'}
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
