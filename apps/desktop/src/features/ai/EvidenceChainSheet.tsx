import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { AiEvidence, AiToolCall } from './ai.types.js';

const toolStatusLabel = (status: string) => {
  if (status === 'ok') return '已完成';
  if (status === 'unavailable') return '不可用';
  if (status === 'denied') return '权限拒绝';
  return '未知状态';
};

const toolStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'ok') return 'default';
  if (status === 'unavailable' || status === 'denied') return 'destructive';
  return 'outline';
};

export const findCitationToolCall = (toolCallId: string | undefined, toolCalls: AiToolCall[]) =>
  toolCallId ? toolCalls.find((call) => call.id === toolCallId) : undefined;

export function EvidenceChainSheet({
  open,
  onOpenChange,
  evidence,
  toolCalls,
  toolCallsLoading = false,
  toolCallsError = false,
  toolCallsHasMore = false,
  onLoadMoreToolCalls = () => undefined,
  toolCallsLoadingMore = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidence: AiEvidence[];
  toolCalls: AiToolCall[];
  toolCallsLoading?: boolean;
  toolCallsError?: boolean;
  toolCallsHasMore?: boolean;
  onLoadMoreToolCalls?: () => void;
  toolCallsLoadingMore?: boolean;
}) {
  const toolCallById = new Map(toolCalls.filter((call) => call.id).map((call) => [call.id, call]));
  const citedToolCallIds = new Set(
    evidence.flatMap((item) =>
      item.citations.map((citation) => citation.toolCallId).filter(Boolean),
    ),
  );
  const uncitedToolCalls = toolCalls.filter((call) => !call.id || !citedToolCallIds.has(call.id));
  const renderLoadMore = () => {
    if (!toolCallsHasMore) return null;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onLoadMoreToolCalls}
        disabled={toolCallsLoadingMore}
      >
        {toolCallsLoadingMore ? '加载中…' : '加载更多 Tool 审计'}
      </Button>
    );
  };
  const renderToolCalls = () => {
    if (toolCallsLoading)
      return (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          正在加载 Tool 审计记录…
        </p>
      );
    if (toolCallsError)
      return (
        <p className="rounded-lg border border-dashed p-4 text-sm text-destructive">
          Tool 审计记录读取失败，请稍后重试。
        </p>
      );
    if (uncitedToolCalls.length === 0)
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            当前证据没有未关联的 Tool 调用。
          </p>
          {renderLoadMore()}
        </div>
      );
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">以下是本次运行中未被结论引用的调用：</p>
        {uncitedToolCalls.map((call, index) => (
          <Card key={call.id ?? `${call.tool}-${index}`} size="sm" className="shadow-none">
            <CardContent className="flex flex-col gap-2 pt-4 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{call.tool}</span>
                <Badge variant={toolStatusVariant(call.status)}>
                  {toolStatusLabel(call.status)}
                </Badge>
                <Badge variant="outline">{call.permission}</Badge>
                {call.provider && <span className="text-muted-foreground">{call.provider}</span>}
              </div>
              <p className="text-muted-foreground">
                输入：<span className="text-foreground">{call.inputSummary}</span>
              </p>
              {call.outputSummary && (
                <p className="text-muted-foreground">
                  输出：<span className="text-foreground">{call.outputSummary}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {call.durationMs !== undefined && <span>耗时 {call.durationMs} ms</span>}
                {call.marketTime && <span>市场时间 {call.marketTime}</span>}
                {call.availableAt && <span>可用时间 {call.availableAt}</span>}
                {call.fetchedAt && <span>抓取时间 {call.fetchedAt}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {renderLoadMore()}
      </div>
    );
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(100vw,42rem)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>来源链</SheetTitle>
          <SheetDescription>按研究结论拆分证据引用，并展示对应的只读 Tool 审计。</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {evidence.length === 0 && (
            <Card className="shadow-none">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                当前结果没有可展示的证据。
              </CardContent>
            </Card>
          )}
          {evidence.map((item, index) => (
            <Card key={`${item.claim}-${index}`} className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{item.claim}</CardTitle>
                <CardDescription>{item.citations.length} 条引用</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {item.citations.map((citation) => (
                  <div
                    key={`${citation.tool}-${citation.sourceId}-${citation.observedAt}`}
                    className="rounded-lg border bg-muted/30 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{citation.tool}</Badge>
                      <span className="font-medium">{citation.sourceId}</span>
                      <span className="text-muted-foreground">{citation.provider}</span>
                      {citation.toolCallId && (
                        <>
                          <Badge variant="secondary">已关联 Tool 审计</Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {citation.toolCallId}
                          </span>
                        </>
                      )}
                    </div>
                    <dl className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                      <div>
                        <dt className="inline">观察时间：</dt>
                        <dd className="inline text-foreground">{citation.observedAt}</dd>
                      </div>
                      {citation.marketTime && (
                        <div>
                          <dt className="inline">市场时间：</dt>
                          <dd className="inline text-foreground">{citation.marketTime}</dd>
                        </div>
                      )}
                      {citation.availableAt && (
                        <div>
                          <dt className="inline">可用时间：</dt>
                          <dd className="inline text-foreground">{citation.availableAt}</dd>
                        </div>
                      )}
                      {citation.fetchedAt && (
                        <div>
                          <dt className="inline">抓取时间：</dt>
                          <dd className="inline text-foreground">{citation.fetchedAt}</dd>
                        </div>
                      )}
                    </dl>
                    {citation.toolCallId && !toolCallById.has(citation.toolCallId) && (
                      <p className="mt-2 text-destructive">关联的 Tool 审计记录不可用。</p>
                    )}
                    {citation.toolCallId && toolCallById.has(citation.toolCallId) && (
                      <p className="mt-2 text-muted-foreground">
                        审计：{toolCallById.get(citation.toolCallId)?.tool} ·{' '}
                        {toolStatusLabel(
                          toolCallById.get(citation.toolCallId)?.status ?? 'unknown',
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <section aria-labelledby="tool-call-title" className="flex flex-col gap-3">
            <div>
              <h2 id="tool-call-title" className="text-sm font-semibold">
                Tool 调用审计
              </h2>
              <p className="text-xs text-muted-foreground">
                只读记录不支持编辑或写回业务对象；每条证据会标明关联调用。
              </p>
            </div>
            {renderToolCalls()}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
