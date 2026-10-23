import { useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
const actions: Record<string, string> = {
  create: '创建',
  update: '更新',
  archive: '归档',
  restore: '恢复',
  enable: '启用',
  disable: '停用',
  test: '试算',
};
export function RiskAuditScreen() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'RiskAudit'>>();
  const { api, scope } = useMobileRuntime();
  const [limit, setLimit] = useState(30);
  const query = useQuery({
    queryKey: [...scope, 'risk-audit', params.ruleId],
    queryFn: ({ signal }) => api.risk.getAudit(params.ruleId, signal),
  });
  return (
    <Page title="风险规则审计">
      <Copy muted>规则 {params.ruleId}</Copy>
      <QueryStatus
        query={query}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
      />
      {query.data?.slice(0, limit).map((row) => (
        <Section
          key={row.id}
          title={`${actions[row.action] ?? row.action} · 版本 ${row.ruleVersion}`}
        >
          <Copy>
            {row.createdAt} · 操作者 {row.actor ?? '未提供'}
          </Copy>
          <Copy>变更前 {row.before ? JSON.stringify(row.before) : '无'}</Copy>
          <Copy>变更后 {row.after ? JSON.stringify(row.after) : '无'}</Copy>
        </Section>
      ))}
      {(query.data?.length ?? 0) > limit ? (
        <Action label="更多风险审计" onPress={() => setLimit((value) => value + 30)} />
      ) : null}
    </Page>
  );
}
