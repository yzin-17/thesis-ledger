import { useQuery } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
export function ResearchEvidenceScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'ResearchEvidence'>>();
  const { api, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'research-evidence', params],
    queryFn: ({ signal }) =>
      api.research.evidence(params.id, params.referenceId, params.locator, signal),
    retry: false,
  });
  const value = query.data;
  return (
    <Page title="研究引用证据">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {value?.version === 1 ? (
        <Section title={value.toolCall.tool}>
          <Copy>历史兼容引用 · {value.toolCall.provider ?? '来源未记录'}</Copy>
          <Copy>
            可见 {value.toolCall.availableAt ?? '未记录'} · 抓取{' '}
            {value.toolCall.fetchedAt ?? '未记录'}
          </Copy>
          <Copy>工具调用 {value.toolCall.id}</Copy>
        </Section>
      ) : null}
      {value?.version === 2 ? (
        <Section title="冻结证据">
          <Copy>
            来源 {value.evidence.audit.providerId ?? '未记录'} ·{' '}
            {value.evidence.audit.sourceIds.join('、')}
          </Copy>
          <Copy>抓取 {value.evidence.audit.fetchedAt ?? '未记录'}</Copy>
          <Copy>指纹 {value.evidence.audit.fingerprint}</Copy>
          <Copy>工具调用 {value.toolCallId}</Copy>
          {value.evidence.reasons.map((v, i) => (
            <Copy key={i}>{v}</Copy>
          ))}
          {value.evidence.numericFields.map((v, i) => (
            <Copy key={i}>
              数值字段 {v.fieldPath} · 单位 {v.unit}
            </Copy>
          ))}
          <Copy>{JSON.stringify(value.evidence.data, null, 2)}</Copy>
        </Section>
      ) : null}
    </Page>
  );
}
