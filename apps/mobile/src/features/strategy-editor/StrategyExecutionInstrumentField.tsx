import { useState } from 'react';
import {
  strategyInstrumentFromDirectory,
  strategyInstrumentSearchScopes,
  withStrategyExecutionInstrument,
  type StrategyInstrumentMode,
} from '@thesis-ledger/domain';
import { Copy } from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';

const marketLabels: Record<string, string> = { CN: '中国内地', HK: '香港', US: '美国' };
const assetLabels: Record<string, string> = { stock: '股票', etf: 'ETF', fund: '基金' };

export function StrategyExecutionInstrumentField({
  definition,
  locked,
  onChange,
}: {
  definition: Record<string, unknown>;
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
          onChange(withStrategyExecutionInstrument(definition, selected));
        }}
      />
      <Copy>
        {symbol
          ? `${marketLabels[String(instrument?.market)] ?? '未知市场'} · ${assetLabels[String(instrument?.assetType)] ?? '未知类型'}`
          : '选择搜索结果后自动识别市场和资产类型。'}
      </Copy>
    </>
  );
}
