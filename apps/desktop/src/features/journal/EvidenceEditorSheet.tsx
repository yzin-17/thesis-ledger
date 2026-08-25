import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ReviewEvidenceDraft } from './journal.types.js';

type EvidenceField = keyof ReviewEvidenceDraft;

const fields: Array<{ key: EvidenceField; label: string; description: string }> = [
  { key: 'plannedEntry', label: '计划入场价', description: '交易计划中的预期入场价格。' },
  { key: 'plannedExit', label: '计划退出价', description: '交易计划中的预期退出价格。' },
  { key: 'plannedStop', label: '计划止损价', description: '用于止损偏差和反事实比较。' },
  { key: 'plannedHoldingDays', label: '计划持有天数', description: '计划中的持仓周期。' },
  { key: 'targetWeight', label: '目标仓位', description: '使用 0 到 1 的比例，例如 0.1。' },
  { key: 'peakWeight', label: '最高仓位', description: '使用 0 到 1 的比例，例如 0.18。' },
];

const toInputValue = (value: number | undefined) => (value === undefined ? '' : String(value));

export function EvidenceEditorSheet({
  candidate,
  value,
  open,
  onOpenChange,
  onSave,
}: {
  candidate: { symbol: string };
  value: ReviewEvidenceDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: ReviewEvidenceDraft) => void;
}) {
  const [draft, setDraft] = useState<Record<EvidenceField, string>>(
    () =>
      Object.fromEntries(fields.map(({ key }) => [key, toInputValue(value[key])])) as Record<
        EvidenceField,
        string
      >,
  );
  const [errors, setErrors] = useState<Partial<Record<EvidenceField, string>>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(
      Object.fromEntries(fields.map(({ key }) => [key, toInputValue(value[key])])) as Record<
        EvidenceField,
        string
      >,
    );
    setErrors({});
  }, [open, value]);

  const updateField = (key: EvidenceField, next: string) => {
    setDraft((current) => ({ ...current, [key]: next }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = () => {
    const next: ReviewEvidenceDraft = {};
    const nextErrors: Partial<Record<EvidenceField, string>> = {};
    for (const { key } of fields) {
      const raw = draft[key].trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        nextErrors[key] = '请输入有效数字。';
        continue;
      }
      next[key] = parsed;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSave(next);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(100vw,32rem)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>补充本次复盘证据</SheetTitle>
          <SheetDescription>
            {candidate.symbol} 的临时补充只参与本次计算，不会回写 TradePlan、Journal 或 Ledger。
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <FieldGroup>
            {fields.map(({ key, label, description }) => (
              <Field key={key} invalid={Boolean(errors[key])}>
                <FieldLabel htmlFor={`review-evidence-${key}`}>{label}</FieldLabel>
                <Input
                  id={`review-evidence-${key}`}
                  inputMode="decimal"
                  value={draft[key]}
                  onChange={(event) => updateField(key, event.target.value)}
                  aria-invalid={Boolean(errors[key])}
                />
                <FieldDescription>{description}</FieldDescription>
                {errors[key] && <FieldError>{errors[key]}</FieldError>}
              </Field>
            ))}
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={save}>
            保存本次证据
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
