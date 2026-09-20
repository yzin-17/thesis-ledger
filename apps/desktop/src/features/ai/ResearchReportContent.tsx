import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Check, CircleDot, Copy, ExternalLink, RotateCcw } from 'lucide-react';
import type { AiRunRecord, AiToolCall } from './ai.types.js';
import { AiExecutionFacts } from './AiExecutionFacts.js';
import { checkpointLabel, errorLabel, formatFullDateTime, questionSummary } from './ai.display.js';

const listOrEmpty = (items: string[] | undefined, empty: string) =>
  items && items.length > 0 ? items : [empty];

const formatDuration = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '未提供';
  if (value < 1_000) return `${value} 毫秒`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} 秒`;
};

const statusTitle = (run: AiRunRecord) => {
  const primary = run.display?.primaryStatus;
  const labels: Record<string, string> = {
    queued: '等待研究执行',
    running: '研究进行中',
    completed: '研究已完成',
    result_gap: '结果有缺口',
    pending_verification: '结果待核验',
    result_unavailable: '结果不可用',
    failed: '研究失败',
    cancelled: '研究已取消',
    unrecognized: '状态暂不可识别',
  };
  return primary ? (labels[primary] ?? '状态暂不可识别') : null;
};

const copyText = (value: string) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value);
};

const toolAuditLabel = (toolCallId: string | undefined, audit: AiToolCall | undefined) => {
  if (!toolCallId) return '历史兼容记录未提供 Tool 调用关联 ID';
  if (!audit) return 'Tool 审计暂未加载或关联不可用';
  return `Tool 审计：${audit.tool} · ${audit.status}`;
};

function PrimaryStatus({ run, onRetry }: { run: AiRunRecord; onRetry?: () => void }) {
  const primary = run.display?.primaryStatus;
  const title = statusTitle(run);
  if (primary === 'completed') return null;

  let description = run.display?.verificationReason ?? null;
  let destructive = false;
  if (run.status === 'queued') description = '任务已进入队列，开始后会自动更新。';
  if (run.status === 'running') description = checkpointLabel(run.checkpoint);
  if (run.status === 'failed') {
    description = run.errorSummary ?? errorLabel(run.errorCode);
    destructive = true;
  }
  if (primary === 'result_unavailable') destructive = true;
  if (!description) description = '当前状态暂无更多公开说明。';

  return (
    <Alert variant={destructive ? 'destructive' : 'default'}>
      {destructive ? <AlertTriangle /> : <CircleDot />}
      <AlertTitle>{title ?? errorLabel(run.errorCode)}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry && run.display?.capabilities.canRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-start-2 justify-self-start"
          onClick={onRetry}
        >
          <RotateCcw data-icon="inline-start" />
          使用原问题重试
        </Button>
      )}
    </Alert>
  );
}

function EvidenceSection({ run, toolCalls }: { run: AiRunRecord; toolCalls: AiToolCall[] }) {
  const evidence = run.result?.evidence ?? [];
  const toolCallById = new Map(toolCalls.flatMap((call) => (call.id ? [[call.id, call]] : [])));
  return (
    <section aria-labelledby="research-evidence-title" className="flex flex-col gap-3">
      <div>
        <h3 id="research-evidence-title" className="text-base font-semibold">
          证据与来源
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">引用与实际 Tool 审计保持分开显示。</p>
      </div>
      {evidence.length === 0 ? (
        <p className="text-sm text-muted-foreground">未提供可展示的证据。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {evidence.map((item) => (
            <div key={item.claim} className="rounded-md border p-3">
              <p className="text-sm font-medium">{item.claim}</p>
              <ul className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">
                {item.citations.map((citation, index) => {
                  const audit = citation.toolCallId
                    ? toolCallById.get(citation.toolCallId)
                    : undefined;
                  return (
                    <li key={`${citation.sourceId}-${index}`} className="flex flex-col gap-1">
                      <span>
                        {citation.provider} · {citation.sourceId} ·{' '}
                        {formatFullDateTime(citation.observedAt)}
                      </span>
                      <span>{toolAuditLabel(citation.toolCallId, audit)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RunMetadata({ run }: { run: AiRunRecord }) {
  return (
    <details className="rounded-md border bg-muted/20 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        运行详情 · {run.model} · {formatDuration(run.durationMs)}
      </summary>
      <dl className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Provider / 实际模型</dt>
          <dd>
            {run.provider} / {run.model}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">耗时</dt>
          <dd>{formatDuration(run.durationMs)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">创建 / 开始 / 完成</dt>
          <dd className="flex flex-col gap-1 text-xs">
            <span>{formatFullDateTime(run.createdAt)}</span>
            <span>{formatFullDateTime(run.startedAt)}</span>
            <span>{formatFullDateTime(run.completedAt)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prompt 版本</dt>
          <dd>{run.promptVersion}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">任务 ID</dt>
          <dd className="flex items-center gap-2">
            <code className="truncate text-xs">{run.id}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="复制完整任务 ID"
              onClick={() => copyText(run.id)}
            >
              <Copy aria-hidden="true" />
            </Button>
          </dd>
        </div>
        {run.retryOfRunId && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">重试来源</dt>
            <dd className="break-all font-mono text-xs">{run.retryOfRunId}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 border-t pt-4">
        <AiExecutionFacts
          {...(run.execution === undefined ? {} : { execution: run.execution })}
          legacy={{
            ...(run.inputTokens == null ? {} : { inputTokens: run.inputTokens }),
            ...(run.outputTokens == null ? {} : { outputTokens: run.outputTokens }),
          }}
        />
      </div>
    </details>
  );
}

function TrustedResearchResult({
  run,
  toolCalls,
}: {
  run: AiRunRecord & { result: NonNullable<AiRunRecord['result']> };
  toolCalls: AiToolCall[];
}) {
  const { result } = run;
  return (
    <>
      <Separator />
      <section aria-labelledby="research-conclusion-title" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Check aria-hidden="true" className="size-4 text-muted-foreground" />
          <h3 id="research-conclusion-title" className="text-base font-semibold">
            核心结论与适用条件
          </h3>
        </div>
        <p className="text-base leading-7">{result.conclusion}</p>
      </section>
      <Separator />
      <section aria-labelledby="research-risk-title" className="flex flex-col gap-3">
        <h3 id="research-risk-title" className="text-base font-semibold">
          风险与未知项
        </h3>
        <div>
          <h4 className="text-sm font-medium">主要风险</h4>
          <ul className="mt-2 flex flex-col gap-2 text-sm leading-6">
            {listOrEmpty(result.risks, '当前结果没有识别出主要风险。').map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-medium">未知项与限制</h4>
          <ul className="mt-2 flex flex-col gap-2 text-sm leading-6">
            {listOrEmpty(result.unknowns, '当前结果没有额外未知项。').map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
        {result.signals.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {result.signals.map((signal) => (
              <Badge key={signal} variant="secondary">
                {signal}
              </Badge>
            ))}
          </div>
        )}
      </section>
      <Separator />
      <EvidenceSection run={run} toolCalls={toolCalls} />
    </>
  );
}

export function ResearchReportContent({
  run,
  toolCalls = [],
  updatingFailed = false,
  onRetry,
  onOpenSource,
}: {
  run: AiRunRecord;
  toolCalls?: AiToolCall[];
  updatingFailed?: boolean;
  onRetry?: () => void;
  onOpenSource?: (href: string) => void;
}) {
  const result = run.result;
  const availability = run.display?.resultAvailability;
  const showTrustedResult = availability === 'available' || availability === 'gap';
  const showUnverifiedText = availability === 'invalid' && result?.conclusion;

  return (
    <div className="flex flex-col gap-5">
      {updatingFailed && (
        <Alert>
          <AlertTitle>更新失败</AlertTitle>
          <AlertDescription>当前缓存内容仍可阅读，但可能不是最新版本。</AlertDescription>
        </Alert>
      )}
      <section aria-labelledby="research-question-title" className="flex flex-col gap-2">
        <h3 id="research-question-title" className="text-base font-semibold">
          研究问题与背景
        </h3>
        {questionSummary(run).length > 240 ? (
          <details>
            <summary className="cursor-pointer text-sm">展开完整研究问题</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{questionSummary(run)}</p>
          </details>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6">{questionSummary(run)}</p>
        )}
        {run.display?.source.href && onOpenSource && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0"
            onClick={() => onOpenSource(run.display?.source.href ?? '')}
          >
            查看{run.display.source.label}
            <ExternalLink data-icon="inline-end" aria-hidden="true" />
          </Button>
        )}
      </section>
      <PrimaryStatus run={run} {...(onRetry ? { onRetry } : {})} />
      {showTrustedResult && result && (
        <TrustedResearchResult run={{ ...run, result }} toolCalls={toolCalls} />
      )}
      {showUnverifiedText && (
        <section className="rounded-md border p-3" aria-labelledby="research-unverified-title">
          <h3 id="research-unverified-title" className="font-semibold">
            未验证内容
          </h3>
          <p className="mt-2 text-sm leading-6">{result.conclusion}</p>
        </section>
      )}
      <Alert>
        <AlertDescription>
          免责声明：研究结果只读展示，不构成投资建议，也不会修改账本或生成订单。
          {result?.disclaimer ? ` ${result.disclaimer}` : ''}
        </AlertDescription>
      </Alert>
      {(run.provider === 'mock' || run.provider === 'fixture') && (
        <Badge variant="secondary" className="self-start">
          演示模式
        </Badge>
      )}
      <RunMetadata run={run} />
    </div>
  );
}
