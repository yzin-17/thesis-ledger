import { useState, useEffect, type FormEvent } from 'react';
import type { LedgerCommandResponseV2, LedgerEventV2 } from '@thesis-ledger/api-client';
import { useToastManager } from '@/components/ui/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { LoaderCircle } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import { useRestoreExecutionMutation, useVoidExecutionMutation } from './account-data.mutations.js';
import {
  commandFeedback,
  correctionSubmitLabel,
  createClientCommandId,
  errorCode,
  errorMessage,
  eventTypeLabel,
  formatDate,
  isExecutionEvent,
  isLegacyAuditEvent,
  isVoidEvent,
  revisionBadgeVariant,
  revisionLabel,
} from './account-data.helpers.js';
import {
  isCashTransferEvent,
  type CashTransferEvent,
  type ExecutionEvent,
  type VoidEvent,
} from './account-data.types.js';
import type { useAccountLedgerAuditQuery } from './account-data.queries.js';

export function AuditSheet({
  target,
  query,
  onOpenChange,
  onCorrect,
  onVoid,
  onRestore,
  onRestoreTransfer,
}: {
  target: LedgerEventV2 | null;
  query: ReturnType<typeof useAccountLedgerAuditQuery>;
  onOpenChange: (open: boolean) => void;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onRestore: (event: VoidEvent, source: ExecutionEvent) => void;
  onRestoreTransfer: (event: VoidEvent, source: CashTransferEvent) => void;
}) {
  const events = query.data?.events ?? [];
  const targetFactId = target?.factId;
  const chain = targetFactId
    ? events.filter(
        (event): event is LedgerEventV2 =>
          !isLegacyAuditEvent(event) && event.factId === targetFactId,
      )
    : [];
  return (
    <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-[100dvh] w-[720px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <SheetTitle>成交修正链</SheetTitle>
        <SheetDescription>
          当前列表只计有效版本；这里展示同一 fact 的 CREATE、REPLACE、VOID、RESTORE 审计记录。
        </SheetDescription>
        <AuditResults
          query={query}
          chain={chain}
          targetEventId={target?.eventId}
          onCorrect={onCorrect}
          onVoid={onVoid}
          onRestore={onRestore}
          onRestoreTransfer={onRestoreTransfer}
        />
        {query.isError && query.data && (
          <Alert className="mt-4">
            <AlertTitle>审计链可能陈旧</AlertTitle>
            <AlertDescription>当前显示上次成功读取的审计结果。</AlertDescription>
          </Alert>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AuditResults({
  query,
  chain,
  targetEventId,
  onCorrect,
  onVoid,
  onRestore,
  onRestoreTransfer,
}: {
  query: ReturnType<typeof useAccountLedgerAuditQuery>;
  chain: LedgerEventV2[];
  targetEventId: string | undefined;
  onCorrect: (event: ExecutionEvent) => void;
  onVoid: (event: ExecutionEvent) => void;
  onRestore: (event: VoidEvent, source: ExecutionEvent) => void;
  onRestoreTransfer: (event: VoidEvent, source: CashTransferEvent) => void;
}) {
  if (query.isPending && !query.data) {
    return (
      <div className="mt-5 flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Alert className="mt-5" variant="destructive">
        <AlertTitle>审计链读取失败</AlertTitle>
        <AlertDescription>无法读取当前成交的修正历史。</AlertDescription>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
          重新加载
        </Button>
      </Alert>
    );
  }
  if (chain.length === 0) {
    return (
      <Empty className="mt-5 min-h-48 rounded-xl border bg-card p-8">
        <EmptyDescription>当前事实没有可显示的 V2 修正链。</EmptyDescription>
      </Empty>
    );
  }
  return (
    <div className="mt-5 flex flex-col gap-3">
      {chain.map((event) => {
        const childExists = chain.some(
          (candidate) => candidate.supersedesEventId === event.eventId,
        );
        const source = event.supersedesEventId
          ? chain.find((candidate) => candidate.eventId === event.supersedesEventId)
          : undefined;
        return (
          <div
            key={event.eventId}
            className="rounded-lg border p-4"
            data-audit-event-id={event.eventId}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-medium">{eventTypeLabel(event)}</strong>
                  <Badge variant={revisionBadgeVariant(event)}>{revisionLabel(event)}</Badge>
                  {event.revisionAction === 'VOID' && <Badge variant="destructive">已作废</Badge>}
                </div>
                <p className="m-0 mt-2 text-xs text-muted-foreground">
                  Revision {event.ledgerRevision} · {formatDate(event.occurredAt)} ·{' '}
                  {event.source.channel}
                </p>
                {event.reason && (
                  <p className="m-0 mt-2 text-sm text-muted-foreground">原因：{event.reason}</p>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {isExecutionEvent(event) && event.eventId === targetEventId && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onCorrect(event)}
                    >
                      更正
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => onVoid(event)}
                    >
                      作废
                    </Button>
                  </>
                )}
                <RestoreAuditAction
                  event={event}
                  source={source}
                  childExists={childExists}
                  onRestore={onRestore}
                  onRestoreTransfer={onRestoreTransfer}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RestoreAuditAction({
  event,
  source,
  childExists,
  onRestore,
  onRestoreTransfer,
}: {
  event: LedgerEventV2;
  source: LedgerEventV2 | undefined;
  childExists: boolean;
  onRestore: (event: VoidEvent, source: ExecutionEvent) => void;
  onRestoreTransfer: (event: VoidEvent, source: CashTransferEvent) => void;
}) {
  if (!isVoidEvent(event) || childExists || !source) return null;
  if (isCashTransferEvent(source)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onRestoreTransfer(event, source)}
      >
        恢复划转
      </Button>
    );
  }
  if (!isExecutionEvent(source)) return null;
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => onRestore(event, source)}>
      恢复
    </Button>
  );
}

export function CorrectionReasonSheet({
  account,
  action,
  target,
  restoreSource,
  ledgerRevision,
  onOpenChange,
}: {
  account: Account;
  action: 'void' | 'restore';
  target: LedgerEventV2 | null;
  restoreSource?: ExecutionEvent;
  ledgerRevision: string;
  onOpenChange: (open: boolean) => void;
}) {
  const toastManager = useToastManager();
  const voidMutation = useVoidExecutionMutation();
  const restoreMutation = useRestoreExecutionMutation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = Boolean(target);
  const pending = voidMutation.isPending || restoreMutation.isPending;

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
  }, [open, target?.eventId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || pending) return;
    if (!reason.trim()) {
      setError('原因必填。');
      return;
    }
    const commandId = createClientCommandId();
    try {
      let response: LedgerCommandResponseV2;
      if (action === 'void') {
        if (!isExecutionEvent(target)) {
          setError('当前事实不是可作废的成交。');
          return;
        }
        response = await voidMutation.mutateAsync({
          command: 'VOID_EXECUTION',
          accountId: account.id,
          expectedLedgerRevision: ledgerRevision,
          supersedesEventId: target.eventId,
          source: { category: 'MANUAL', channel: 'desktop-account-data', externalId: commandId },
          actorId: 'desktop-user',
          reason: reason.trim(),
        });
      } else {
        if (
          !isVoidEvent(target) ||
          !restoreSource ||
          !restoreSource.occurredAt ||
          restoreSource.timePrecision === 'UNKNOWN'
        ) {
          setError('原成交缺少可恢复的时间信息，请先检查审计链。');
          return;
        }
        response = await restoreMutation.mutateAsync({
          command: 'RESTORE_EXECUTION',
          accountId: account.id,
          occurredAt: restoreSource.occurredAt,
          timePrecision: restoreSource.timePrecision,
          sourceTimezone: restoreSource.sourceTimezone,
          economicOrderKey: restoreSource.economicOrderKey,
          side: restoreSource.type === 'SELL_EXECUTION' ? 'SELL' : 'BUY',
          payload: restoreSource.payload,
          source: { category: 'MANUAL', channel: 'desktop-account-data', externalId: commandId },
          actorId: 'desktop-user',
          expectedLedgerRevision: ledgerRevision,
          supersedesEventId: target.eventId,
          reason: reason.trim(),
        });
      }
      toastManager.add({
        title: commandFeedback(response, action === 'void' ? '成交作废' : '成交恢复'),
        type: 'success',
        timeout: 2800,
      });
      onOpenChange(false);
    } catch (caught) {
      const conflict = errorCode(caught) === 'LEDGER_REVISION_CONFLICT';
      setError(
        conflict
          ? '账本版本已变化，请刷新并比较后重试；原因仍保留。'
          : errorMessage(caught, '操作失败，请稍后重试。'),
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] max-w-[calc(100%-16px)] p-6">
        <SheetTitle>{action === 'void' ? '作废成交' : '恢复成交'}</SheetTitle>
        <SheetDescription>
          {action === 'void'
            ? '作废会生成 VOID 版本，不会从历史中删除事实。'
            : '恢复会生成 RESTORE 版本，原 VOID 记录和本次原因仍会保留。'}
        </SheetDescription>
        <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <Field>
            <FieldLabel htmlFor="correction-reason">原因</FieldLabel>
            <Textarea
              id="correction-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="请填写可审计的原因"
              required
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="submit"
              variant={action === 'void' ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {correctionSubmitLabel(pending, action)}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
