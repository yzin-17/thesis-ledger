import {
  marketReferenceCatalog,
  marketReferenceCodeInput,
  marketReferenceAssetType,
  type MarketReferenceDataset,
} from '@thesis-ledger/schemas';
import { Copy } from '../../components/MobilePrimitives';
import { InstrumentSymbolField } from '../market/InstrumentSymbolField';
import { MarketReferenceContractField } from './MarketReferenceContractField';

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
    <>
      <InstrumentSymbolField
        label={input.label}
        value={value}
        onChange={onChange}
        instrumentTypes={[scope === 'etf' ? 'ETF' : marketReferenceAssetType(dataset)]}
      />
      <Copy>{input.example}</Copy>
    </>
  );
}
