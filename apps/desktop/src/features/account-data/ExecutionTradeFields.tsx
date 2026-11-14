import { DateInput } from '@/components/ui/date-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { InstrumentCombobox } from '../portfolio/InstrumentCombobox.js';
import { InstrumentSummary } from '../portfolio/InstrumentSummary.js';
import { currencies, currencyLabel, isCurrency } from './account-data.helpers.js';
import type { ExecutionSide, TimePrecision } from './account-data.types.js';
import type { useExecutionForm } from './use-execution-form.js';

function ExecutionInstrumentField({ control }: { control: ReturnType<typeof useExecutionForm> }) {
  return (
    <>
      <Field>
        <FieldLabel>标的</FieldLabel>
        {control.editingEvent ? (
          <InstrumentSummary
            className="min-h-0 rounded-none border-0 bg-transparent p-0"
            symbol={control.editingEvent.payload.symbol}
            name={control.resolveInstrumentName?.(control.editingEvent.payload.symbol)}
          />
        ) : (
          <InstrumentCombobox
            manualEntry={control.manualInstrumentEntry}
            open={control.instrumentOpen}
            query={control.instrumentQuery}
            results={control.instrumentSearch.results}
            searchState={control.instrumentSearch.state}
            selectedInstrument={control.selectedInstrument}
            busy={control.instrumentSearch.busy}
            onClearSelection={() => {
              control.setSelectedInstrument(null);
              control.setInstrumentQuery('');
              control.updateDirty(true);
            }}
            onManualEntry={() => {
              control.setManualInstrumentEntry(true);
              control.setInstrumentOpen(false);
              control.updateDirty(true);
            }}
            onOpenChange={control.setInstrumentOpen}
            onQueryChange={(value) => {
              control.setInstrumentQuery(value.toUpperCase());
              control.setSelectedInstrument(null);
              control.updateDirty(true);
            }}
            onSelect={(instrument) => void control.confirmInstrument(instrument)}
            onStartSearch={() => {
              if (control.instrumentQuery.trim()) control.setInstrumentOpen(true);
            }}
          />
        )}
        {control.editingEvent && (
          <input type="hidden" name="symbol" value={control.editingEvent.payload.symbol} />
        )}
      </Field>
    </>
  );
}

function ExecutionTradeFields({ control }: { control: ReturnType<typeof useExecutionForm> }) {
  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="execution-account">账户</FieldLabel>
          <div id="execution-account" className="text-sm text-foreground">
            <span className="whitespace-normal break-words">{control.accountSummary}</span>
          </div>
        </Field>
        <ExecutionInstrumentField control={control} />
        <Field>
          <FieldLabel>方向</FieldLabel>
          <ToggleGroup
            value={[control.draft.side]}
            aria-label="成交方向"
            onValueChange={(value) => {
              const next = value[0] as ExecutionSide | undefined;
              if (next) control.updateDraft('side', next);
            }}
          >
            <ToggleGroupItem value="BUY">买入</ToggleGroupItem>
            <ToggleGroupItem value="SELL">卖出</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="execution-quantity">数量</FieldLabel>
            <DecimalInput
              fractionDigits={8}
              id="execution-quantity"
              inputMode="decimal"
              value={control.draft.quantity}
              onChange={(event) => control.updateDraft('quantity', event.target.value)}
              placeholder="例如 100"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="execution-price">价格</FieldLabel>
            <DecimalInput
              id="execution-price"
              inputMode="decimal"
              value={control.draft.price}
              onChange={(event) => control.updateDraft('price', event.target.value)}
              placeholder="例如 12.3456"
              required
            />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="execution-currency">成交币种</FieldLabel>
          <Select
            value={control.draft.currency}
            onValueChange={(value) => {
              if (isCurrency(value)) control.updateDraft('currency', value);
            }}
          >
            <SelectTrigger id="execution-currency" className="w-full">
              <SelectValue>{currencyLabel(control.draft.currency)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currencyLabel(currency)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)]">
          <Field>
            <FieldLabel htmlFor="execution-occurred-at">成交时间</FieldLabel>
            <DateInput
              id="execution-occurred-at"
              type={control.draft.timePrecision === 'DATE' ? 'date' : 'datetime-local'}
              value={control.draft.occurredAt}
              onChange={(event) => control.updateDraft('occurredAt', event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel>时间精度</FieldLabel>
            <Select
              value={control.draft.timePrecision}
              onValueChange={(value) => {
                const next = value as TimePrecision;
                if (next === control.draft.timePrecision) return;
                control.updateDraft('timePrecision', next);
                if (next === 'DATE')
                  control.updateDraft('occurredAt', control.draft.occurredAt.slice(0, 10));
                else control.updateDraft('occurredAt', '');
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {control.draft.timePrecision === 'DATE' ? '仅日期' : '精确时间'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="INSTANT">精确时间</SelectItem>
                  <SelectItem value="DATE">仅日期</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="execution-settled-at">结算时间（可选）</FieldLabel>
          <DateInput
            id="execution-settled-at"
            type="datetime-local"
            value={control.draft.settledAt}
            onChange={(event) => control.updateDraft('settledAt', event.target.value)}
          />
          <FieldDescription>未来时间会先进入待结算资金。</FieldDescription>
        </Field>
      </FieldGroup>
    </>
  );
}

export { ExecutionTradeFields };
