import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Choices,
  Copy,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { automationStatusLabel } from './automation-labels';
export function AutomationHistoryScreen({
  route,
}: NativeStackScreenProps<SettingsStackParams, 'AutomationHistory'>) {
  const { api, scope } = useMobileRuntime();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const id = route.params?.id;
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'automation-history', id ?? null, page],
    queryFn: ({ signal }) => api.automations.history(page, id, signal),
    refetchInterval: (state) =>
      state.state.data?.items.some((item) => ['queued', 'running'].includes(item.status))
        ? 2000
        : false,
  });
  const rows = query.data?.items.filter((item) => status === 'all' || item.status === status);
  return (
    <Page title="自动化运行历史">
      <Copy muted>终态来自服务端运行记录；结果待确认不表示执行成功。筛选作用于当前页。</Copy>
      <QueryStatus query={query} empty={rows?.length === 0} retry={() => void query.refetch()} />
      <Choices
        label="当前页状态"
        value={status}
        options={['all', 'queued', 'running', 'succeeded', 'failed', 'unknown_outcome'].map(
          (value) => ({
            value,
            label: value === 'all' ? '全部状态' : automationStatusLabel(value),
          }),
        )}
        onChange={setStatus}
      />
      <Action
        label="重新读取运行历史"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      <Copy>
        第 {query.data?.page ?? page} 页 / {query.data?.totalPages ?? '—'} 页；共{' '}
        {query.data?.total ?? '—'} 条
      </Copy>
      <Action
        label="上一页运行历史"
        disabled={query.isFetching || !query.data || query.data.page <= 1}
        onPress={() => setPage((query.data?.page ?? page) - 1)}
      />
      <Action
        label="下一页运行历史"
        disabled={query.isFetching || !query.data || query.data.page >= query.data.totalPages}
        onPress={() => setPage((query.data?.page ?? page) + 1)}
      />
      {rows?.map((item) => (
        <Section key={item.id} title={automationStatusLabel(item.status)}>
          <Copy>
            任务 {item.jobId}；开始 {item.startedAt}；记录 {item.id}
          </Copy>
          <Copy>{item.error || '无错误记录'}</Copy>
          <Copy>{JSON.stringify(item.output ?? null, null, 2)}</Copy>
        </Section>
      ))}
    </Page>
  );
}
