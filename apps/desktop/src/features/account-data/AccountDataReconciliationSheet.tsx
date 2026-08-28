import { useEffect, useState } from 'react';
import type { BaselineReconciliationCandidateV2 } from '@thesis-ledger/api-client';
import { useToastManager } from '@/components/ui/toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { Account } from '../portfolio/portfolio.types.js';
import { useConfirmBaselineReconciliationMutation } from './account-data.mutations.js';
import type { useReconciliationCandidatesQuery } from './account-data.queries.js';
import {
  commandFeedback,
  createClientCommandId,
  errorCode,
  errorMessage,
  reconciliationBadgeLabel,
  reconciliationBadgeVariant,
} from './account-data.helpers.js';

export function ReconciliationSheet({
  account,
  open,
  query,
  ledgerRevision,
  onOpenChange,
}: {
  account: Account;
  open: boolean;
  query: ReturnType<typeof useReconciliationCandidatesQuery>;
  ledgerRevision: string;
  onOpenChange: (open: boolean) => void;
}) {
  const toastManager = useToastManager();
  const mutation = useConfirmBaselineReconciliationMutation();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [reason, setReason] = useState('确认确定性对账匹配');
  const [error, setError] = useState<string | null>(null);
  const selectedCandidate = query.data?.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedCandidateId(null);
    setReason('确认确定性对账匹配');
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!selectedCandidate || mutation.isPending) return;
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
        ruleVersion: query.data?.ruleVersion ?? 1,
        expectedLedgerRevision: ledgerRevision,
        source: {
          category: 'MANUAL',
          channel: 'desktop-account-data-reconciliation',
          externalId: createClientCommandId(),
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
      <SheetContent
        side="right"
        className="h-[100dvh] w-[720px] max-w-[calc(100%-16px)] overflow-auto p-6 sm:max-w-[calc(100%-16px)]"
      >
        <SheetTitle>Baseline 对账</SheetTitle>
        <SheetDescription>
          展示确定性匹配依据、覆盖数量、剩余量和冲突；只有最后的确认按钮会写入账本。
        </SheetDescription>
        <ReconciliationResults
          query={query}
          selectedCandidateId={selectedCandidateId}
          selectedCandidate={selectedCandidate}
          reason={reason}
          error={error}
          mutation={mutation}
          onSelectCandidate={(candidate) => {
            if (candidate.status === 'AVAILABLE') {
              setSelectedCandidateId(candidate.candidateId);
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
  reason,
  error,
  mutation,
  onSelectCandidate,
  onReasonChange,
  onSubmit,
}: {
  query: ReturnType<typeof useReconciliationCandidatesQuery>;
  selectedCandidateId: string | null;
  selectedCandidate: BaselineReconciliationCandidateV2 | undefined;
  reason: string;
  error: string | null;
  mutation: ReturnType<typeof useConfirmBaselineReconciliationMutation>;
  onSelectCandidate: (candidate: BaselineReconciliationCandidateV2) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}) {
  if (query.isPending && !query.data) {
    return (
      <div className="mt-5 flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Alert className="mt-5" variant="destructive">
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
    <div className="mt-5 flex flex-col gap-4">
      {candidates.length > 0 ? (
        candidates.map((candidate) => (
          <ReconciliationCandidate
            key={candidate.candidateId}
            candidate={candidate}
            selected={candidate.candidateId === selectedCandidateId}
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
            <CardDescription>
              确认后会生成 BASELINE_RECONCILIATION 事实，不能通过原地编辑撤回。
            </CardDescription>
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
            {error && <FieldError>{error}</FieldError>}
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
      {!selectedCandidate && error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function ReconciliationCandidate({
  candidate,
  selected,
  onSelect,
}: {
  candidate: BaselineReconciliationCandidateV2;
  selected: boolean;
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
      disabled={conflicted}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="font-medium">{candidate.symbol}</strong>
          <span className="ml-2 text-xs text-muted-foreground">{candidate.candidateId}</span>
        </div>
        <Badge variant={reconciliationBadgeVariant(conflicted, selected)}>
          {reconciliationBadgeLabel(conflicted, selected)}
        </Badge>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>已观察：{candidate.observedQuantity}</span>
        <span>已覆盖：{candidate.coveredQuantity}</span>
        <span>覆盖后剩余：{candidate.remainingQuantity}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>匹配依据：{candidate.matchBasis.join('、')}</span>
        {candidate.conflictReasons.length > 0 && (
          <span>冲突：{candidate.conflictReasons.join('、')}</span>
        )}
      </div>
    </button>
  );
}
