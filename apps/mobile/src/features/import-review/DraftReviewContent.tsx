import { draftIsFrozen } from '@thesis-ledger/api-client';
import type { ImportDraftReviewRecord, ImportDraftRow } from '@thesis-ledger/schemas';
import { Action, Copy, Feedback } from '../../components/MobilePrimitives';
import { DraftReviewRows } from './DraftReviewRows';
import { draftStatusLabels } from './DraftsScreen';

type RowPatch = { symbol?: string; quantity?: string; averageCost?: string };
export function DraftReviewContent({
  opened,
  rows,
  selected,
  revision,
  stale,
  blocked,
  dirty,
  feedback,
  hasError,
  onChange,
  onToggle,
  onRemove,
  onSave,
  onSubmit,
}: {
  opened: ImportDraftReviewRecord;
  rows: ImportDraftRow[];
  selected: string[];
  revision: string | null;
  stale: boolean;
  blocked: boolean;
  dirty: boolean;
  feedback: string | null;
  hasError: boolean;
  onChange: (id: string, patch: RowPatch) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  const frozen = draftIsFrozen(opened);
  return (
    <>
      <Copy muted>
        {draftStatusLabels[opened.status]} · 修订 {opened.review?.revision ?? '缺失'} · 账本修订{' '}
        {revision ?? '读取中'}
      </Copy>
      {stale ? (
        <Feedback message="服务端已有其他修订，原输入已保留，请重新读取后再操作。" error />
      ) : null}
      <DraftReviewRows
        opened={opened}
        rows={rows}
        selected={selected}
        blocked={blocked}
        dirty={dirty}
        onChange={onChange}
        onToggle={onToggle}
        onRemove={onRemove}
      />
      <Feedback message={feedback} error={hasError} />
      <Action label="保存草稿修订" disabled={blocked || !dirty || frozen} onPress={onSave} />
      <Action
        label={`提交所选 ${selected.length} 行`}
        primary
        disabled={blocked || dirty || selected.length === 0 || frozen}
        onPress={onSubmit}
      />
    </>
  );
}
