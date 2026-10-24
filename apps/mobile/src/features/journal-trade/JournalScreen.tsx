import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import type { ResearchStackParams } from '../../app/navigation-types';
import {
  Action,
  Choices,
  Copy,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
export function JournalScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'Journal'>>();
  const { api, scope, mode, accountId: current } = useMobileRuntime();
  const accounts = useAccounts();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const [selected, setSelected] = useState(params?.accountId ?? current ?? '');
  const accountId = selected || accounts.data?.[0]?.id || '';
  const [symbol, setSymbol] = useState('');
  const [search, setSearch] = useState('');
  const locator = { accountId, mode };
  const reference = params?.tradeId
    ? {
        ...locator,
        tradeId: params.tradeId,
        ...(params.closeSliceId
          ? { reviewObjectType: 'CLOSE_SLICE' as const, closeSliceId: params.closeSliceId }
          : { reviewObjectType: 'TRADE_CYCLE' as const }),
      }
    : null;
  const located = useQuery({
    queryKey: [...scope, 'journal-reference', reference],
    enabled: Boolean(reference && accountId),
    queryFn: ({ signal }) => api.journalReviews.resolveReference(reference!, signal),
    retry: false,
  });
  const query = useInfiniteQuery({
    queryKey: [...scope, 'journal-candidates', accountId, search],
    enabled: Boolean(accountId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.journalReviews.candidates(
        {
          ...locator,
          ...(search ? { symbol: search } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: 20,
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const open = (reviewObjectId: string) =>
    navigation.navigate('JournalObject', { ...locator, reviewObjectId });
  return (
    <Page title="复盘">
      <QueryStatus query={accounts} retry={() => void accounts.refetch()} />
      <Choices
        label="复盘账户"
        value={accountId}
        options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
        onChange={setSelected}
      />
      {reference ? (
        <Section title="交易定位">
          <QueryStatus query={located} retry={() => void located.refetch()} />
          {located.data ? (
            <Action
              label="打开已定位复盘对象"
              onPress={() => open(located.data.input.reference.reviewObjectId)}
            />
          ) : null}
        </Section>
      ) : null}
      <Action
        label="行为与区间复盘"
        disabled={!accountId}
        onPress={() => navigation.navigate('JournalPeriod', locator)}
      />
      <Action
        label="历史快照"
        disabled={!accountId}
        onPress={() => navigation.navigate('JournalHistory', locator)}
      />
      <Action
        label="AI 解读任务历史"
        disabled={!accountId}
        onPress={() => navigation.navigate('JournalAiHistory', locator)}
      />
      <Field label="复盘标的筛选" value={symbol} onChange={setSymbol} />
      <Action label="筛选复盘" onPress={() => setSearch(symbol.trim())} />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.data?.pages
        .flatMap((p) => p.items)
        .map((row) => (
          <Section key={row.input.reference.reviewObjectId}>
            <Copy>
              {row.input.trade.symbol} ·{' '}
              {row.input.reference.reviewObjectType === 'TRADE_CYCLE' ? '完整交易周期' : '单次减仓'}
            </Copy>
            <Copy>
              {row.openedAt ?? '时间未知'} ·{' '}
              {row.reviewStatus === 'CURRENT' ? '当前事实' : '事实已变化'}
            </Copy>
            <Action
              label={`复盘 ${row.input.reference.reviewObjectId}`}
              onPress={() => open(row.input.reference.reviewObjectId)}
            />
          </Section>
        ))}
      {query.data?.pages[0]?.total === 0 ? <Copy muted>当前范围暂无复盘对象。</Copy> : null}
      {query.data?.pages
        .flatMap((p) => p.legacyItems)
        .map((row, i) => (
          <Copy muted key={i}>
            旧格式复盘需要重新确认，保留历史记录。
          </Copy>
        ))}
      {query.hasNextPage ? (
        <Action
          label="更多复盘对象"
          disabled={query.isFetching}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
