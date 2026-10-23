import { useEffect, useState } from 'react';
import type { BaselineReconciliationCandidate } from '@thesis-ledger/api-client';
import { useToastManager } from '@/components/ui/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { Account } from '../portfolio/portfolio.types.js';
import {
  reconciliationBasisLabels,
  reconciliationConflictLabels,
} from './reconciliation.labels.js';
import { useConfirmBaselineReconciliationMutation } from './account-data.mutations.js';
import type { useReconciliationCandidatesQuery } from './account-data.queries.js';
import {
  commandFeedback,
  createClientCommandId,
  errorCode,
  errorMessage,
  formatDate,
  formatDecimal,
  reconciliationBadgeLabel,
  reconciliationBadgeVariant,
} from './account-data.helpers.js';

export function ReconciliationSheet({
  account,
  open,
  query,
  ledgerRevision,
  ledgerReady = true,
  onOpenChange,
}: {
  account: Account;
  open: boolean;
  query: ReturnType<typeof useReconciliationCandidatesQuery>;
  ledgerRevision: string;
  ledgerReady?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toastManager = useToastManager();
  const mutation = useConfirmBaselineReconciliationMutation(account.mode);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedAt, setSelectedAt] = useState<{
    accountId: string;
    updatedAt: number;
    ledgerRevision: string;
    commandId: string;
  } | null>(null);
  const [reason, setReason] = useState('确认确定性对账匹配');
  const [error, setError] = useState<string | null>(null);
  const selectedCandidate = query.data?.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );
  const readable =
    ledgerReady && !query.isError && !query.isFetching && query.data?.accountId === account.id;
  const selectionCurrent =
    readable &&
    selectedAt?.accountId === account.id &&
    selectedAt.updatedAt === query.dataUpdatedAt &&
    selectedAt.ledgerRevision === ledgerRevision;

  useEffect(() => {
    if (!open) return;
    setSelectedCandidateId(null);
    setSelectedAt(null);
    setReason('确认确定性对账匹配');
    setError(null);
  }, [open, account.id]);

  const submit = async () => {
    const candidateData = query.data;
    if (
      !candidateData ||
      !selectedAt ||
      !selectedCandidate ||
      selectedCandidate.status !== 'AVAILABLE' ||
      !selectionCurrent ||
      mutation.isPending
    )
      return;
    if (!reason.trim()) {
      setError('确认原因必填。');
      return;
    }
    try {
      const response = await mutation.mutateAsync({
        command: 'CONFIRM_BASELINE_RECONCILIATION',
        accountId: account.id,
        baselineFactId: selectedCandidate.baselineFactId,
        executionFactIds: selectedCandidate.executionFactIds,
        coveredQuantity: selectedCandidate.coveredQuantity,
        coveredCost: selectedCandidate.coveredCost,
        ruleVersion: candidateData.ruleVersion,
        expectedLedgerRevision: ledgerRevision,
        source: {
          category: 'MANUAL',
          channel: 'desktop-account-data-reconciliation',
          externalId: selectedAt.commandId,
        },
        actorId: 'desktop-user',
        reason: reason.trim(),
      });
      toastManager.add({
        title: commandFeedback(response, '对账确认'),
        type: 'success',
        timeout: 2800,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(
        errorCode(caught) === 'LEDGER_REVISION_CONFLICT'
          ? '账本版本已变化，请刷新候选后比较。'
          : errorMessage(caught, '对账确认失败，请检查候选和服务状态。'),
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="form" className="h-[100dvh] overflow-auto p-6">
        <SheetHeader>
          <SheetTitle>持仓快照对账</SheetTitle>
          <SheetDescription>
            展示确定性匹配依据、覆盖数量、剩余量和冲突；只有最后的确认按钮会写入账本。
          </SheetDescription>
        </SheetHeader>
        <ReconciliationResults
          query={query}
          selectedCandidateId={selectedCandidateId}
          selectedCandidate={selectionCurrent ? selectedCandidate : undefined}
          canSelect={readable && !mutation.isPending}
          reason={reason}
          error={error}
          mutation={mutation}
          onSelectCandidate={(candidate) => {
            if (readable && candidate.status === 'AVAILABLE') {
              setSelectedCandidateId(candidate.candidateId);
              setSelectedAt({
                accountId: account.id,
                updatedAt: query.dataUpdatedAt,
                ledgerRevision,
                commandId: createClientCommandId(),
              });
              setError(null);
            }
          }}
          onReasonChange={setReason}
          onSubmit={() => void submit()}
        />
      </SheetContent>
    </Sheet>
  );
}

function ReconciliationResults({
  query,
  selectedCandidateId,
  selectedCandidate,
  canSelect,
  reason,
  error,
  mutation,
  onSelectCandidate,
  onReasonChange,
  onSubmit,
}: {
  query: ReturnType<typeof useReconciliationCandidatesQuery>;
  selectedCandidateId: string | null;
  selectedCandidate: BaselineReconciliationCandidate | undefined;
  canSelect: boolean;
  reason: string;
  error: string | null;
  mutation: ReturnType<typeof useConfirmBaselineReconciliationMutation>;
  onSelectCandidate: (candidate: BaselineReconciliationCandidate) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}) {
  if (query.isPending && !query.data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>对账候选读取失败</AlertTitle>
        <AlertDescription>无法计算当前账户的确定性匹配。</AlertDescription>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
          重新加载
        </Button>
      </Alert>
    );
  }
  const candidates = query.data?.candidates ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        重新读取对账候选
      </Button>
      {candidates.length > 0 ? (
        candidates.map((candidate) => (
          <ReconciliationCandidate
            key={candidate.candidateId}
            candidate={candidate}
            observedAt={
              query.data?.checkpoints.find(
                (checkpoint) => checkpoint.baselineFactId === candidate.baselineFactId,
              )?.occurredAt ?? null
            }
            selected={candidate.candidateId === selectedCandidateId}
            disabled={!canSelect}
            onSelect={() => onSelectCandidate(candidate)}
          />
        ))
      ) : (
        <Empty className="min-h-40 rounded-xl border bg-card p-8">
          <EmptyDescription>暂无可确认的对账候选。</EmptyDescription>
        </Empty>
      )}
      {selectedCandidate && (
        <Card className="shadow-none">
          <CardHeader className="gap-2 border-b">
            <CardTitle>确认写入账本</CardTitle>
            <CardDescription>确认后保留新的对账事实及审计记录；撤回需要另建修正。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4">
            <Field>
              <FieldLabel htmlFor="reconciliation-reason">确认原因</FieldLabel>
              <Textarea
                id="reconciliation-reason"
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
              />
            </Field>
            {error && (
              <Field invalid>
                <FieldError>{error}</FieldError>
              </Field>
            )}
            <Button type="button" onClick={onSubmit} disabled={mutation.isPending}>
              {mutation.isPending && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {mutation.isPending ? '确认中…' : '确认对账并写入账本'}
            </Button>
          </CardContent>
        </Card>
      )}
      {!selectedCandidate && error && (
        <Field invalid>
          <FieldError>{error}</FieldError>
        </Field>
      )}
    </div>
  );
}

function ReconciliationCandidate({
  candidate,
  observedAt,
  selected,
  disabled,
  onSelect,
}: {
  candidate: BaselineReconciliationCandidate;
  observedAt: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const conflicted = candidate.status === 'CONFLICTED';
  return (
    <button
      type="button"
      className={cn(
        'grid gap-3 rounded-xl border bg-card p-4 text-left transition-colors',
        selected && 'border-primary ring-2 ring-primary/20',
        conflicted && 'cursor-not-allowed opacity-70',
      )}
      disabled={conflicted || disabled}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="font-medium">{candidate.symbol}</strong>
          <span className="ml-2 text-xs text-muted-foreground">
            快照时间：{formatDate(observedAt)}
          </span>
        </div>
        <Badge variant={reconciliationBadgeVariant(conflicted, selected)}>
          {reconciliationBadgeLabel(conflicted, selected)}
        </Badge>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>已观察：{candidate.observedQuantity}</span>
        <span>已覆盖：{candidate.coveredQuantity}</span>
        <span>覆盖后剩余：{candidate.remainingQuantity}</span>
        <span>观察总成本：{formatDecimal(candidate.observedCost)}</span>
        <span>覆盖成本：{formatDecimal(candidate.coveredCost)}</span>
        <span>剩余成本：{formatDecimal(candidate.remainingCost)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          匹配依据：
          {candidate.matchBasis.map((basis) => reconciliationBasisLabels[basis]).join('、')}
        </span>
        {candidate.conflictReasons.length > 0 && (
          <span>
            冲突：
            {candidate.conflictReasons
              .map((reason) => reconciliationConflictLabels[reason])
              .join('、')}
          </span>
        )}
      </div>
    </button>
  );
}
