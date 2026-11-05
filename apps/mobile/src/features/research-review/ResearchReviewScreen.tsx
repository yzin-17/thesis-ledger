import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Action, Copy, Field, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { ReviewAction } from './ReviewAction';
const compareLabels = {
  compared: '可比较',
  incompatible: '范围不兼容',
  unavailable: '报告不可用',
  no_previous: '没有可比较的前序报告',
  search_incomplete: '前序搜索未完成',
};
export function ResearchReviewScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'ResearchReview'>>();
  const { api, scope } = useMobileRuntime();
  const [input, setInput] = useState('');
  const [beforeId, setBeforeId] = useState('');
  const [observationId, setObservationId] = useState('');
  const capability = useQuery({
    queryKey: [...scope, 'research-capabilities'],
    queryFn: ({ signal }) => api.research.capabilities(signal),
    retry: false,
  });
  const comparison = useQuery({
    queryKey: [...scope, 'research-comparison', params, beforeId],
    queryFn: ({ signal }) =>
      api.research.compare(
        params.id,
        { ...params.locator, ...(beforeId ? { beforeId } : {}) },
        signal,
      ),
    retry: false,
  });
  const observations = useQuery({
    queryKey: [...scope, 'research-observations', params],
    queryFn: ({ signal }) => api.research.observations(params.id, params.locator, signal),
    retry: false,
  });
  const history = useQuery({
    queryKey: [...scope, 'research-observation-history', params, observationId],
    enabled: Boolean(observationId),
    queryFn: ({ signal }) =>
      api.research.observationHistory(params.id, observationId, params.locator, signal),
    retry: false,
  });
  return (
    <Page title="比较与复核">
      <Field label="指定前序报告编号" value={input} onChange={setInput} />
      <Action label="比较报告" onPress={() => setBeforeId(input.trim())} />
      <Action
        label="自动选择前序报告"
        onPress={() => {
          setInput('');
          setBeforeId('');
          void comparison.refetch();
        }}
      />
      <QueryStatus query={comparison} retry={() => void comparison.refetch()} />
      {comparison.data ? (
        <>
          <Copy>{compareLabels[comparison.data.status]}</Copy>
          {comparison.data.issues.map((v, i) => (
            <Copy key={i}>{v.message}</Copy>
          ))}
          {comparison.data.groups.map((group) => (
            <Section key={group.key} title={group.label}>
              {group.fields.map((v) => (
                <Copy key={v.key}>
                  {v.label}：{displayValue(v.before)} → {displayValue(v.after)}
                </Copy>
              ))}
            </Section>
          ))}
          <Copy muted>证据比较 {comparison.data.evidence.length} 项；保留两份原报告。</Copy>
        </>
      ) : null}
      <Section title="自动复核状态">
        <QueryStatus query={observations} retry={() => void observations.refetch()} />
        <QueryStatus query={capability} retry={() => void capability.refetch()} />
        <Copy muted>此处读取服务端保存的复核与历史，受控写入沿用现有能力边界。</Copy>
        {observations.data?.issues.map((v, i) => (
          <Copy key={i}>{v}</Copy>
        ))}
        {observations.data?.items.map((row) => (
          <Section key={row.claimId} title={row.claimId}>
            <Copy>当前评估：{row.current?.evaluation.status ?? '尚无复核结果'}</Copy>
            {row.current?.evaluation.reasons.map((r, i) => (
              <Copy key={i}>{r}</Copy>
            ))}
            {row.id ? (
              <Action label={`读取复核历史 ${row.id}`} onPress={() => setObservationId(row.id!)} />
            ) : null}
            <ReviewAction
              id={params.id}
              locator={params.locator}
              claimId={row.claimId}
              canCreate={Boolean(capability.data?.canCreate && !capability.isError)}
            />
          </Section>
        ))}
        {observationId ? (
          <QueryStatus query={history} retry={() => void history.refetch()} />
        ) : null}
        {history.data?.versions.map((v) => (
          <Copy key={v.id}>
            {v.recordedAt} · {v.evaluation.status} · 输入指纹 {v.inputFingerprint}
          </Copy>
        ))}
      </Section>
    </Page>
  );
}
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '未记录';
  if (Array.isArray(value)) return value.map(displayValue).join('；');
  if (typeof value === 'object') return Object.values(value).map(displayValue).join(' · ');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '未记录';
}
