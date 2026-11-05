import type { ImportDraftReviewRecord, ImportDraftRow } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ImportDraftReviewRow } from './ImportDraftReviewRow.js';
import { draftSaveActionLabel, draftStatusLabels, rowCanSubmit } from './draft-review.helpers.js';

type ReviewedDraft = ImportDraftReviewRecord & {
  review: NonNullable<ImportDraftReviewRecord['review']>;
};
type Props = {
  draft: ReviewedDraft;
  rows: ImportDraftRow[];
  selectedIds: string[];
  frozen: boolean;
  readable: boolean;
  currentLedger: boolean;
  ready: boolean;
  dirty: boolean;
  fullConfirmed: boolean;
  error: string | null;
  receipt: string | null;
  canSave: boolean;
  canSubmit: boolean;
  saving: boolean;
  submitting: boolean;
  onRowsChange: (rows: ImportDraftRow[]) => void;
  onSelected: (rowId: string, checked: boolean) => void;
  onFullConfirmed: (checked: boolean) => void;
  onSave: () => void;
  onSubmit: () => void;
};

export function ImportDraftReviewContent({
  draft,
  rows,
  selectedIds,
  frozen,
  readable,
  currentLedger,
  ready,
  dirty,
  fullConfirmed,
  error,
  receipt,
  canSave,
  canSubmit,
  saving,
  submitting,
  onRowsChange,
  onSelected,
  onFullConfirmed,
  onSave,
  onSubmit,
}: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-4" aria-label="草稿审核">
      <p className="m-0 text-sm">
        修订 {draft.review.revision} · {draft.review.scope === 'PARTIAL' ? '部分更新' : '完整快照'}{' '}
        · {draftStatusLabels[draft.status]}
      </p>
      {draft.status === 'partial' && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          当前修订已有提交，剩余行须先创建后续修订。已提交行保持冻结。
        </p>
      )}
      <p className="m-0 break-words text-xs text-muted-foreground">
        观察：{draft.review.observedAt ?? '未知'} · 采集：{draft.review.capturedAt ?? '未知'} ·
        时区：{draft.review.sourceTimezone ?? '未知'}。缺少业务时间的行不能提交。
      </p>
      {!readable && (
        <Alert>
          <AlertTitle>请重新读取当前草稿</AlertTitle>
          <AlertDescription>读取中、读取失败或草稿版本已变化，当前内容仅供核对。</AlertDescription>
        </Alert>
      )}
      {!currentLedger && !frozen && (
        <Alert>
          <AlertTitle>请重新读取账本并重新选择草稿</AlertTitle>
          <AlertDescription>
            账本版本尚未就绪或已变化，保留当前内容，不自动重试提交。
          </AlertDescription>
        </Alert>
      )}
      {rows.map((row, index) => (
        <ImportDraftReviewRow
          key={row.rowId}
          row={row}
          index={index}
          frozen={frozen || draft.review.frozenRowIds.includes(row.rowId)}
          busy={!ready}
          selected={selectedIds.includes(row.rowId)}
          selectable={!dirty && rowCanSubmit(draft, row)}
          onSelected={(checked) => onSelected(row.rowId, checked)}
          onChange={(next) =>
            onRowsChange(rows.map((item) => (item.rowId === row.rowId ? next : item)))
          }
          onRemove={() => onRowsChange(rows.filter((item) => item.rowId !== row.rowId))}
        />
      ))}
      {draft.review.scope === 'FULL' && !frozen && (
        <div className="flex items-start gap-3 text-sm">
          <Checkbox
            aria-label="确认完整快照遗漏标的归零"
            checked={fullConfirmed}
            disabled={!ready}
            onCheckedChange={onFullConfirmed}
          />
          <span>已确认这是完整快照；未出现的既有标的可能补记为零余额。</span>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {receipt && <p role="status">{receipt}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!canSave} onClick={onSave}>
          {draftSaveActionLabel(draft.status, saving)}
        </Button>
        <Button disabled={!canSubmit} onClick={onSubmit}>
          {submitting ? '提交中……' : `确认并提交所选 ${selectedIds.length} 行`}
        </Button>
      </div>
    </div>
  );
}
