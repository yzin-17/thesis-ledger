import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { InstrumentPicker } from './InstrumentPicker';

/** A code field uses the same directory search, selection and error recovery as other pickers. */
export function InstrumentSymbolField({
  value,
  onChange,
  label,
  editable = true,
  markets,
  instrumentTypes,
}: {
  value: string;
  onChange: (symbol: string) => void;
  label: string;
  editable?: boolean;
  markets?: readonly string[];
  instrumentTypes?: readonly string[];
}) {
  return (
    <InstrumentPicker
      purpose="browse"
      value={value}
      onInputChange={onChange}
      label={label}
      editable={editable}
      {...(markets ? { markets } : {})}
      {...(instrumentTypes ? { instrumentTypes } : {})}
      onConfirmed={(item: InstrumentSearchResult) => onChange(item.symbol)}
    />
  );
}
