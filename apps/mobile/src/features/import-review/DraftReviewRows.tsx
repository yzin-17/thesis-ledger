import { draftIsFrozen, rowCanSubmit } from '@thesis-ledger/api-client';
import type { ImportDraftReviewRecord, ImportDraftRow } from '@thesis-ledger/schemas';
import { Action, Copy, Feedback, Field, Section } from '../../components/MobilePrimitives';

type RowPatch = { symbol?: string; quantity?: string; averageCost?: string };
export function DraftReviewRows({
  opened,
  rows,
  selected,
  blocked,
  dirty,
  onChange,
  onToggle,
  onRemove,
}: {
  opened: ImportDraftReviewRecord;
  rows: ImportDraftRow[];
  selected: string[];
  blocked: boolean;
  dirty: boolean;
  onChange: (id: string, patch: RowPatch) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {rows.map((row, index) => {
        const frozen =
          draftIsFrozen(opened) || Boolean(opened.review?.frozenRowIds.includes(row.rowId));
        if (row.kind !== 'POSITION_BASELINE')
          return (
            <Section key={row.rowId} title={`第 ${index + 1} 行`}>
              <Copy>此行不是可审核的持仓快照，原内容与问题已保留，不参与本次提交。</Copy>
            </Section>
          );
        return (
          <Section key={row.rowId} title={`第 ${index + 1} 行 · ${row.assetName ?? row.symbol}`}>
            <Copy muted>
              {frozen ? '已冻结' : '待核对'} · {row.currency} ·{' '}
              {row.observedAt ?? opened.review?.observedAt ?? '观察时间缺失'}
            </Copy>
            <Field
              label={`第 ${index + 1} 行标准代码`}
              value={row.symbol}
              onChange={(symbol) => onChange(row.rowId, { symbol })}
              editable={!frozen && !blocked}
            />
            <Field
              label={`第 ${index + 1} 行数量`}
              value={row.quantity}
              onChange={(quantity) => onChange(row.rowId, { quantity })}
              keyboardType="decimal-pad"
              editable={!frozen && !blocked}
            />
            <Field
              label={`第 ${index + 1} 行成本`}
              value={row.averageCost ?? ''}
              onChange={(averageCost) => onChange(row.rowId, { averageCost })}
              keyboardType="decimal-pad"
              editable={!frozen && !blocked}
            />
            <Feedback message={row.issues.join('；')} error />
            <Action
              label={
                selected.includes(row.rowId)
                  ? `取消选择第 ${index + 1} 行`
                  : `选择第 ${index + 1} 行`
              }
              disabled={blocked || dirty || !rowCanSubmit(opened, row)}
              onPress={() => onToggle(row.rowId)}
            />
            <Action
              label={`移除第 ${index + 1} 行`}
              destructive
              disabled={frozen || blocked}
              onPress={() => {
                onRemove(row.rowId);
              }}
            />
          </Section>
        );
      })}
    </>
  );
}
