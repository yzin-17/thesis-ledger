import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import type { AiRunRecord, AiToolCall } from './ai.types.js';
import { ResearchReportContent } from './ResearchReportContent.js';

interface ResearchDetailProps {
  selectedRun: AiRunRecord | null;
  detailTitle: string;
  detailPending: boolean;
  detailError: boolean;
  toolCalls: AiToolCall[];
  navigationIds: string[];
  selectedIndex: number;
  previousId?: string;
  nextId?: string;
  contentRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onRetry: (run: AiRunRecord) => void;
  onOpenSource: (href: string) => void;
}

function ResearchDetailBody({
  selectedRun,
  detailPending,
  detailError,
  toolCalls,
  onRetry,
  onOpenSource,
}: Pick<
  ResearchDetailProps,
  'selectedRun' | 'detailPending' | 'detailError' | 'toolCalls' | 'onRetry' | 'onOpenSource'
>) {
  if (selectedRun) {
    return (
      <ResearchReportContent
        run={selectedRun}
        toolCalls={toolCalls}
        updatingFailed={detailError}
        onRetry={() => onRetry(selectedRun)}
        onOpenSource={onOpenSource}
      />
    );
  }
  if (detailPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return (
    <div className="rounded-md border p-4 text-sm text-muted-foreground">
      研究不存在、已移除或当前账号无权访问。请返回研究列表。
    </div>
  );
}

function NavigationButtons({
  previousId,
  nextId,
  onSwitch,
  variant,
}: {
  previousId: string | undefined;
  nextId: string | undefined;
  onSwitch: (id: string) => void;
  variant: 'ghost' | 'outline';
}) {
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="icon-sm"
        aria-label="上一条研究"
        disabled={!previousId}
        onClick={() => previousId && onSwitch(previousId)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant={variant}
        size="icon-sm"
        aria-label="下一条研究"
        disabled={!nextId}
        onClick={() => nextId && onSwitch(nextId)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </>
  );
}

export function ResearchReadingView(props: ResearchDetailProps) {
  return (
    <section className="module-page flex flex-col gap-4">
      <div className="sticky top-0 flex flex-wrap items-center justify-between gap-3 border-b bg-background py-3">
        <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
          <ArrowLeft data-icon="inline-start" />
          返回研究列表
        </Button>
        <div className="flex items-center gap-2">
          <NavigationButtons
            previousId={props.previousId}
            nextId={props.nextId}
            onSwitch={props.onSwitch}
            variant="outline"
          />
        </div>
      </div>
      <article className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            RESEARCH REPORT
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{props.detailTitle}</h1>
        </header>
        <ResearchDetailBody {...props} />
      </article>
    </section>
  );
}

export function ResearchDetailSheet(
  props: ResearchDetailProps & { open: boolean; onRead: () => void },
) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <SheetContent
        side="right"
        size="detail"
        showCloseButton={false}
        className="max-[1023px]:w-full max-[1023px]:max-w-none"
      >
        <SheetHeader>
          <SheetTitle className="line-clamp-2 pr-0">{props.detailTitle}</SheetTitle>
          <SheetDescription>
            {props.selectedIndex >= 0
              ? `已加载范围第 ${props.selectedIndex + 1} 条，共 ${props.navigationIds.length} 条`
              : '直接访问或新建任务，连续浏览范围不可用'}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1">
            <NavigationButtons
              previousId={props.previousId}
              nextId={props.nextId}
              onSwitch={props.onSwitch}
              variant="ghost"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="展开完整阅读"
              onClick={props.onRead}
            >
              <Expand aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="关闭研究详情"
              onClick={props.onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </SheetHeader>
        <div ref={props.contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <ResearchDetailBody {...props} />
          {props.selectedIndex >= 0 && !props.nextId && (
            <p className="mt-5 text-center text-xs text-muted-foreground">
              已到当前加载范围边界；关闭详情后可继续加载更多。
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
