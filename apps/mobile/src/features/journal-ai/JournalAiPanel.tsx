import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ResearchStackParams } from '../../app/navigation-types';
import type { JournalAiExplanation, JournalPeriodAiExplanation } from '@thesis-ledger/schemas';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileCommand } from '../../app/query/mobile-queries';
import {
  Action,
  Copy,
  Feedback,
  QueryStatus,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { journalTaskKey, rememberJournalTask } from './journal-tasks';
type Run = JournalAiExplanation | JournalPeriodAiExplanation;
export const runStatusLabels: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
export function JournalAiPanel({
  accountId,
  mode,
  kind,
  createRun,
  disabled = false,
  existingRunId,
  onSelected,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  kind: 'object' | 'period';
  createRun?: () => Promise<Run>;
  disabled?: boolean;
  existingRunId?: string;
  onSelected?: (id: string) => void;
}) {
  const { api, scope, baseUrl } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<ResearchStackParams>>();
  const client = useQueryClient();
  const [runId, setRunId] = useState(existingRunId ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const capability = useQuery({
    queryKey: [...scope, 'ai-capabilities'],
    queryFn: ({ signal }) => api.researchRuns.capabilities(signal),
    enabled: Boolean(createRun),
    retry: false,
  });
  const query = useQuery<Run>({
    queryKey: [...scope, 'journal-ai', accountId, kind, runId],
    enabled: Boolean(runId),
    retry: false,
    queryFn: ({ signal }) =>
      kind === 'object'
        ? api.journalReviews.explanation(runId, { accountId, mode }, signal)
        : api.journalReviews.periodExplanation(runId, { accountId, mode }, signal),
    refetchInterval: (q) =>
      q.state.data && ['queued', 'running'].includes(q.state.data.status) ? 2000 : false,
  });
  const command = useMobileCommand(
    async () => {
      if (!createRun || !capability.data?.canStart) throw new Error('当前模型能力不可用。');
      const run = await createRun();
      setRunId(run.id);
      client.setQueryData([...scope, 'journal-ai', accountId, kind, run.id], run);
      onSelected?.(run.id);
      try {
        await rememberJournalTask(journalTaskKey(baseUrl, accountId, mode), { id: run.id, kind });
        void client.invalidateQueries({ queryKey: [...scope, 'journal-ai-tasks'] });
      } catch {
        setMessage(`任务 ${run.id} 已创建，本机引用保存失败；请保留此编号。`);
      }
    },
    { refresh: false },
  );
  return (
    <Section title="AI 解读">
      <Copy muted>解读独立于事实与确定性指标；失败保留本次复盘。</Copy>
      {createRun ? (
        <>
          <QueryStatus query={capability} retry={() => void capability.refetch()} />
          {capability.data && !capability.data.canStart ? (
            <Copy>当前模型未就绪，请在现有模型设置中核对。未提交解读。</Copy>
          ) : null}
          <Action
            label="提交 AI 解读"
            disabled={
              disabled || command.isPending || !capability.data?.canStart || capability.isError
            }
            onPress={() =>
              void command.mutateAsync(undefined).catch((e) => setMessage(failureMessage(e)))
            }
          />
        </>
      ) : null}
      <Feedback message={message} error={command.isError} />
      {runId ? (
        <>
          <Copy>任务 {runId}</Copy>
          <QueryStatus query={query} retry={() => void query.refetch()} />
        </>
      ) : null}
      {query.data ? (
        <>
          <Copy>
            {runStatusLabels[query.data.status]} · {query.data.provider} / {query.data.model}
          </Copy>
          <Feedback message={query.data.errorSummary} error />
          {query.data.result ? (
            <>
              <Copy>{query.data.result.conclusion}</Copy>
              {query.data.result.evidence.map((entry, i) => (
                <Section key={i} title={entry.claim}>
                  {entry.citations.map((c, j) => (
                    <Section key={j}>
                      <Copy>
                        来源 {c.provider} · {c.sourceId} · {c.observedAt} · 工具 {c.tool}
                      </Copy>
                      {c.toolCallId ? (
                        <Action
                          label={`定位解读引用 ${c.toolCallId}`}
                          onPress={() =>
                            navigation.navigate('JournalEvidence', {
                              accountId,
                              mode,
                              kind,
                              runId,
                              toolCallId: c.toolCallId!,
                            })
                          }
                        />
                      ) : null}
                    </Section>
                  ))}
                </Section>
              ))}
              {query.data.result.risks.map((v, i) => (
                <Copy key={i}>风险：{v}</Copy>
              ))}
              {query.data.result.unknowns.map((v, i) => (
                <Copy key={i}>未知项：{v}</Copy>
              ))}
              <Copy muted>{query.data.result.disclaimer}</Copy>
            </>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
