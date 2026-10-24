import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ResearchReportLocatorInput } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
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
import { runStatusLabels } from '../journal-ai/JournalAiPanel';
export function ResearchHome() {
  const { api, scope, mode } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const [view, setView] = useState<'scoped' | 'legacy'>('scoped');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const locator: ResearchReportLocatorInput =
    view === 'legacy'
      ? { view }
      : {
          view,
          mode,
          scope: 'all',
          ...(kind !== 'all'
            ? { kind: kind as 'instrument' | 'portfolio' | 'account' | 'position' | 'strategy' }
            : {}),
        };
  const query = useInfiniteQuery({
    queryKey: [...scope, 'research-list', locator, status, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.research.list(
        {
          ...locator,
          limit: 20,
          ...(search ? { search } : {}),
          ...(status !== 'all' ? { status: status as 'failed' } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some((r) => ['queued', 'running'].includes(r.status)))
        ? 2000
        : false,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Page title="研究与复盘">
      <Action label="打开策略与回测" onPress={() => navigation.navigate('Strategy')} />
      <Action label="打开复盘工作区" onPress={() => navigation.navigate('Journal')} />
      <Action label="新建研究" onPress={() => navigation.navigate('ResearchSubmit')} />
      <Choices
        label="报告范围"
        value={view}
        options={[
          { value: 'scoped', label: '当前模式报告' },
          { value: 'legacy', label: '历史兼容报告' },
        ]}
        onChange={setView}
      />
      {view === 'legacy' ? (
        <Copy muted>历史范围未记录，不能视为当前账户或模式的研究。</Copy>
      ) : (
        <Choices
          label="研究类别"
          value={kind}
          options={Object.entries({
            all: '全部类别',
            instrument: '独立标的',
            portfolio: '全组合',
            account: '账户',
            position: '单个持仓',
            strategy: '策略版本',
          }).map(([value, label]) => ({ value, label }))}
          onChange={setKind}
        />
      )}
      <Choices
        label="研究状态"
        value={status}
        options={[
          { value: 'all', label: '全部状态' },
          ...Object.entries(runStatusLabels).map(([value, label]) => ({ value, label })),
        ]}
        onChange={setStatus}
      />
      <Field label="研究搜索" value={input} onChange={setInput} />
      <Action label="筛选研究" onPress={() => setSearch(input.trim())} />
      <QueryStatus query={query} empty={!rows.length} retry={() => void query.refetch()} />
      {rows.map((row) => (
        <Section key={row.id} title={row.question ?? '研究报告'}>
          <Copy>
            {runStatusLabels[row.status] ?? '状态待核对'} · {row.createdAt}
          </Copy>
          <Copy>{row.summary ?? row.errorSummary ?? '暂无摘要'}</Copy>
          <Action
            label={`打开报告 ${row.id}`}
            onPress={() => navigation.navigate('ResearchReport', { id: row.id, locator })}
          />
        </Section>
      ))}
      {query.hasNextPage ? (
        <Action
          label="更多研究报告"
          disabled={query.isFetching}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </Page>
  );
}
