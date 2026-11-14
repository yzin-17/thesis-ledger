import { useRef, useState } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';
import { Action, Copy } from './MobilePrimitives';
import { MultiSelectField } from './MultiSelectField';

export type MultiSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function MultiSelect<T extends string>({
  label, options, value, onChange, disabled = false, maxSelected, allowCustom = false,
}: {
  label: string;
  options: readonly MultiSelectOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
  maxSelected?: number;
  allowCustom?: boolean;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const allOptions: readonly MultiSelectOption<T>[] = [...options,
    ...value.filter((item) => !options.some((option) => option.value === item)).map((item) => ({ value: item, label: item })),
  ];
  const needle = input.trim().toLocaleLowerCase();
  const items = allOptions.filter((item) => `${item.label} ${item.value}`.toLocaleLowerCase().includes(needle));
  const limited = maxSelected !== undefined && value.length >= maxSelected;
  const change = (next: T[]) => {
    if (disabled) return;
    onChange(next);
    setInput('');
    inputRef.current?.focus();
    setOpen(false);
  };
  const custom = input.trim();
  const canCreate = allowCustom && Boolean(custom) && !limited &&
    !allOptions.some((item) => item.value === custom) && !value.includes(custom as T);
  return <View style={{ gap: 8 }}>
    <MultiSelectField label={label} value={input} editable={!disabled} inputRef={inputRef}
      selected={value.map((item) => ({ id: item, label: options.find((option) => option.value === item)?.label ?? item }))}
      onChange={(text) => { setInput(text); setOpen(true); }} onFocus={() => setOpen(true)}
      onRemove={(item) => change(value.filter((current) => current !== item))}
      onSubmit={() => { if (canCreate) change([...value, custom as T]); }} />
    {open && !disabled && <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <View style={{ gap: 8 }}>
        {items.map((item) => {
          const selected = value.includes(item.value);
          return <View key={item.value} style={{ gap: 4 }}>
            {item.description && <Copy muted>{item.description}</Copy>}
            <Action label={`${selected ? '取消选择' : '选择'} ${item.label}`} primary={selected}
              disabled={Boolean(item.disabled) || (limited && !selected)}
              onPress={() => change(selected ? value.filter((current) => current !== item.value) : [...value, item.value])} />
          </View>;
        })}
        {canCreate && <Action label={`添加 ${custom}`} onPress={() => change([...value, custom as T])} />}
        {!items.length && !canCreate && <Copy muted>没有匹配的选项</Copy>}
      </View>
    </ScrollView>}
  </View>;
}
