import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, BookOpen, CircleDot, RotateCcw } from 'lucide-react';
import type { AiRunDetail as AiRunDetailRecord, AiRunRecord } from './ai.types.js';
import {
  checkpointLabel,
  contextSummary,
  errorLabel,
  formatFullDateTime,
  questionSummary,
  scopeLabel,
  statusLabel,
  statusVariant,
} from './ai.display.js';

const listOrEmpty = (items: string[] | undefined, empty: string) =>
  items && items.length > 0 ? items : [empty];

const formatNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return '未记录';
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : value;
};

function RunMetadata({ run }: { run: AiRunRecord }) {
  return (
    <section
      className="rounded-lg border bg-muted/20 p-3 text-sm"
      aria-labelledby="ai-run-metadata-title"
    >
      <h3 id="ai-run-metadata-title" className="font-medium">
        运行详情
      </h3>
      <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Provider / 模型</dt>
          <dd>
            {run.provider} / {run.model}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prompt 版本</dt>
          <dd>{run.promptVersion}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">任务 ID</dt>
          <dd className="break-all font-mono text-xs">{run.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">重试来源</dt>
          <dd className="break-all font-mono text-xs">{run.retryOfRunId ?? '无'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">输入 Token</dt>
          <dd>{formatNumber(run.inputTokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">输出 Token</dt>
          <dd>{formatNumber(run.outputTokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">成本</dt>
          <dd>{formatNumber(run.cost)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">耗时</dt>
          <dd>
            {run.durationMs === null || run.durationMs === undefined
              ? '未记录'
              : `${run.durationMs} ms`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">开始时间</dt>
          <dd>{formatFullDateTime(run.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">完成时间</dt>
          <dd>{formatFullDateTime(run.completedAt)}</dd>
        </div>
        {run.fallbackSummary && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Provider fallback 摘要</dt>
            <dd className="text-xs text-muted-foreground">{run.fallbackSummary}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function ResultView({ run, onEvidence }: { run: AiRunRecord; onEvidence: () => void }) {
  const result = run.result;
  if (!result || typeof result.conclusion !== 'string' || !Array.isArray(result.evidence)) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>结果契约不完整</AlertTitle>
        <AlertDescription>
          任务标记为已完成，但服务端没有返回可验证的 ResearchResult V1。
        </AlertDescription>
      </Alert>
    );
  }
  const evidence = Array.isArray(result.evidence)
    ? result.evidence.filter((item) =>
        Boolean(item && typeof item.claim === 'string' && Array.isArray(item.citations)),
      )
    : [];
  const risks = Array.isArray(result.risks) ? result.risks : [];
  const unknowns = Array.isArray(result.unknowns) ? result.unknowns : [];
  const signals = Array.isArray(result.signals) ? result.signals : [];
  const hasCitations =
    evidence.length > 0 &&
    Array.isArray(result.evidence) &&
    evidence.length === result.evidence.length &&
    evidence.every((item) => item.citations.length > 0);
  if (!hasCitations) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>结果缺少来源引用</AlertTitle>
        <AlertDescription>
          关键证据没有 citation，当前结果不能作为可信完成结果展示。
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>结论</CardTitle>
        </CardHeader>
        <CardContent className="text-base leading-7">{result.conclusion}</CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>主要风险</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm leading-6">
            {listOrEmpty(risks, '当前结果没有识别出主要风险。').map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>关键证据</CardTitle>
            <CardDescription>{evidence.length} 个证据主张，均应可下钻到来源。</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onEvidence}>
            <BookOpen data-icon="inline-start" />
            查看来源链
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {evidence.map((item) => (
            <div key={item.claim} className="rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{item.claim}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.citations.length} 条引用</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>未知项与限制</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm leading-6">
            {listOrEmpty(unknowns, '当前结果没有额外未知项。').map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {signals.length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>研究信号</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {signals.map((signal) => (
              <Badge key={signal} variant="secondary">
                {signal}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
      <Alert>
        <AlertDescription>
          免责声明：研究结果仅基于本次读取到的授权数据，不构成投资建议，也不会修改账本或生成订单。
          {result.disclaimer ? ` ${result.disclaimer}` : ''}
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function AiRunDetail({
  run,
  detail,
  isLoading,
  detailError,
  onEvidence,
  onRetry,
  onDetailRetry,
  onCreate,
}: {
  run: AiRunRecord | null;
  detail: AiRunDetailRecord | null;
  isLoading: boolean;
  detailError?: boolean;
  onEvidence: () => void;
  onRetry: (run: AiRunRecord) => void;
  onDetailRetry?: () => void;
  onCreate: () => void;
}) {
  if (!run && isLoading) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!run) {
    return (
      <Empty className="min-h-[28rem] rounded-xl bg-card">
        <EmptyHeader>
          <EmptyTitle>从一次研究开始</EmptyTitle>
          <EmptyDescription>
            提出一个明确问题，选择真实研究对象，结果会保留证据和数据缺口。
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={onCreate}>
            创建第一次研究
          </Button>
          <Button type="button" variant="outline" onClick={onCreate}>
            查看问题模板
          </Button>
        </div>
      </Empty>
    );
  }
  const current = detail ?? run;
  const status = current.status;
  const context = current.context;
  return (
    <article className="flex min-h-0 flex-col gap-4" aria-live="polite">
      <header className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-2 text-xs text-muted-foreground">
              {context ? scopeLabel(context.scope) : '上下文未记录'} · {contextSummary(context)}
            </p>
            <h2 className="text-xl font-semibold leading-8">{questionSummary(current)}</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(current.provider === 'mock' || current.provider === 'fixture') && (
              <Badge variant="secondary">演示模式</Badge>
            )}
            <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          创建于 {formatFullDateTime(current.createdAt)}
          {current.updatedAt ? ` · 更新于 ${formatFullDateTime(current.updatedAt)}` : ''}
        </p>
      </header>
      {detailError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>任务详情读取失败</AlertTitle>
          <AlertDescription>列表摘要仍保留，来源链和完整运行信息暂时不可用。</AlertDescription>
          {onDetailRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="col-start-2 justify-self-start"
              onClick={onDetailRetry}
            >
              重新加载详情
            </Button>
          )}
        </Alert>
      )}
      {status === 'queued' && (
        <Alert>
          <CircleDot />
          <AlertTitle>等待研究执行</AlertTitle>
          <AlertDescription>任务已进入服务端队列，开始后会自动更新。</AlertDescription>
        </Alert>
      )}
      {status === 'running' && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>研究进行中</CardTitle>
            <CardDescription>只展示服务端已确认的阶段，不生成虚假百分比。</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            <CircleDot className="animate-pulse text-muted-foreground" />
            {checkpointLabel(current.checkpoint)}
          </CardContent>
        </Card>
      )}
      {status === 'failed' && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{errorLabel(current.errorCode)}</AlertTitle>
          <AlertDescription>
            {current.errorSummary ?? '服务端没有提供更多错误摘要，请保留任务 ID 以便排查。'}
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="col-start-2 justify-self-start"
            onClick={() => onRetry(current)}
          >
            <RotateCcw data-icon="inline-start" />
            使用原问题重试
          </Button>
        </Alert>
      )}
      {status === 'cancelled' && (
        <Alert>
          <AlertTitle>研究已取消</AlertTitle>
          <AlertDescription>已保留原问题、上下文和运行审计，不会写回业务对象。</AlertDescription>
        </Alert>
      )}
      {status === 'succeeded' && <ResultView run={current} onEvidence={onEvidence} />}
      {status !== 'queued' &&
        status !== 'running' &&
        status !== 'failed' &&
        status !== 'cancelled' && (
          <Alert>
            <AlertTitle>未知任务状态</AlertTitle>
            <AlertDescription>服务端返回了暂不识别的状态，详情仍保持只读。</AlertDescription>
          </Alert>
        )}
      <RunMetadata run={current} />
    </article>
  );
}
