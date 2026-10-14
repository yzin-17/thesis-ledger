import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JournalAiExplanation } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JournalRequestError } from './JournalReviewFeedback.js';
import {
  journalAiReferenceKey,
  readJournalAiReference,
  rememberJournalAiTask,
  writeJournalAiReference,
} from './journal-ai-reference.js';

type RunView = Pick<
  JournalAiExplanation,
  | 'id'
  | 'provider'
  | 'model'
  | 'promptVersion'
  | 'algorithmVersion'
  | 'status'
  | 'errorSummary'
  | 'result'
>;
const statusLabels = {
  queued: '等待执行',
  running: '解读中',
  succeeded: '已完成',
  failed: '解读失败',
  cancelled: '已取消',
};
type PanelProps = {
  accountId: string;
  mode: string;
  kind: 'object' | 'period';
  scope: unknown;
  disabled: boolean;
  createRun: () => Promise<RunView>;
  readRun: (id: string, signal: AbortSignal) => Promise<RunView>;
  onRunSelected?: (id: string | null) => void;
  existingRunId?: string;
};

export function JournalAiRunPanel(props: PanelProps) {
  const scope = JSON.stringify([props.kind, props.accountId, props.mode, props.scope]);
  const reference = useQuery({
    queryKey: ['journal-review-ai-reference', scope],
    queryFn: async () => ({
      key: await journalAiReferenceKey(scope),
      indexKey: await journalAiReferenceKey(JSON.stringify(['tasks', props.accountId, props.mode])),
    }),
    staleTime: Infinity,
    retry: false,
  });
  if (reference.isError)
    return <JournalRequestError title="AI 任务引用暂不可用" error={reference.error} />;
  if (reference.isPending) return <p className="text-sm">正在核对 AI 任务引用…</p>;
  return (
    <RunPanel
      key={reference.data.key}
      {...props}
      referenceKey={reference.data.key}
      indexKey={reference.data.indexKey}
    />
  );
}

function RunPanel({
  accountId,
  mode,
  kind,
  disabled,
  createRun,
  readRun,
  onRunSelected,
  referenceKey,
  indexKey,
  existingRunId,
}: PanelProps & { referenceKey: string; indexKey: string }) {
  const client = useQueryClient();
  const [id, setId] = useState(() => existingRunId ?? readJournalAiReference(referenceKey));
  const create = useMutation({
    mutationFn: createRun,
    onSuccess: (run) => {
      setId(run.id);
      writeJournalAiReference(referenceKey, run.id);
      rememberJournalAiTask(indexKey, { id: run.id, kind });
      void client.invalidateQueries({ queryKey: ['journal-review-ai-tasks', accountId, mode] });
      onRunSelected?.(run.id);
    },
  });
  const query = useQuery({
    queryKey: ['journal-review-ai', kind, accountId, mode, referenceKey, id],
    enabled: id !== null,
    queryFn: ({ signal }) => {
      if (!id) throw new Error('未选择解读任务');
      return readRun(id, signal);
    },
    refetchInterval: (row) =>
      ['queued', 'running'].includes(row.state.data?.status ?? '') ? 2000 : false,
    retry: false,
  });
  useEffect(() => {
    if (query.data) onRunSelected?.(query.data.id);
  }, [query.data, onRunSelected]);
  const run = query.data ?? create.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 解读</CardTitle>
        <CardDescription>
          独立解读已核对的事实与确定性结果。生成任务使用已配置的研究默认模型。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!existingRunId && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={disabled || create.isPending || id !== null}
              onClick={() => create.mutate()}
            >
              {create.isPending ? '提交中…' : '开始 AI 解读'}
            </Button>
            <a className="text-sm underline underline-offset-4" href="/providers">
              配置 AI 模型
            </a>
            {id && !create.isPending && (
              <Button
                variant="ghost"
                disabled={['queued', 'running'].includes(run?.status ?? '')}
                onClick={() => {
                  writeJournalAiReference(referenceKey, null);
                  setId(null);
                  onRunSelected?.(null);
                  create.reset();
                }}
              >
                清除任务引用
              </Button>
            )}
          </div>
        )}
        {id && (
          <p className="text-xs text-muted-foreground">
            正在读取已提交任务。刷新后重新核对同一输入可恢复引用，不会自动重新生成解读。
          </p>
        )}
        {create.isError && <JournalRequestError title="AI 解读未提交" error={create.error} />}
        {query.isError && (
          <JournalRequestError
            title="AI 状态读取失败"
            error={query.error}
            retry={() => void query.refetch()}
          />
        )}
        {run && (
          <>
            <p className="text-sm">
              {statusLabels[run.status]} · Provider：{run.provider} · 模型：{run.model} · Prompt：
              {run.promptVersion}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              任务编号：{run.id}；复盘算法：{run.algorithmVersion}
            </p>
            {run.errorSummary && (
              <JournalRequestError title="AI 解读未完成" error={new Error(run.errorSummary)} />
            )}
            {run.result && (
              <div className="flex flex-col gap-3">
                <p className="whitespace-pre-wrap">{run.result.conclusion}</p>
                {run.result.evidence.map((item, index) => (
                  <div key={index}>
                    <p>{item.claim}</p>
                    <p className="break-all text-xs text-muted-foreground">
                      {item.citations
                        .map(
                          (citation) =>
                            `${citation.sourceId} · ${citation.toolCallId ?? '来源记录'}`,
                        )
                        .join('；')}
                    </p>
                  </div>
                ))}
                {run.result.risks.length > 0 && <p>风险：{run.result.risks.join('；')}</p>}
                {run.result.unknowns.length > 0 && <p>未知：{run.result.unknowns.join('；')}</p>}
                <p className="text-xs text-muted-foreground">{run.result.disclaimer}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
