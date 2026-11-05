import { useCallback, useEffect, useState } from 'react';
import type { ImportDraftReviewRecord, ImportDraftRow } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { useDraftReviewsQuery, useDraftReviewMutations } from './draft-review.queries.js';
import { draftIsFrozen, reviewedDraftCommand, rowCanSubmit } from './draft-review.helpers.js';
import { ImportDraftReviewContent } from './ImportDraftReviewContent.js';
import { ImportDraftReviewList } from './ImportDraftReviewList.js';

export function ImportDraftReview({
  accountId,
  ledgerRevision,
  ledgerReady,
  onDirtyChange,
  onBusyChange,
  onPortfolioChanged,
  onReadLedger,
}: {
  accountId: string;
  ledgerRevision: string;
  ledgerReady: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onPortfolioChanged: () => void;
  onReadLedger: () => Promise<void>;
}) {
  const query = useDraftReviewsQuery(accountId);
  const [selected, setSelected] = useState<ImportDraftReviewRecord | null>(null);
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const { confirm } = useConfirmDialog();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const handleBusy = useCallback(
    (value: boolean) => {
      setBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  const confirmDiscard = async () =>
    !dirty ||
    (await confirm({
      title: '放弃草稿修改？',
      description: '未保存的人工修订会丢失。',
      confirmLabel: '放弃修改',
      cancelLabel: '继续审核',
    }));
  const choose = async (draft: ImportDraftReviewRecord | null) => {
    if (busy || reloading || readError || !(await confirmDiscard())) return false;
    setDirty(false);
    onDirtyChange(false);
    setSelected(draft);
    setSelectionEpoch((epoch) => epoch + 1);
    return true;
  };
  const reload = async () => {
    if (busy || reloading || !(await confirmDiscard())) return;
    setReloading(true);
    setReadError(null);
    try {
      await onReadLedger();
      const result = await query.refetch();
      if (result.error) throw result.error;
      setSelected(null);
      setDirty(false);
      onDirtyChange(false);
    } catch {
      setReadError('账本或草稿读取失败，当前审核内容已保留；请重试读取后再保存或提交。');
    } finally {
      setReloading(false);
    }
  };
  const current = query.data?.find((draft) => draft.id === selected?.id);
  return (
    <ImportDraftReviewList
      query={query}
      selectedId={selected?.id ?? null}
      readError={readError}
      busy={busy}
      reloading={reloading}
      onReload={() => void reload()}
      onChoose={(draft) => void choose(draft)}
    >
      {selected && (
        <DraftReviewEditor
          key={`${selected.id}:${selected.review?.revision ?? 'missing'}:${selectionEpoch}`}
          draft={selected}
          ledgerRevision={ledgerRevision}
          ledgerReady={ledgerReady}
          readable={
            !query.isError &&
            !readError &&
            !reloading &&
            !query.isFetching &&
            current?.review?.revision === selected.review?.revision &&
            current?.status === selected.status
          }
          onDirtyChange={(value) => {
            setDirty(value);
            onDirtyChange(value);
          }}
          onSaved={async () => {
            const result = await query.refetch();
            const fresh = result.data?.find((draft) => draft.id === selected.id);
            if (fresh) {
              setDirty(false);
              onDirtyChange(false);
              setSelected(fresh);
              setSelectionEpoch((epoch) => epoch + 1);
            }
          }}
          onPortfolioChanged={onPortfolioChanged}
          onBusyChange={handleBusy}
        />
      )}
    </ImportDraftReviewList>
  );
}

function DraftReviewEditor({
  draft,
  ledgerRevision,
  ledgerReady,
  readable,
  onDirtyChange,
  onSaved,
  onPortfolioChanged,
  onBusyChange,
}: {
  draft: ImportDraftReviewRecord;
  ledgerRevision: string;
  ledgerReady: boolean;
  readable: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
  onPortfolioChanged: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<ImportDraftRow[]>(draft.review?.rows ?? []);
  const [dirty, setDirty] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expectedLedgerRevision] = useState(ledgerRevision);
  const [fullConfirmed, setFullConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [action, setAction] = useState<'save' | 'submit' | null>(null);
  const { revise, submit } = useDraftReviewMutations(draft.accountId);
  const toast = useToastManager();
  const frozen = draftIsFrozen(draft);
  const busy = action !== null || revise.isPending || submit.isPending;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const ready = readable && !busy && !frozen;
  const currentLedger = ledgerReady && ledgerRevision === expectedLedgerRevision;
  const save = async () => {
    if (!ready || (!dirty && draft.status !== 'partial')) return;
    setAction('save');
    setError(null);
    try {
      await revise.mutateAsync(await reviewedDraftCommand(draft, rows));
      setDirty(false);
      onDirtyChange(false);
      setReceipt('人工修订已保存，尚未写入持仓。');
      toast.add({ title: '草稿修订已保存', type: 'success' });
      await onSaved();
    } catch {
      setError('修订保存失败，已保留当前修改；请核对重复代码及字段，版本冲突需重新读取。');
    } finally {
      setAction(null);
    }
  };
  const commit = async () => {
    if (!ready || dirty || !currentLedger || !draft.review || selectedIds.length === 0) return;
    if (draft.review.scope === 'FULL' && !fullConfirmed) return;
    if (selectedIds.some((id) => !rows.some((row) => row.rowId === id && rowCanSubmit(draft, row))))
      return;
    setAction('submit');
    setError(null);
    try {
      const response = await submit.mutateAsync({
        command: 'SUBMIT_IMPORT_DRAFT_REVISION',
        draftId: draft.id,
        revision: draft.review.revision,
        expectedLedgerRevision,
        selectedRowIds: selectedIds,
        actorId: 'desktop-user',
      });
      setReceipt(
        response.idempotentReplay ? '该提交已完成，未重复写入。' : '所选行已提交，审计记录已保留。',
      );
      setSelectedIds([]);
      onPortfolioChanged();
      await onSaved();
    } catch {
      setError(
        '提交失败，草稿和所选行已保留；请核对账户资产类型、时间及数值。账本或草稿冲突后请重新读取并核对。',
      );
    } finally {
      setAction(null);
    }
  };
  if (!draft.review)
    return (
      <Alert variant="destructive">
        <AlertTitle>草稿缺少可审核修订</AlertTitle>
        <AlertDescription>保留历史记录，不能猜测行结构或提交。</AlertDescription>
      </Alert>
    );
  const canSubmit =
    ready &&
    !dirty &&
    currentLedger &&
    selectedIds.length > 0 &&
    (draft.review.scope === 'PARTIAL' || fullConfirmed);
  return (
    <ImportDraftReviewContent
      draft={{ ...draft, review: draft.review }}
      rows={rows}
      selectedIds={selectedIds}
      frozen={frozen}
      readable={readable}
      currentLedger={currentLedger}
      ready={ready}
      dirty={dirty}
      fullConfirmed={fullConfirmed}
      error={error}
      receipt={receipt}
      canSave={ready && (dirty || draft.status === 'partial')}
      canSubmit={canSubmit}
      saving={action === 'save'}
      submitting={action === 'submit'}
      onSave={() => void save()}
      onSubmit={() => void commit()}
      onFullConfirmed={setFullConfirmed}
      onRowsChange={(nextRows) => {
        setRows(nextRows);
        setDirty(true);
        setSelectedIds([]);
        onDirtyChange(true);
      }}
      onSelected={(rowId, checked) =>
        setSelectedIds((ids) => (checked ? [...ids, rowId] : ids.filter((id) => id !== rowId)))
      }
    />
  );
}
