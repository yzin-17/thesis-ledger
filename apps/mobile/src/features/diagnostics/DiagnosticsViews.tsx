import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Choices, Copy, QueryStatus, Section } from '../../components/MobilePrimitives';
type Props = { provider: string; select: (value: unknown) => void };
export function HealthDiagnostics({ provider, select }: Props) {
  const { api, scope } = useMobileRuntime();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'health-history', page],
    queryFn: ({ signal }) => api.diagnostics.healthHistory(page, signal),
  });
  const rows = query.data?.items.filter(
    (item) => !provider.trim() || item.provider.includes(provider.trim()),
  );
  return (
    <>
      <QueryStatus query={query} empty={rows?.length === 0} retry={() => void query.refetch()} />
      <Action
        label="重新读取健康记录"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      <Copy>
        第 {query.data?.page ?? page} 页 / {query.data?.totalPages ?? '—'} 页；共{' '}
        {query.data?.total ?? '—'} 条
      </Copy>
      <Action
        label="上一页健康记录"
        disabled={query.isFetching || !query.data || query.data.page <= 1}
        onPress={() => {
          setPage((query.data?.page ?? page) - 1);
          select(null);
        }}
      />
      <Action
        label="下一页健康记录"
        disabled={query.isFetching || !query.data || query.data.page >= query.data.totalPages}
        onPress={() => {
          setPage((query.data?.page ?? page) + 1);
          select(null);
        }}
      />
      {rows?.map((item, index) => (
        <Section key={`${item.provider}:${item.checkedAt}:${index}`} title={item.provider}>
          <Copy>
            {item.state} · {item.checkedAt} · 延迟 {item.latencyMs ?? '未知'} 毫秒
          </Copy>
          <Action
            label={`查看健康详情 ${item.provider} ${index + 1}`}
            onPress={() => select(item)}
          />
        </Section>
      ))}
    </>
  );
}
export function QualityDiagnostics({ provider, select }: Props) {
  const { api, scope } = useMobileRuntime();
  const [status, setStatus] = useState('open');
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'quality-issues', status],
    queryFn: ({ signal }) => api.diagnostics.issues(status, signal),
  });
  const rows = query.data?.filter(
    (item) => !provider.trim() || item.provider.includes(provider.trim()),
  );
  return (
    <>
      <Choices
        label="问题状态"
        value={status}
        options={[
          { value: 'open', label: '待处理' },
          { value: 'resolved', label: '已解决' },
        ]}
        onChange={(value) => {
          setStatus(value);
          select(null);
        }}
      />
      <QueryStatus query={query} empty={rows?.length === 0} retry={() => void query.refetch()} />
      <Action
        label="重新读取数据质量"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      {rows?.map((item) => (
        <Section key={item.id} title={`${item.provider} · ${item.symbol ?? '全市场'}`}>
          <Copy>
            {item.code} · {item.severity} · {item.status}
          </Copy>
          <Action label={`查看问题详情 ${item.id}`} onPress={() => select(item)} />
        </Section>
      ))}
    </>
  );
}
export function NotificationDiagnostics({ provider, select }: Props) {
  const { api, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'notification-failures'],
    queryFn: ({ signal }) => api.diagnostics.notificationFailures(signal),
  });
  const rows = query.data?.filter(
    (item) => !provider.trim() || item.provider.includes(provider.trim()),
  );
  return (
    <>
      <QueryStatus query={query} empty={rows?.length === 0} retry={() => void query.refetch()} />
      <Action
        label="重新读取通知失败"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      />
      {rows?.map((item) => (
        <Section key={item.id} title={item.provider}>
          <Copy>{item.lastError ?? '未提供失败原因'}</Copy>
          <Action label={`查看通知详情 ${item.id}`} onPress={() => select(item)} />
        </Section>
      ))}
    </>
  );
}
