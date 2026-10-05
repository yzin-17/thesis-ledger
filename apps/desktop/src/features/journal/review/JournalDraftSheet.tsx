import { useState } from 'react';
import {
  journalAnalysisDraftSchema,
  type JournalAnalysisDraft,
  type JournalReviewCandidateContract,
} from '@thesis-ledger/schemas';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { JournalRequestError } from './JournalReviewFeedback.js';

const prices = {
  plannedEntry: '计划入场价',
  plannedExit: '计划退出价',
  stopLoss: '计划止损价',
} as const;
export function JournalDraftSheet({
  candidate,
  value,
  onApply,
  open,
  onOpenChange,
}: {
  candidate: JournalReviewCandidateContract;
  value: JournalAnalysisDraft;
  onApply: (value: JournalAnalysisDraft) => void;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<unknown>(null);
  const apply = () => {
    const parsed = journalAnalysisDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(new Error('请填写有效的十进制价格和非负整数天数'));
      return;
    }
    onApply(parsed.data);
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>本次分析草稿</SheetTitle>
          <SheetDescription>
            原始计划保持原值。留空并修改表示本次清除；未修改的字段继续使用原计划。
          </SheetDescription>
        </SheetHeader>
        <FieldGroup>
          {Object.entries(prices).map(([rawKey, label]) => {
            const key = rawKey as keyof typeof prices;
            return (
              <Field key={key}>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  aria-label={label}
                  inputMode="decimal"
                  value={draft[key] ?? ''}
                  placeholder={candidate.input.plan?.[key] ?? '未提供'}
                  onChange={(event) => {
                    setError(null);
                    setDraft({ ...draft, [key]: event.target.value || null });
                  }}
                />
                <FieldDescription>
                  原计划：{candidate.input.plan?.[key] ?? '未提供'}
                </FieldDescription>
              </Field>
            );
          })}
          <Field>
            <FieldLabel>计划持有天数</FieldLabel>
            <Input
              aria-label="计划持有天数"
              inputMode="numeric"
              value={draft.expectedHoldingDays ?? ''}
              placeholder={String(candidate.input.plan?.expectedHoldingDays ?? '未提供')}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expectedHoldingDays:
                    event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
            <FieldDescription>
              原计划：{candidate.input.plan?.expectedHoldingDays ?? '未提供'} 天
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>草稿说明</FieldLabel>
            <Textarea
              aria-label="草稿说明"
              value={draft.note ?? ''}
              maxLength={4000}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </Field>
        </FieldGroup>
        {error !== null && <JournalRequestError title="草稿尚未应用" error={error} />}
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="outline" onClick={() => setDraft({})}>
            使用原计划
          </Button>
          <Button onClick={apply}>应用草稿</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
