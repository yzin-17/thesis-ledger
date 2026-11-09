import { useState } from 'react';
import {
  strategyInstrumentFromDirectory,
  strategyInstrumentSearchScopes,
  withStrategyExecutionInstrument,
  type StrategyInstrumentMode,
} from '@thesis-ledger/domain';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { InstrumentSymbolField } from '../market-data/InstrumentSymbolField.js';
import { strategyAssetTypeLabel, strategyMarketLabel } from './strategy-display-labels.js';
import type { StrategySchema } from './strategy.types.js';

export function StrategyExecutionInstrumentField({
  schema,
  onChange,
}: {
  schema: StrategySchema;
  onChange: (schema: StrategySchema) => void;
}) {
  const [search, setSearch] = useState<string | null>(null);
  const instrument = schema.executionInstrument as Record<string, unknown> | undefined;
  const execution = schema.execution as Record<string, unknown> | undefined;
  const mode: StrategyInstrumentMode = execution?.mode === 'nav' ? 'nav' : 'exchange';
  const scope = strategyInstrumentSearchScopes[mode];
  const symbol = typeof instrument?.symbol === 'string' ? instrument.symbol : '';
  return (
    <Field className="min-w-0 sm:col-span-2">
      <FieldLabel htmlFor="strategy-v2-symbol">
        执行标的
        {symbol && (
          <span className="text-xs font-normal text-muted-foreground" role="status">
            {strategyMarketLabel(instrument?.market)} ·{' '}
            {strategyAssetTypeLabel(instrument?.assetType)}
          </span>
        )}
      </FieldLabel>
      <InstrumentSymbolField
        id="strategy-v2-symbol"
        aria-label="执行标的"
        markets={scope.markets}
        instrumentTypes={scope.instrumentTypes}
        value={search ?? symbol}
        onChange={(value) => {
          setSearch(value);
          if (symbol && value !== symbol) onChange(withStrategyExecutionInstrument(schema, null));
        }}
        onSelect={(item) => {
          const selected = strategyInstrumentFromDirectory(item, mode);
          if (!selected) return;
          setSearch(null);
          onChange(withStrategyExecutionInstrument(schema, selected));
        }}
      />
      {!symbol && <FieldDescription>选择搜索结果后自动识别市场和资产类型。</FieldDescription>}
    </Field>
  );
}
