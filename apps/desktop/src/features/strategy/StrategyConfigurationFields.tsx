import type { InstrumentDirectory, InstrumentSearchResult } from '@thesis-ledger/schemas';
import { strategyEditorTimeframes } from '@thesis-ledger/domain';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StrategyExecutionInstrumentField } from './StrategyExecutionInstrumentField.js';
import { StrategyDefinitionEditorFields } from './StrategyDefinitionEditorFields.js';
import { strategyTimeframeLabel } from './strategy-display-labels.js';
import type { StrategySchema } from './strategy.types.js';

export function StrategyConfigurationFields({ schema, instrumentDirectory, onSelect, onChange }: {
  schema: StrategySchema;
  instrumentDirectory?: InstrumentDirectory | undefined;
  onSelect?: ((item: InstrumentSearchResult) => void) | undefined;
  onChange: (schema: StrategySchema) => void;
}) {
  return <>
    <FieldGroup className="grid min-w-0 gap-3 sm:grid-cols-2">
      <StrategyExecutionInstrumentField schema={schema} instrumentDirectory={instrumentDirectory} onChange={onChange} onSelect={onSelect} />
      <Field>
        <FieldLabel htmlFor="strategy-v2-timeframe">主周期</FieldLabel>
        <Select value={typeof schema.primaryTimeframe === 'string' ? schema.primaryTimeframe : ''} onValueChange={value => { if (value) onChange({ ...schema, primaryTimeframe: value }); }}>
          <SelectTrigger className="w-full" id="strategy-v2-timeframe"><SelectValue>{strategyTimeframeLabel(schema.primaryTimeframe, '未配置')}</SelectValue></SelectTrigger>
          <SelectContent>{strategyEditorTimeframes.map(value => <SelectItem key={value} value={value}>{strategyTimeframeLabel(value)}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
    </FieldGroup>
    <StrategyDefinitionEditorFields schema={schema} instrumentDirectory={instrumentDirectory} onChange={onChange} />
  </>;
}
