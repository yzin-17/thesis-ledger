import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { JournalAiExplanation, JournalPeriodAiExplanation } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
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
  const references =
    run.data?.result?.evidence
      .flatMap((e) => e.citations)
      .filter((c) => c.toolCallId === params.toolCallId) ?? [];
  const tools = useInfiniteQuery({
    queryKey: [...scope, 'journal-evidence-tools', params],
    enabled: references.length > 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.researchRuns.tools(
        params.runId,
        { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  return (
    <Page title="复盘引用来源">
      <QueryStatus query={run} retry={() => void run.refetch()} />
      {run.data && !references.length ? (
        <Copy>本任务没有该调用的引用，未读取其他来源。</Copy>
      ) : null}
      {references.map((c, i) => (
        <Section key={i} title={c.tool}>
          <Copy>
            来源 {c.provider} · {c.sourceId}
          </Copy>
          <Copy>
            观察 {c.observedAt} · 可见 {c.availableAt ?? '未记录'} · 抓取 {c.fetchedAt ?? '未记录'}
          </Copy>
        </Section>
      ))}
      {references.length ? <QueryStatus query={tools} retry={() => void tools.refetch()} /> : null}
      {tools.data?.pages
        .flatMap((p) => p.items)
        .filter((t) => t.id === params.toolCallId)
        .map((t) => (
          <Section key={t.id} title="服务端调用审计">
            <Copy>
              {t.status === 'ok' ? '成功' : '不可用或拒绝'} · {t.provider ?? '来源未记录'}
            </Copy>
            <Copy>输入 {t.inputSummary}</Copy>
            <Copy>输出 {t.outputSummary ?? '未记录'}</Copy>
          </Section>
        ))}
      {tools.hasNextPage ? (
        <Action
          label="继续定位调用"
          onPress={() => void tools.fetchNextPage()}
          disabled={tools.isFetching}
        />
      ) : null}
    </Page>
  );
}
