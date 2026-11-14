import { StrategyExecutionInstrumentField } from './StrategyExecutionInstrumentField.js';
import type { InstrumentDirectory, InstrumentSearchResult } from '@thesis-ledger/schemas';
import { strategyInstrumentLabel } from './strategy-instrument-display.js';
import { DecimalInput } from '@/components/ui/decimal-input';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StrategySchema } from './strategy.types.js';
import { setStrategyPrimaryTimeframe } from './strategy.schema.js';
import {
  strategyExecutionModeLabel,
  strategyExecutionTimingLabel,
  strategyOrderTypeLabel,
  strategyRiskTypeLabel,
  strategySizingTypeLabel,
  strategySizingTypeOptions,
  strategyTimeframeLabel,
  strategyTimeframeValues,
  strategyTimeInForceLabel,
} from './strategy-display-labels.js';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, fallback = '未配置') =>
  typeof value === 'string' && value.trim() ? value : fallback;

const sizingDescriptions: Record<string, string> = {
  fixedAmount: '按执行标的币种填写投入金额。',
  percentOfEquity: '按 0–1 的比例填写，例如 0.25 表示 25%。',
  targetWeight: '按 0–1 的比例填写，例如 0.25 表示 25%。',
  fixedQuantity: '填写策略定义使用的数量。',
};

export function StrategyConfigurationFields({
  schema,
  instrumentDirectory,
  onSelect,
  onChange,
}: {
  schema: StrategySchema;
  instrumentDirectory?: InstrumentDirectory | undefined;
  onSelect?: ((item: InstrumentSearchResult) => void) | undefined;
  onChange: (schema: StrategySchema) => void;
}) {
  const sizing = asRecord(schema.sizing);
  const execution = asRecord(schema.execution);
  const cost = asRecord(schema.cost);
  const sources = Array.isArray(schema.signalSources) ? schema.signalSources : [];
  const risks = Array.isArray(schema.risk) ? schema.risk : [];
  const update = (key: string, value: unknown) => onChange({ ...schema, [key]: value });
  const updateNested = (key: string, nestedKey: string, value: unknown) =>
    onChange({ ...schema, [key]: { ...asRecord(schema[key]), [nestedKey]: value } });
  const sizingValueKey = () => {
    if (sizing.type === 'fixedAmount') return 'amount';
    if (sizing.type === 'percentOfEquity') return 'percent';
    if (sizing.type === 'fixedQuantity') return 'quantity';
    return 'weight';
  };
  const sizingKey = sizingValueKey();
  return (
    <>
      <FieldSet className="min-w-0 gap-0">
        <FieldLegend className="mb-3 text-base font-semibold">交易标的</FieldLegend>
        <FieldGroup className="grid min-w-0 gap-3 sm:grid-cols-2">
          <StrategyExecutionInstrumentField schema={schema} instrumentDirectory={instrumentDirectory} onChange={onChange} onSelect={onSelect} />
          <Field>
            <FieldLabel htmlFor="strategy-v2-timeframe">主周期</FieldLabel>
            <Select
              value={text(schema.primaryTimeframe, '1d')}
              onValueChange={(value) =>
                value && onChange(setStrategyPrimaryTimeframe(schema, value))
              }
            >
              <SelectTrigger className="w-full" id="strategy-v2-timeframe">
                <SelectValue>
                  {strategyTimeframeLabel(schema.primaryTimeframe, '未配置')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {strategyTimeframeValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {strategyTimeframeLabel(value)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet className="min-w-0 gap-0">
        <FieldLegend className="mb-3 text-base font-semibold">仓位与费用</FieldLegend>
        <FieldGroup className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="strategy-v2-sizing-type">仓位规则</FieldLabel>
            <Select
              value={text(sizing.type, 'fixedAmount')}
              onValueChange={(value) => {
                if (!value) return;
                const defaults: Record<string, unknown> = {
                  fixedAmount: { type: 'fixedAmount', amount: '10000' },
                  percentOfEquity: { type: 'percentOfEquity', percent: '0.1' },
                  fixedQuantity: { type: 'fixedQuantity', quantity: '100' },
                  targetWeight: { type: 'targetWeight', weight: '0.1' },
                };
                update('sizing', defaults[value]);
              }}
            >
              <SelectTrigger className="w-full" id="strategy-v2-sizing-type">
                <SelectValue>{strategySizingTypeLabel(sizing.type)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {strategySizingTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="strategy-v2-sizing">仓位数值</FieldLabel>
            <DecimalInput
              id="strategy-v2-sizing"
              aria-describedby="strategy-v2-sizing-help"
              value={text(sizing[sizingKey], '')}
              onChange={(event) => updateNested('sizing', sizingKey, event.target.value)}
            />
            <FieldDescription id="strategy-v2-sizing-help">
              {schema.schemaVersion === '3' && sizing.type === 'fixedQuantity'
                ? '按操作时点的不复权价格计算投入金额，后续按研究单位计算收益。'
                : sizingDescriptions[text(sizing.type, '')] ?? '请先选择仓位规则。'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="strategy-v2-commission">佣金率</FieldLabel>
            <DecimalInput
              id="strategy-v2-commission"
              aria-describedby="strategy-cost-help"
              value={text(cost.commissionRate, '0')}
              onChange={(event) => updateNested('cost', 'commissionRate', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="strategy-v2-slippage">滑点率</FieldLabel>
            <DecimalInput
              id="strategy-v2-slippage"
              aria-describedby="strategy-cost-help"
              value={text(cost.slippageRate, '0')}
              onChange={(event) => updateNested('cost', 'slippageRate', event.target.value)}
            />
          </Field>
        </FieldGroup>
        <p id="strategy-cost-help" className="mt-2 text-xs text-muted-foreground">
          费率按小数填写，例如 0.0003 表示 0.03%。
        </p>
      </FieldSet>
      <div className="flex flex-col gap-2">
        <h4 className="text-base font-semibold">信号与执行</h4>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 text-sm">
          <dt className="text-xs text-muted-foreground">信号来源</dt>
          <dd className="wrap-anywhere">
            {sources
              .map((source) => {
                const record = asRecord(source);
                return `${strategyInstrumentLabel(instrumentDirectory, text(asRecord(record.asset).symbol))} / ${strategyTimeframeLabel(record.timeframe, '未配置')}`;
              })
              .join('、') || '未配置'}
          </dd>
          <dt className="text-xs text-muted-foreground">风险规则</dt>
          <dd>
            {risks.map((risk) => strategyRiskTypeLabel(asRecord(risk).type)).join('、') ||
              '无风险退出规则'}
          </dd>
          <dt className="text-xs text-muted-foreground">执行方式</dt>
          <dd>
            {strategyExecutionModeLabel(execution.mode)} ·{' '}
            {strategyOrderTypeLabel(execution.orderType)} ·{' '}
            {strategyExecutionTimingLabel(execution.timing)} ·{' '}
            {strategyTimeInForceLabel(execution.timeInForce)}
          </dd>
        </dl>
      </div>
    </>
  );
}
