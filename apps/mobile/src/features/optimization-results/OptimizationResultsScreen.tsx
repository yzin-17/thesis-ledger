import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { StrategyStackParams } from '../../app/strategy-navigation';
import {
  Action,
  Choices,
  Copy,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { OptimizationDetailScreen } from './OptimizationDetailScreen';
import { optimizationStatusLabels } from './optimization-labels';
export function OptimizationResultsScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'OptimizationResults'>>();
  if (params?.id) return <OptimizationDetailScreen id={params.id} />;
  return <OptimizationList />;
}
function OptimizationList() {
  const { api, scope } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState<'all' | 'existing' | 'discovery'>('all');
  const query = useInfiniteQuery({
    queryKey: [...scope, 'optimization-list', submittedSearch, status, source],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.strategy.optimization.list(
        {
          limit: 20,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(submittedSearch ? { search: submittedSearch } : {}),
          ...(status !== 'all' ? { status } : {}),
          ...(source !== 'all' ? { sourceMode: source } : {}),
        },
        signal,
      ),
    getNextPageParam: (p) => p.pageInfo.nextCursor ?? undefined,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) =>
        p.items.some((v) => ['queued', 'running', 'testing'].includes(v.status)),
      )
        ? 3000
        : false,
  });
  const rows = query.data?.pages.flatMap((v) => v.items) ?? [];
  return (
    <Page title="优化实验">
      <Action
        label="新建优化实验"
        primary
        onPress={() => navigation.navigate('OptimizationSetup')}
      />
      <Field label="实验搜索" value={search} onChange={setSearch} />
      <Action label="筛选优化实验" onPress={() => setSubmittedSearch(search.trim())} />
      <Choices
        label="实验状态"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: '全部状态' },
          ...Object.entries(optimizationStatusLabels).map(([value, label]) => ({ value, label })),
        ]}
      />
      <Choices
        label="实验来源筛选"
        value={source}
        onChange={setSource}
        options={[
          { value: 'all', label: '全部来源' },
          { value: 'existing', label: '现有策略优化' },
          { value: 'discovery', label: '从零探索' },
        ]}
      />
      <QueryStatus query={query} empty={!rows.length} retry={() => void query.refetch()} />
      {rows.map((v) => (
        <Section key={v.id} title={v.name}>
          <Copy>
            {optimizationStatusLabels[v.status] ?? '状态待核对'} ·{' '}
            {
              ({ existing: '现有正式策略', discovery: '从零探索', unknown: '来源未记录' } as const)[
                v.source?.kind ?? 'unknown'
              ]
            }
          </Copy>
          <Copy>
            模型费用：
            {v.costSummary.knownAmount !== null
              ? `${v.costSummary.currency ?? '币种未记录'} ${v.costSummary.knownAmount}（已确认部分）`
              : '未知'}
          </Copy>
          <Copy>
            实验 {v.id} · {v.createdAt}
          </Copy>
          <Action
            label={`打开实验 ${v.id}`}
            onPress={() => navigation.navigate('OptimizationResults', { id: v.id })}
          />
        </Section>
      ))}
      {query.hasNextPage ? (
        <Action
          label="更多优化实验"
          disabled={query.isFetching}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
