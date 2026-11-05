import { useState } from 'react';
import type { StrategyDefinitionRead } from '@thesis-ledger/schemas';
import { Choices, Field } from '../../components/MobilePrimitives';
export function StrategyVersionPicker({
  rows,
  value,
  onChange,
  disabled = false,
  label = '策略版本',
}: {
  rows: StrategyDefinitionRead[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [search, setSearch] = useState('');
  const all = rows.flatMap((s) =>
    s.versions
      .filter((v) => v.version > 0)
      .map((v) => ({ value: v.id, label: `${s.name} · 版本 ${v.version}` })),
  );
  const matches = all.filter(
    (v) =>
      v.value === value || `${v.value} ${v.label}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = matches.find((v) => v.value === value);
  const options = matches.slice(0, 20);
  if (selected && !options.includes(selected)) options.unshift(selected);
  return (
    <>
      <Field label={`${label}搜索`} value={search} editable={!disabled} onChange={setSearch} />
      <Choices
        label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={options}
      />
    </>
  );
}
