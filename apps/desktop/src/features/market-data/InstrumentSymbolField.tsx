import { useState } from 'react';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { InstrumentSearchCombobox } from './InstrumentSearchCombobox.js';
import { useInstrumentPickerSearch } from './instrument-picker.queries.js';

export type InstrumentSymbolFieldProps = {
  value: string;
  displayName?: string | undefined;
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
  displayName,
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
  const status = instrumentSearchStatus(value, search, items.length);
  const selection =
    selected?.symbol === value ? selected : items.find((item) => item.symbol === value);
  const name = selection?.displayName ?? displayName;
  let display = value;
  if (!open && name && name !== value) {
    display = `${name} · ${value}`;
  }
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <InstrumentSearchCombobox
        input={display}
        placeholder=""
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
    </div>
  );
}

function instrumentSearchStatus(
  value: string,
  search: Pick<
    ReturnType<typeof useInstrumentPickerSearch>,
    'current' | 'isError' | 'busy' | 'isSuccess'
  >,
  itemCount: number,
) {
  let status = '';
  if (value.trim() && search.current && search.isError) status = '标的目录暂时无法读取，请重试';
  else if (value.trim() && !search.busy && search.isSuccess && !itemCount)
    status = '未找到符合当前条件的标的';
  return status;
}
