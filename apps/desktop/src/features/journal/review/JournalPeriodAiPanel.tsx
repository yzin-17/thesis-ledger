import type { JournalPeriodAiExplanation } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/spinner';
import { JournalAiResult } from './JournalAiResult.js';
import { JournalRequestError } from './JournalReviewFeedback.js';

const labels = {
  queued: '等待执行',
  running: '解读中',
  succeeded: '解读完成',
  failed: '解读失败',
  cancelled: '已取消',
};

export function JournalPeriodAiPanel({
  run,
  busy,
  error,
  onRetry,
}: {
  run: JournalPeriodAiExplanation | null;
  busy: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  let failure: unknown = null;
  if (error !== null) failure = error;
  else if (run?.errorSummary) failure = new Error(run.errorSummary);
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="本次周期 AI 解读">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">AI 解读</h2>
        <p className="text-sm text-muted-foreground">
          仅展示本次周期分析的解读；保存复盘快照后，解读才会随结果留存。
        </p>
      </div>
      {run && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{labels[run.status]}</Badge>
        </div>
      )}
      {busy && !run?.result && <LoadingState label="正在生成 AI 解读" className="min-h-32" />}
      {run?.result && <JournalAiResult result={run.result} />}
      {run?.status === 'succeeded' && !run.result && (
        <p className="text-sm text-muted-foreground">
          AI 任务已完成，但结果未通过证据核验，不能作为快照解读保存。
        </p>
      )}
      {failure !== null && (
        <JournalRequestError title="AI 解读未完成" error={failure} retry={onRetry} />
      )}
      {!run && !busy && error === null && (
        <p className="text-sm text-muted-foreground">
          尚未生成 AI 解读。点击上方「AI 解读」可生成当前分析的解读结果。
        </p>
      )}
    </section>
  );
}
