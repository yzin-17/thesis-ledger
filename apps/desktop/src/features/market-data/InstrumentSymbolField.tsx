import { useState } from 'react';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { InstrumentSearchCombobox } from './InstrumentSearchCombobox.js';
import { useInstrumentPickerSearch } from './instrument-picker.queries.js';

export type InstrumentSymbolFieldProps = {
  value: string;
  onChange: (symbol: string) => void;
  onSelect?: (item: InstrumentSearchResult) => void;
  markets?: readonly string[];
  instrumentTypes?: readonly string[];
  accepts?: (item: InstrumentSearchResult) => boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
};

/** Editable code plus real directory suggestions; business validation stays with the consumer. */
export function InstrumentSymbolField({
  value,
  onChange,
  onSelect,
  markets,
  instrumentTypes,
  accepts,
  disabled = false,
  id,
  'aria-label': label,
  'aria-invalid': invalid,
}: InstrumentSymbolFieldProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<InstrumentSearchResult | null>(null);
  const search = useInstrumentPickerSearch(value, open && !disabled);
  const items = (search.isError ? [] : (search.data ?? [])).filter(
    (item) =>
      item.active &&
      (!markets || markets.includes(item.market)) &&
      (!instrumentTypes || instrumentTypes.includes(item.instrumentType)) &&
      (!accepts || accepts(item)),
  );
  let status = '';
  if (!value.trim()) status = '输入代码或名称搜索';
  else if (search.current && search.isError) status = '标的目录暂时无法读取，请重试';
  else if (!search.busy && search.isSuccess && !items.length) status = '未找到符合当前条件的标的';
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <InstrumentSearchCombobox
        input={value}
        items={items}
        busy={search.busy}
        status={status}
        onRetry={search.current && search.isError ? () => void search.refetch() : undefined}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        id={id}
        label={label}
        invalid={invalid}
        onInputChange={(next) => {
          setSelected(null);
          onChange(next);
        }}
        onSelect={(item) => {
          setSelected(item);
          onChange(item.symbol);
          onSelect?.(item);
          setOpen(false);
        }}
      />
      {selected?.symbol === value && (
        <span className="text-xs text-muted-foreground">{selected.displayName}</span>
      )}
    </div>
  );
}
