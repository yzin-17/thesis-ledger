import { useState } from 'react';
import type { InstrumentSearchResult, OptimizationDiscoveryScope } from '@thesis-ledger/schemas';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InstrumentSymbolField } from '../market-data/InstrumentSymbolField.js';

const marketLabels = { CN: '中国内地', HK: '香港', US: '美国' } as const;
const assetLabels = { stock: '股票', etf: 'ETF', fund: '基金 NAV' } as const;
type DiscoveryInstrument = OptimizationDiscoveryScope['executionInstrument'];

export function discoveryInstrumentFromDirectory(
  item: InstrumentSearchResult | null,
): DiscoveryInstrument | null {
  if (!item?.active || !item.symbol.trim()) return null;
  let market: DiscoveryInstrument['market'];
  if (['CN', 'SH', 'SZ', 'BJ', 'OF'].includes(item.market)) market = 'CN';
  else if (item.market === 'HK' || item.market === 'US') market = item.market;
  else return null;
  let assetType: DiscoveryInstrument['assetType'];
  if (item.instrumentType === 'STOCK') assetType = 'stock';
  else if (item.instrumentType === 'ETF') assetType = 'etf';
  else if (item.instrumentType === 'MUTUAL_FUND' && market === 'CN') assetType = 'fund';
  else return null;
  return { symbol: item.symbol, market, assetType };
}

export function useExperimentDiscoveryInstrument() {
  const [symbol, setSymbol] = useState('');
  const [selected, setSelected] = useState<InstrumentSearchResult | null>(null);
  const instrument = discoveryInstrumentFromDirectory(selected);
  return {
    symbol, selected, instrument,
    changeSymbol(value: string) {
      setSymbol(value);
      setSelected(null);
    },
    select(item: InstrumentSearchResult) {
      setSymbol(item.symbol);
      setSelected(item);
    },
  };
}

export function ExperimentDiscoveryInstrumentField({
  discovery,
  error,
  onChange,
}: {
  discovery: ReturnType<typeof useExperimentDiscoveryInstrument>;
  error?: string | undefined;
  onChange?: (() => void) | undefined;
}) {
  const { instrument } = discovery;
  return (
    <FieldGroup>
      <Field invalid={Boolean(error)}>
        <FieldLabel>探索标的</FieldLabel>
        <InstrumentSymbolField
          aria-label="探索标的"
          aria-invalid={Boolean(error)}
          value={discovery.symbol}
          displayName={discovery.selected?.displayName}
          markets={['SH', 'SZ', 'BJ', 'OF', 'CN', 'HK', 'US']}
          instrumentTypes={['STOCK', 'ETF', 'MUTUAL_FUND']}
          accepts={(item) => discoveryInstrumentFromDirectory(item) !== null}
          onChange={(value) => { discovery.changeSymbol(value); onChange?.(); }}
          onSelect={(item) => { discovery.select(item); onChange?.(); }}
        />
        {error ? <FieldError>{error}</FieldError> : (
          <FieldDescription>选择标的后自动读取市场和资产类型。</FieldDescription>
        )}
      </Field>
      <dl aria-label="标的信息" className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">市场</dt>
          <dd>{instrument ? marketLabels[instrument.market] : '待选择标的'}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">资产类型</dt>
          <dd>{instrument ? assetLabels[instrument.assetType] : '待选择标的'}</dd>
        </div>
      </dl>
    </FieldGroup>
  );
}
