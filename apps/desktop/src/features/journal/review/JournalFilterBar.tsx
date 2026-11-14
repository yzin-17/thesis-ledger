import { Field, FieldLabel } from '@/components/ui/field';
import { FilterActions, FilterBar } from '@/components/ui/filter-bar';
import { InstrumentSymbolField } from '../../market-data/InstrumentSymbolField.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { JournalWindowTimeInput } from './JournalWindowTimeInput.js';

export type JournalFilterDraft = { symbol: string; start: string; end: string };

export function JournalFilterBar({
  draft,
  onChange,
  onApply,
  onReset,
  hasConditions,
  error,
}: {
  draft: JournalFilterDraft;
  onChange: (next: JournalFilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  hasConditions: boolean;
  error: Error | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FilterBar className="sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field className="min-w-0">
          <FieldLabel>标的筛选</FieldLabel>
          <InstrumentSymbolField
            aria-label="复盘标的筛选"
            value={draft.symbol}
            onChange={(symbol) => onChange({ ...draft, symbol })}
          />
        </Field>
        <Field className="min-w-0">
          <FieldLabel>开始时间</FieldLabel>
          <JournalWindowTimeInput
            aria-label="候选开始时间"
            value={draft.start}
            onValueChange={(start) => onChange({ ...draft, start })}
          />
        </Field>
        <Field className="min-w-0">
          <FieldLabel>结束时间</FieldLabel>
          <JournalWindowTimeInput
            aria-label="候选结束时间"
            value={draft.end}
            onValueChange={(end) => onChange({ ...draft, end })}
          />
        </Field>
        <FilterActions
          className="sm:col-span-2 xl:col-span-1"
          hasConditions={hasConditions}
          onApply={onApply}
          onReset={onReset}
        />
      </FilterBar>
      {error && <JournalRequestError title="筛选条件无效" error={error} />}
    </div>
  );
}
