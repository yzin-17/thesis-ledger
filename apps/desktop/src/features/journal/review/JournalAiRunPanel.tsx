import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { JournalAiExplanation } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalAiResult } from './JournalAiResult.js';

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
  disabled: boolean;
  createRun: () => Promise<RunView>;
  readRun: (id: string, signal: AbortSignal) => Promise<RunView>;
  onRunSelected?: ((id: string | null) => void) | undefined;
  embedded?: boolean;
  autoStart?: boolean;
  onRunStatusChange?: ((status: 'running' | 'succeeded' | 'failed') => void) | undefined;
};

/** 仅在当前复盘会话内持有正在执行的 AI 任务，不创建浏览器或账户级任务绑定。 */
export function JournalAiRunPanel(props: PanelProps) {
  const control = useJournalAiRunPanel(props);
  const { embedded, autoStart, id, create, disabled, query, run } = control;

  return (
    <section
      className={
        embedded ? 'flex min-w-0 flex-col gap-4' : 'flex min-w-0 flex-col gap-4 border-t pt-5'
      }
      aria-label="AI 解读"
    >
      {!embedded && (
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">AI 解读</h3>
          <p className="text-sm text-muted-foreground">独立解读已核对的事实与确定性结果。</p>
        </div>
      )}
      {!autoStart && !id && (
        <Button
          className="self-start"
          aria-busy={create.isPending}
          variant="outline"
          disabled={disabled || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {create.isPending ? '提交中…' : '开始 AI 解读'}
        </Button>
      )}
      {id && query.isPending && !run && <LoadingState label="正在读取解读状态" />}
      {create.isError && <JournalRequestError title="AI 解读未提交" error={create.error} />}
      {query.isError && (
        <JournalRequestError
          title="AI 状态读取失败"
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {run && (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{statusLabels[run.status]}</Badge>
          </div>
          {run.errorSummary && (
            <JournalRequestError title="AI 解读未完成" error={new Error(run.errorSummary)} />
          )}
          {run.status === 'succeeded' && !run.result && (
            <p role="status" className="text-sm text-muted-foreground">
              模型任务已完成，但结果未通过研究合同或证据核验，暂不能展示解读。
            </p>
          )}
          {run.result && <JournalAiResult result={run.result} />}
          <details>
            <summary className="cursor-pointer py-2 text-sm font-medium">模型运行信息</summary>
            <p className="break-all py-3 text-xs leading-6 text-muted-foreground">
              来源：{run.provider} · 模型：{run.model} · Prompt：{run.promptVersion} · 算法：
              {run.algorithmVersion} · 任务：{run.id}
            </p>
          </details>
        </div>
      )}
    </section>
  );
}

function useJournalAiRunPanel({
  accountId,
  mode,
  kind,
  disabled,
  createRun,
  readRun,
  onRunSelected,
  embedded = false,
  autoStart = false,
  onRunStatusChange,
}: PanelProps) {
  const [id, setId] = useState<string | null>(null);
  const initiated = useRef(false);
  const statusListener = useRef(onRunStatusChange);
  statusListener.current = onRunStatusChange;
  const selectionListener = useRef(onRunSelected);
  selectionListener.current = onRunSelected;
  const create = useMutation({
    mutationFn: createRun,
    onSuccess: (run) => setId(run.id),
  });
  const query = useQuery({
    queryKey: ['journal-review-ai', kind, accountId, mode, id],
    enabled: id !== null,
    queryFn: ({ signal }) => {
      if (!id) throw new Error('本次 AI 解读尚未启动');
      return readRun(id, signal);
    },
    refetchInterval: (row) =>
      ['queued', 'running'].includes(row.state.data?.status ?? '') ? 2000 : false,
    retry: false,
  });
  useEffect(() => {
    if (!autoStart || initiated.current || disabled) return;
    initiated.current = true;
    create.mutate();
  }, [autoStart, disabled, create.mutate]);
  const run = query.data ?? create.data;
  useEffect(() => {
    if (query.data?.status === 'succeeded' && query.data.result) {
      selectionListener.current?.(query.data.id);
    } else if (query.data && ['failed', 'cancelled', 'succeeded'].includes(query.data.status)) {
      selectionListener.current?.(null);
    }
  }, [query.data]);
  useEffect(() => {
    if (!autoStart) return;
    if (
      create.isError ||
      query.isError ||
      (run &&
        (run.status === 'failed' ||
          run.status === 'cancelled' ||
          (run.status === 'succeeded' && !run.result)))
    ) {
      statusListener.current?.('failed');
    } else if (run?.status === 'succeeded' && run.result) {
      statusListener.current?.('succeeded');
    } else {
      statusListener.current?.('running');
    }
  }, [autoStart, create.isError, query.isError, create.isPending, run?.status, run?.result]);

  return { embedded, autoStart, id, create, disabled, query, run };
}
