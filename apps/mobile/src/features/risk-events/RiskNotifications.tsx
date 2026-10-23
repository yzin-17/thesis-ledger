import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Action,
  Choices,
  Copy,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
const statusLabels: Record<string, string> = {
  pending: '待发送',
  queued: '排队中',
  sending: '发送中',
  sent: '已发送',
  delivered: '已送达',
  failed: '失败',
  suppressed: '已抑制',
  skipped: '已跳过',
};
const channels: Record<string, string> = {
  email: '邮件',
  webhook: 'Webhook',
  'in-app': '应用内',
  telegram: 'Telegram',
  wecom: '企业微信',
  dingtalk: '钉钉',
};
export function RiskNotifications() {
  const { api, scope } = useMobileRuntime();
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(30);
  const query = useQuery({
    queryKey: [...scope, 'risk-notifications'],
    queryFn: ({ signal }) => api.risk.getNotifications(signal),
  });
  const routing = useQuery({
    queryKey: [...scope, 'notification-routing'],
    queryFn: ({ signal }) => api.risk.getRouting(signal),
  });
  const statuses = [...new Set(query.data?.map((row) => row.status) ?? [])];
  const rows = query.data?.filter((row) => status === 'all' || row.status === status) ?? [];
  return (
    <Page title="通知与路由状态">
      <Copy muted>这里读取全局通知记录，不变更通知配置或主动发送。</Copy>
      <Section title="当前路由">
        <QueryStatus query={routing} retry={() => void routing.refetch()} />
        {routing.isSuccess && routing.data.routes.length === 0 ? (
          <Copy>尚未配置通知路由。</Copy>
        ) : null}
        {routing.data?.routes.map((row, index) => (
          <Copy key={`${row.channel}:${index}`}>
            {channels[row.channel] ?? row.channel} · {row.provider}
          </Copy>
        ))}
        {routing.isError ? <Copy muted>路由状态未知，请重新读取。</Copy> : null}
      </Section>
      <Choices
        label="通知状态筛选"
        value={status}
        options={[
          { value: 'all', label: '全部通知' },
          ...statuses.map((value) => ({
            value,
            label: statusLabels[value] ?? `其他状态（${value}）`,
          })),
        ]}
        onChange={setStatus}
      />
      <QueryStatus
        query={query}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
      />
      {rows.slice(0, limit).map((row) => (
        <Section key={row.id} title={statusLabels[row.status] ?? `其他状态（${row.status}）`}>
          <Copy>
            {channels[row.channel] ?? row.channel} · 尝试 {row.attemptCount} 次 · 计划时间{' '}
            {row.scheduledAt}
          </Copy>
          <Copy muted>
            关联对象 {row.subjectType} · {row.subjectId}
          </Copy>
          {row.lastError ? <Copy>失败原因 {row.lastError}</Copy> : null}
        </Section>
      ))}
      {rows.length > limit ? (
        <Action label="更多通知记录" onPress={() => setLimit((value) => value + 30)} />
      ) : null}
    </Page>
  );
}
