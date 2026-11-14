import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Choices, Copy, Page, QueryList, Section } from '../../components/MobilePrimitives';
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
      <Choices
        label="当前页状态"
        value={status}
        options={[
          'all',
          'queued',
          'running',
          'succeeded',
          'partial',
          'failed',
          'interrupted',
          'unknown_outcome',
        ].map((value) => ({
          value,
          label: value === 'all' ? '全部状态' : automationStatusLabel(value),
        }))}
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
      {query.data?.sourceWarnings?.length ? (
        <Copy>收费资料检查记录暂时无法读取，当前仅显示其他任务记录。请稍后刷新。</Copy>
      ) : null}
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
      <QueryList
        query={query}
        empty={rows?.length === 0}
        retry={() => void query.refetch()}
        label="正在刷新运行历史"
      >
        {rows?.map((item) => (
          <Section
            key={item.id}
            title={`${item.jobName ?? '自动化任务'} · ${automationStatusLabel(item.status)}`}
          >
            <Copy>
              开始 {item.startedAt ?? '尚未开始'}；结束 {item.finishedAt ?? '尚未结束'}
            </Copy>
            {!item.startedAt && item.createdAt ? <Copy>排队时间 {item.createdAt}</Copy> : null}
            <Copy>{item.error || '无错误记录'}</Copy>
            <Copy>{item.summary ?? JSON.stringify(item.output ?? null, null, 2)}</Copy>
          </Section>
        ))}
      </QueryList>
    </Page>
  );
}
