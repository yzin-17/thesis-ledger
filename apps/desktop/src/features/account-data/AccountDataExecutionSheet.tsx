import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { LoaderCircle } from 'lucide-react';
import { ExecutionCharges } from './ExecutionCharges.js';
import { ExecutionTradeFields } from './ExecutionTradeFields.js';
import type { ExecutionSheetCloseOptions } from './use-execution-form.js';
import { useExecutionForm } from './use-execution-form.js';
export type { ExecutionSheetCloseOptions } from './use-execution-form.js';

import { type Account } from '../portfolio/portfolio.types.js';
import { ExecutionRuleReference } from './ExecutionRuleReference.js';
import { executionSubmitLabel } from './account-data.helpers.js';
import type { ExecutionEvent } from './account-data.types.js';

export function ExecutionFormSheet(props: {
  account: Account;
  open: boolean;
  editingEvent: ExecutionEvent | null;
  ledgerRevision: string;
  onOpenChange: (open: boolean, options?: ExecutionSheetCloseOptions) => void;
  onDirtyChange: (dirty: boolean) => void;
  resolveInstrumentName?: (symbol: string) => string | undefined;
}) {
  const control = useExecutionForm(props);
  const {
    open,
    close,
    editingEvent,
    submit,
    selectedInstrument,
    draft,
    updateDraft,
    formError,
    submitting,
  } = control;

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" size="form" className="h-[100dvh] min-h-0 overflow-hidden p-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
          <SheetHeader>
            <SheetTitle>{editingEvent ? '更正成交' : '录入成交'}</SheetTitle>
            <SheetDescription>
              {editingEvent
                ? '保存后保留原记录，可在历史中查看更正原因。'
                : '记录实际发生的买入或卖出。'}
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
            onSubmit={(event) => void submit(event)}
          >
            <div className="-mx-1 -my-1 min-h-0 flex-1 overflow-y-auto scroll-p-2 px-1 py-1">
              <div className="flex flex-col gap-5">
                <ExecutionTradeFields control={control} />
                <ExecutionRuleReference symbol={selectedInstrument?.symbol ?? draft.symbol} />
                <ExecutionCharges control={control} />
                <FieldGroup>
                  {editingEvent && (
                    <Field>
                      <FieldLabel htmlFor="execution-reason">更正原因</FieldLabel>
                      <Textarea
                        id="execution-reason"
                        value={draft.reason}
                        onChange={(event) => updateDraft('reason', event.target.value)}
                        placeholder="说明为什么需要生成新的成交版本"
                        required
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="execution-note">备注（可选）</FieldLabel>
                    <Textarea
                      id="execution-note"
                      value={draft.note}
                      onChange={(event) => updateDraft('note', event.target.value)}
                      placeholder="记录来源、人工判断或其他上下文"
                    />
                  </Field>
                </FieldGroup>
                {formError && (
                  <Field invalid>
                    <FieldError>{formError}</FieldError>
                  </Field>
                )}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                {executionSubmitLabel(submitting, Boolean(editingEvent))}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
