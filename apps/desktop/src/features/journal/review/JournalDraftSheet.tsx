import { useId, useState } from 'react';
import { isEqual } from 'es-toolkit';
import {
  journalAnalysisDraftSchema,
  positiveDecimalStringSchema,
  type JournalAnalysisDraft,
  type JournalReviewCandidateContract,
} from '@thesis-ledger/schemas';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { useDraftCloseGuard } from '../../shared/useDraftCloseGuard.js';

const prices = {
  plannedEntry: '计划入场价',
  plannedExit: '计划退出价',
  stopLoss: '计划止损价',
} as const;
type PriceField = keyof typeof prices;
export function journalDraftPriceErrors(draft: JournalAnalysisDraft) {
  const errors: Partial<Record<PriceField, string>> = {};
  for (const key of Object.keys(prices) as PriceField[]) {
    const value = draft[key];
    if (value == null) continue;
    if (!positiveDecimalStringSchema.safeParse(value).success)
      errors[key] = `${prices[key]}必须是大于零的有效十进制价格`;
  }
  return errors;
}
export function JournalDraftSheet({
  candidate,
  value,
  onApply,
  open,
  onOpenChange,
  inline = false,
}: {
  candidate: JournalReviewCandidateContract;
  value: JournalAnalysisDraft;
  onApply: (value: JournalAnalysisDraft) => void;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  inline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<unknown>(null);
  const [priceErrors, setPriceErrors] = useState<Partial<Record<PriceField, string>>>({});
  const errorId = useId();
  const requestClose = useDraftCloseGuard({
    open,
    draft: { reference: candidate.input.reference, fields: draft },
    dirty: !isEqual(draft, value),
    busy: false,
    onOpenChange,
  });
  const apply = () => {
    const errors = journalDraftPriceErrors(draft);
    setPriceErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const parsed = journalAnalysisDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(new Error('请填写有效的十进制价格和非负整数天数'));
      return;
    }
    onApply(parsed.data);
    onOpenChange(false);
  };
  const editor = (
    <div className="flex flex-col gap-4">
      {inline ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-base font-semibold">补充本次计划</h4>
          <p className="text-xs leading-relaxed text-muted-foreground">
            只影响本次复盘：未修改的字段沿用原计划，修改后清空表示本次不使用。
          </p>
        </div>
      ) : (
        <SheetHeader>
          <SheetTitle>本次分析草稿</SheetTitle>
          <SheetDescription>
            只影响本次复盘：未修改的字段沿用原计划，修改后清空表示本次不使用。
          </SheetDescription>
        </SheetHeader>
      )}
      <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          {Object.entries(prices).map(([rawKey, label]) => {
            const key = rawKey as keyof typeof prices;
            return (
              <Field key={key} invalid={Boolean(priceErrors[key])}>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  autoFocus={inline && key === 'plannedEntry'}
                  aria-label={label}
                  aria-invalid={Boolean(priceErrors[key])}
                  aria-describedby={priceErrors[key] ? `${errorId}-${key}` : undefined}
                  inputMode="decimal"
                  value={draft[key] ?? ''}
                  placeholder="选填"
                  onChange={(event) => {
                    setError(null);
                    setPriceErrors((previous) => ({ ...previous, [key]: '' }));
                    setDraft({ ...draft, [key]: event.target.value || null });
                  }}
                />
                {candidate.input.plan?.[key] != null && (
                  <FieldDescription>原计划：{candidate.input.plan[key]}</FieldDescription>
                )}
                {priceErrors[key] && (
                  <FieldError id={`${errorId}-${key}`}>{priceErrors[key]}</FieldError>
                )}
              </Field>
            );
          })}
          <Field>
            <FieldLabel>计划持有天数</FieldLabel>
            <Input
              aria-label="计划持有天数"
              inputMode="numeric"
              value={draft.expectedHoldingDays ?? ''}
              placeholder="选填"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expectedHoldingDays:
                    event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
            {candidate.input.plan?.expectedHoldingDays != null && (
              <FieldDescription>原计划：{candidate.input.plan.expectedHoldingDays} 天</FieldDescription>
            )}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>草稿说明</FieldLabel>
            <Textarea
              aria-label="草稿说明"
              value={draft.note ?? ''}
              rows={3}
              maxLength={4000}
              placeholder="选填：补充本次复盘需要考虑的假设或备注"
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </Field>
        </FieldGroup>
        {error !== null && <JournalRequestError title="草稿尚未应用" error={error} />}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => void requestClose(false)}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDraft({});
              setPriceErrors({});
              setError(null);
            }}
          >
            使用原计划
          </Button>
          <Button onClick={apply}>应用草稿</Button>
        </div>
    </div>
  );
  if (inline) {
    return (
      <section
        className="flex min-w-0 flex-col border-t pt-4"
        aria-label="本次分析草稿"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          void requestClose(false);
        }}
      >
        {editor}
      </section>
    );
  }
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent className="overflow-y-auto">{editor}</SheetContent>
    </Sheet>
  );
}
