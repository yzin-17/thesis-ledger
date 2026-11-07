import { useState } from 'react';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { InstrumentSymbolField } from '../market-data/InstrumentSymbolField.js';
import type { InstrumentLookup } from '../portfolio/portfolio.types.js';

/** Directory identity only; never confirms or creates a holding. */
export function ResearchInstrumentPicker({ value, onChange }: {
  value: InstrumentLookup | null;
  onChange: (value: InstrumentLookup | null) => void;
}) {
  const [input, setInput] = useState('');
  return (
    <Field>
      <FieldLabel>独立研究标的</FieldLabel>
      <InstrumentSymbolField
        aria-label="研究标的"
        value={value?.symbol ?? input}
        instrumentTypes={['STOCK', 'ETF', 'INDEX', 'MUTUAL_FUND']}
        onChange={(next) => {
          setInput(next);
          if (value && value.symbol !== next) onChange(null);
        }}
        onSelect={onChange}
      />
      <FieldDescription>
        {value ? `${value.displayName} · ${value.symbol}。本范围只使用公开资料。`
          : '可选择股票、交易所基金、指数和有资格的场外基金，不需要创建持仓。'}
      </FieldDescription>
    </Field>
  );
}
