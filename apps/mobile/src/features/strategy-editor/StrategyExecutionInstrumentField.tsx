import { useState } from 'react';
import type { InstrumentDirectory, InstrumentSearchResult } from '@thesis-ledger/schemas';
import {
  strategyInstrumentFromDirectory,
  strategyInstrumentSearchScopes,
  withStrategyExecutionInstrument,
  type StrategyInstrumentMode,
} from '@thesis-ledger/domain';
import { Copy } from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';

export function StrategyExecutionInstrumentField({
  definition,
  instrumentDirectory,
  onSelect,
  locked,
  onChange,
}: {
  definition: Record<string, unknown>;
  instrumentDirectory?: InstrumentDirectory | undefined;
  onSelect?: (item: InstrumentSearchResult) => void;
  locked: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState<string | null>(null);
  const instrument = definition.executionInstrument as Record<string, unknown> | undefined;
  const execution = definition.execution as Record<string, unknown> | undefined;
  const mode: StrategyInstrumentMode = execution?.mode === 'nav' ? 'nav' : 'exchange';
  const scope = strategyInstrumentSearchScopes[mode];
  const symbol = typeof instrument?.symbol === 'string' ? instrument.symbol : '';
  return (
    <>
      <InstrumentPicker
        purpose="browse"
        label="执行标的"
        value={search ?? symbol}
        displayName={instrumentDirectory?.items.find((item) => item.symbol === symbol)?.displayName}
        editable={!locked}
        markets={scope.markets}
        instrumentTypes={scope.instrumentTypes}
        accepts={(item) => strategyInstrumentFromDirectory(item, mode) !== null}
        onInputChange={(value) => {
          setSearch(value);
          if (symbol && value !== symbol)
            onChange(withStrategyExecutionInstrument(definition, null));
        }}
        onConfirmed={(item) => {
          const selected = strategyInstrumentFromDirectory(item, mode);
          if (!selected) return;
          setSearch(null);
          onSelect?.(item);
          onChange(withStrategyExecutionInstrument(definition, selected));
        }}
      />
      {!symbol && <Copy>选择搜索结果后自动识别市场和资产类型。</Copy>}
    </>
  );
}
