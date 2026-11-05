import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BacktestNavRunSummaryV3, BacktestRunSummaryRead } from '@thesis-ledger/schemas';
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
import { backtestStatusLabels, isBacktestActive } from './backtest-state';
export function BacktestJobsScreen() {
  const { params } = useRoute<RouteProp<StrategyStackParams, 'BacktestJobs'>>();
  const { api, scope } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<StrategyStackParams>>();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const query = useQuery<Array<BacktestRunSummaryRead | BacktestNavRunSummaryV3>>({
    queryKey: [...scope, 'backtest-jobs', params.kind],
    queryFn: ({ signal }) =>
      params.kind === 'ordinary'
        ? api.backtests.listRuns(signal)
        : api.backtests.listNavRuns(signal),
    retry: false,
    refetchInterval: (q) => (q.state.data?.some((v) => isBacktestActive(v.status)) ? 2000 : false),
  });
  const rows =
    query.data?.filter(
      (v) =>
        (status === 'all' || v.status === status) &&
        `${v.id} ${v.strategyVersionId}`.includes(search),
    ) ?? [];
  return (
    <Page title={params.kind === 'ordinary' ? '普通回测任务' : '净值回测任务'}>
      <Field label="搜索 Run 或版本" value={search} onChange={setSearch} />
      <Choices
        label="回测任务状态"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'all', label: '全部状态' },
          ...Object.entries(backtestStatusLabels).map(([value, label]) => ({ value, label })),
        ]}
      />
      <QueryStatus query={query} empty={!rows.length} retry={() => void query.refetch()} />
      {rows.map((run) => (
        <Section key={run.id} title={backtestStatusLabels[run.status]}>
          <Copy>Run {run.id}</Copy>
          <Copy>策略版本 {run.strategyVersionId}</Copy>
          <Copy>
            进度{' '}
            {run.progress === undefined || run.progress === null ? '未记录' : `${run.progress}%`} ·{' '}
            {run.createdAt ?? '创建时间未记录'}
          </Copy>
          <Action
            label={`查看回测 ${run.id}`}
            onPress={() => navigation.navigate('BacktestResult', { id: run.id, kind: params.kind })}
          />
        </Section>
      ))}
      <Copy muted>
        列表最多返回最近 100 项；查询失败会保留上次数据并显示错误，不会创建或补投任务。
      </Copy>
    </Page>
  );
}
