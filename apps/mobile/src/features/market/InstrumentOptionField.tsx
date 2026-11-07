import { useState } from 'react';
import { Choices, Copy, Field } from '../../components/MobilePrimitives';

/** Search only the caller's holdings/options; preserve account and availability boundaries. */
export function InstrumentOptionField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const matches = options.filter((item) =>
    `${item.value} ${item.label}`.toLocaleLowerCase().includes(needle),
  );
  return (
    <>
      <Field label={`搜索${label}`} value={query} onChange={setQuery} editable={!disabled} />
      <Choices
        label={label}
        value={value}
        options={matches}
        onChange={onChange}
        disabled={disabled}
      />
      {!matches.length && <Copy muted>没有符合条件的标的</Copy>}
    </>
  );
}
