import { useQuery } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { JournalAiExplanation, JournalPeriodAiExplanation } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Copy, Page, QueryList, Section } from '../../components/MobilePrimitives';
export function JournalEvidenceScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'JournalEvidence'>>();
  const { api, scope } = useMobileRuntime();
  const run = useQuery<JournalAiExplanation | JournalPeriodAiExplanation>({
    queryKey: [...scope, 'journal-evidence-run', params],
    retry: false,
    queryFn: ({ signal }) =>
      params.kind === 'object'
        ? api.journalReviews.explanation(
            params.runId,
            { accountId: params.accountId, mode: params.mode },
            signal,
          )
        : api.journalReviews.periodExplanation(
            params.runId,
            { accountId: params.accountId, mode: params.mode },
            signal,
          ),
  });
  const result = run.data?.result;
  const bindings = result?.evidenceBindings.filter((binding) => binding.toolCallId === params.toolCallId) ?? [];
  return (
    <Page title="复盘引用来源">
      {run.data && !bindings.length ? (
        <Copy>本任务没有该调用的引用，未读取其他来源。</Copy>
      ) : null}
      <QueryList query={run} retry={() => void run.refetch()} label="正在刷新复盘引用">
        {bindings.map(({ audit, toolCallId }) => (
          <Section key={audit.evidenceId} title="冻结证据">
            <Copy>
              来源 {audit.providerId ?? '未记录'} · {audit.sourceIds.join('、')}
            </Copy>
            <Copy>
              发布 {audit.publishedAt ?? '未记录'} · 可见 {audit.availableAt ?? '未记录'} · 抓取{' '}
              {audit.fetchedAt ?? '未记录'}
            </Copy>
            <Copy>
              证据 {audit.evidenceId} · 指纹 {audit.fingerprint}
            </Copy>
            <Copy>工具调用 {toolCallId}</Copy>
          </Section>
        ))}
      </QueryList>
    </Page>
  );
}
