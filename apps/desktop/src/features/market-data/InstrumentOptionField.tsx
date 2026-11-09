import { useState } from 'react';
import { InstrumentSearchCombobox } from './InstrumentSearchCombobox.js';

/** Search a caller-owned set (holdings, trades); never broaden to the global directory. */
export function InstrumentOptionField({
  options,
  value,
  onChange,
  label,
  disabled = false,
  id,
  invalid = false,
  status,
  clearValue = '',
}: {
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  status?: string;
  clearValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const selected = options.find((item) => item.value === value);
  const needle = input.trim().toLocaleLowerCase();
  const items = options
    .filter((item) => `${item.label} ${item.value}`.toLocaleLowerCase().includes(needle))
    .map((item) => ({ id: item.value, symbol: item.value, displayName: item.label, market: '' }));
  return (
    <InstrumentSearchCombobox
      input={status || (open ? input : (selected?.label ?? value))}
      items={items}
      busy={false}
      status={items.length ? '' : '没有符合条件的标的'}
      label={label}
      {...(id ? { id } : {})}
      invalid={invalid}
      disabled={disabled}
      clearable={value !== clearValue || (open && Boolean(input))}
      onClear={() => {
        onChange(clearValue);
        setInput('');
        setOpen(false);
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInput('');
      }}
      onInputChange={(next) => {
        setInput(next);
        if (!next) onChange('');
      }}
      onSelect={(item) => {
        onChange(item.id);
        setOpen(false);
      }}
    />
  );
}
