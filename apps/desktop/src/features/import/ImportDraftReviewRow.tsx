import type { ImportDraftRow } from '@thesis-ledger/schemas';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';

export function ImportDraftReviewRow({
  row,
  index,
  frozen,
  selected,
  selectable,
  busy,
  onSelected,
  onChange,
  onRemove,
}: {
  row: ImportDraftRow;
  index: number;
  frozen: boolean;
  selected: boolean;
  selectable: boolean;
  busy: boolean;
  onSelected: (checked: boolean) => void;
  onChange: (row: ImportDraftRow) => void;
  onRemove: () => void;
}) {
  const name = `第 ${index + 1} 行`;
  if (row.kind !== 'POSITION_BASELINE')
    return (
      <div className="rounded-lg border p-4 text-sm" role="status">
        {name}：此行不是可审核的持仓快照，已保留原内容和问题，不参与本次提交。
      </div>
    );
  const change = (patch: Partial<typeof row>) => onChange({ ...row, ...patch, issues: [] });
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label={name}>
      <div className="flex items-center gap-3 text-sm">
        <Checkbox
          aria-label={`选择${name}`}
          checked={selected}
          disabled={!selectable || busy}
          onCheckedChange={(checked) => onSelected(checked)}
        />
        <span className="font-medium">{row.assetName ?? row.symbol}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {frozen ? '已冻结' : '待人工核对'} · {row.currency}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel>标准代码</FieldLabel>
          <Input
            aria-label={`${name}标准代码`}
            value={row.symbol}
            disabled={frozen || busy}
            onChange={(event) => change({ symbol: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>持仓数量</FieldLabel>
          <Input
            aria-label={`${name}持仓数量`}
            value={row.quantity}
            inputMode="decimal"
            disabled={frozen || busy}
            onChange={(event) => change({ quantity: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>平均成本</FieldLabel>
          <Input
            aria-label={`${name}平均成本`}
            value={row.averageCost ?? ''}
            inputMode="decimal"
            disabled={frozen || busy}
            onChange={(event) => change({ averageCost: event.target.value })}
          />
        </Field>
      </div>
      {row.issues.length > 0 && (
        <p className="m-0 text-sm text-destructive">
          此行仍有待核对问题，请人工核对代码、数量和成本后保存修订。
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={frozen || busy}
        onClick={onRemove}
      >
        移除此行
      </Button>
    </section>
  );
}
