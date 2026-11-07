import {
  marketReferenceCatalog,
  marketReferenceCodeInput,
  marketReferenceAssetType,
  type MarketReferenceDataset,
} from '@thesis-ledger/schemas';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { InstrumentSymbolField } from './InstrumentSymbolField.js';
import { MarketReferenceContractField } from './MarketReferenceContractField.js';

export function MarketReferenceCodeField({
  dataset,
  value,
  onChange,
}: {
  dataset: MarketReferenceDataset;
  value: string;
  onChange: (value: string) => void;
}) {
  const scope = marketReferenceCatalog[dataset].scope;
  if (scope === 'future' || scope === 'option')
    return (
      <MarketReferenceContractField key={scope} kind={scope} value={value} onChange={onChange} />
    );
  const input = marketReferenceCodeInput(dataset);
  if (!input) return null;
  return (
    <Field>
      <FieldLabel htmlFor="reference-symbol">{input.label}</FieldLabel>
      <InstrumentSymbolField
        id="reference-symbol"
        aria-label={input.label}
        value={value}
        onChange={onChange}
        instrumentTypes={[scope === 'etf' ? 'ETF' : marketReferenceAssetType(dataset)]}
      />
      <FieldDescription>{input.example}</FieldDescription>
    </Field>
  );
}
