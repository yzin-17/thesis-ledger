import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { ResearchBody } from './ResearchBody';
import { runStatusLabels } from '../journal-ai/JournalAiPanel';
export function ResearchReportScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'ResearchReport'>>();
  const { api, scope } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const query = useQuery({
    queryKey: [...scope, 'research-report', params],
    queryFn: ({ signal }) => api.research.detail(params.id, params.locator, signal),
    retry: false,
    refetchInterval: (q) =>
      q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false,
  });
  const tools = useInfiniteQuery({
    queryKey: [...scope, 'research-tools', params],
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(query.data),
    queryFn: ({ pageParam, signal }) =>
      api.research.tools(
        params.id,
        { ...params.locator, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    retry: false,
  });
  const report = query.data;
  return (
    <Page title="研究报告">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      <Action label="刷新报告" disabled={query.isFetching} onPress={() => void query.refetch()} />
      {report ? (
        <>
          <Section title={report.question ?? '研究报告'}>
            <Copy>
              {runStatusLabels[report.status] ?? '状态待核对'} · {report.createdAt}
            </Copy>
            <Copy>
              {report.historicalScope.status === 'known'
                ? '范围已记录'
                : report.historicalScope.label}
            </Copy>
          </Section>
          <ResearchBody
            report={report}
            evidence={(referenceId) =>
              navigation.navigate('ResearchEvidence', { ...params, referenceId })
            }
          />
          <Action
            label="比较与复核"
            onPress={() => navigation.navigate('ResearchReview', params)}
          />
          {['failed', 'cancelled'].includes(report.status) ? (
            <Action
              label="再次生成预填"
              onPress={() => navigation.navigate('ResearchSubmit', { retryRunId: report.id })}
            />
          ) : null}
          <Section title="工具调用历史">
            <QueryStatus query={tools} retry={() => void tools.refetch()} />
            {tools.data?.pages
              .flatMap((p) => p.items)
              .map((tool, i) => (
                <Section key={tool.id ?? i} title={tool.tool}>
                  <Copy>
                    {tool.status === 'ok' ? '成功' : '不可用或拒绝'} · 权限 {tool.permission}
                  </Copy>
                  <Copy>输入摘要：{tool.inputSummary}</Copy>
                  <Copy>输出摘要：{tool.outputSummary ?? '未记录'}</Copy>
                  <Copy>
                    来源 {tool.provider ?? '未记录'} · 抓取 {tool.fetchedAt ?? '未记录'}
                  </Copy>
                </Section>
              ))}
            {tools.hasNextPage ? (
              <Action
                label="更多工具调用"
                disabled={tools.isFetching}
                onPress={() => void tools.fetchNextPage()}
              />
            ) : null}
          </Section>
        </>
      ) : null}
    </Page>
  );
}
