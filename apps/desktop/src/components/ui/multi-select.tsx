import { useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent,
  ComboboxEmpty, ComboboxItem, ComboboxList, ComboboxValue, useComboboxAnchor,
} from './combobox';

export type MultiSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
};

export function MultiSelect<T extends string>({
  options, value, onValueChange, label, id, placeholder = '搜索并选择',
  disabled = false, maxSelected, className,
}: {
  options: readonly MultiSelectOption<T>[];
  value: T[];
  onValueChange: (value: T[]) => void;
  label: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  maxSelected?: number;
  className?: string;
}) {
  const anchor = useComboboxAnchor();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const needle = input.trim().toLocaleLowerCase();
  const items = options.filter((option) => `${option.label} ${option.value}`.toLocaleLowerCase().includes(needle));
  const optionLabel = (item: T) => options.find((option) => option.value === item)?.label ?? item;
  return <Combobox
    multiple autoHighlight disabled={disabled} filter={null}
    items={items.map((option) => option.value)} value={value}
    inputValue={input} onInputValueChange={(text, details) => {
      setInput(text);
      if (details.reason === 'input-change') setOpen(true);
    }}
    open={open && !disabled} onOpenChange={setOpen}
    onValueChange={onValueChange} itemToStringLabel={optionLabel}
  >
    <ComboboxChips ref={anchor} className={cn('relative min-w-0 w-full pr-9 has-data-[slot=combobox-chip]:pr-9', className)}>
      <ComboboxValue>
        {(values: T[]) => <>
          {values.map((item) => <ComboboxChip key={item} removeLabel={`移除 ${optionLabel(item)}`}>
            <span className="min-w-0 truncate" title={optionLabel(item)}>{optionLabel(item)}</span>
          </ComboboxChip>)}
          <ComboboxChipsInput id={id} aria-label={label} placeholder={placeholder}
            disabled={disabled} className="min-w-0 basis-28"
            onFocus={() => setOpen(true)} onClick={() => setOpen(true)} />
        </>}
      </ComboboxValue>
      <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </ComboboxChips>
    <ComboboxContent anchor={anchor} positionMethod="fixed" className="min-w-0">
      <ComboboxEmpty>没有匹配的选项</ComboboxEmpty>
      <ComboboxList>
        {(item: T) => {
          const option = options.find((option) => option.value === item);
          if (!option) return null;
          const limited = maxSelected !== undefined && value.length >= maxSelected && !value.includes(item);
          return <ComboboxItem key={item} value={item} disabled={option.disabled || limited}>
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate" title={option.label}>{option.label}</span>
              {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
            </span>
          </ComboboxItem>;
        }}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>;
}
