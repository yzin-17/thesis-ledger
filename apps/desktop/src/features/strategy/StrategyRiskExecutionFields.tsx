import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  fractionToPercent,
  percentToFraction,
  sizingDefaultValue,
  sizingFieldDescription,
  sizingFieldLabel,
  stopLossDefaultValue,
  stopLossFieldDescription,
  stopLossFieldLabel,
} from './strategy.formats.js';
import type { StrategySchema } from './strategy.types.js';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const updateNested = (schema: StrategySchema, key: string, nestedKey: string, value: unknown) => ({
  ...schema,
  [key]: { ...asRecord(schema[key]), [nestedKey]: value },
});

const selectLabel = (value: unknown, labels: Record<string, string>, fallback: string) =>
  typeof value === 'string' ? (labels[value] ?? fallback) : fallback;

export function StrategyRiskExecutionFields({
  draft,
  onChange,
}: {
  draft: StrategySchema;
  onChange: (next: StrategySchema) => void;
}) {
  const stopLoss = asRecord(draft.stopLoss);
  const sizing = asRecord(draft.sizing);
  const execution = asRecord(draft.execution);
  const cost = asRecord(draft.cost);
  const takeProfit = asRecord(draft.takeProfit);
  const updateNestedField = (key: string, nestedKey: string, value: unknown) =>
    onChange(updateNested(draft, key, nestedKey, value));
  const updateTypeWithDefault = (key: string, type: string, value: number) =>
    onChange(updateNested(updateNested(draft, key, 'type', type), key, 'value', value));

  return (
    <>
      <Separator />
      <div>
        <h3 className="text-sm font-semibold">风险与执行</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{stopLossFieldLabel(stopLoss.type)}</FieldLabel>
          <Input
            type="number"
            min="0"
            max={stopLoss.type === 'atr' ? undefined : 100}
            step={stopLoss.type === 'atr' ? '0.1' : '1'}
            value={
              stopLoss.type === 'atr'
                ? typeof stopLoss.value === 'number'
                  ? String(stopLoss.value)
                  : ''
                : fractionToPercent(stopLoss.value)
            }
            onChange={(event) =>
              updateNestedField(
                'stopLoss',
                'value',
                stopLoss.type === 'atr'
                  ? Number(event.target.value)
                  : percentToFraction(event.target.value),
              )
            }
          />
          <FieldDescription>{stopLossFieldDescription(stopLoss.type)}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>止损类型</FieldLabel>
          <Select
            value={typeof stopLoss.type === 'string' ? stopLoss.type : 'fixed'}
            onValueChange={(value) =>
              value && updateTypeWithDefault('stopLoss', value, stopLossDefaultValue(value))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {selectLabel(
                  stopLoss.type,
                  { fixed: '固定比例', trailing: '移动止损', atr: 'ATR' },
                  '固定比例',
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="fixed">固定比例</SelectItem>
                <SelectItem value="trailing">移动止损</SelectItem>
                <SelectItem value="atr">平均真实波幅</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{sizingFieldLabel(sizing.type)}</FieldLabel>
          <Input
            type="number"
            min="0"
            max={sizing.type === 'fixed' ? undefined : 100}
            step={sizing.type === 'fixed' ? '100' : '1'}
            value={
              sizing.type === 'fixed'
                ? typeof sizing.value === 'number'
                  ? String(sizing.value)
                  : ''
                : fractionToPercent(sizing.value)
            }
            onChange={(event) =>
              updateNestedField(
                'sizing',
                'value',
                sizing.type === 'fixed'
                  ? Number(event.target.value)
                  : percentToFraction(event.target.value),
              )
            }
          />
          <FieldDescription>{sizingFieldDescription(sizing.type)}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>仓位类型</FieldLabel>
          <Select
            value={typeof sizing.type === 'string' ? sizing.type : 'weight'}
            onValueChange={(value) =>
              value && updateTypeWithDefault('sizing', value, sizingDefaultValue(value))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {selectLabel(
                  sizing.type,
                  { fixed: '固定投入金额', weight: '可用现金比例', risk: '单笔风险比例' },
                  '资金权重',
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="fixed">固定投入金额</SelectItem>
                <SelectItem value="weight">可用现金比例</SelectItem>
                <SelectItem value="risk">单笔风险比例</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>执行价格</FieldLabel>
          <Select
            value={typeof execution.price === 'string' ? execution.price : 'close'}
            onValueChange={(value) => value && updateNestedField('execution', 'price', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {selectLabel(
                  execution.price,
                  { open: '开盘价', close: '收盘价', nextOpen: '下一交易日开盘' },
                  '收盘价',
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="open">开盘价</SelectItem>
                <SelectItem value="close">收盘价</SelectItem>
                <SelectItem value="nextOpen">下一交易日开盘</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <NestedNumberField
          label="最小交易单位"
          value={execution.lotSize}
          integer
          onChange={(value) => updateNestedField('execution', 'lotSize', value)}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <p className="text-sm font-medium">T+1</p>
          <p className="text-xs text-muted-foreground">启用后买入当日不可卖出。</p>
        </div>
        <Switch
          aria-label="启用 T+1"
          checked={execution.tPlusOne === true}
          variant="risk"
          onCheckedChange={(checked) =>
            updateNestedField('execution', 'tPlusOne', Boolean(checked))
          }
        >
          <SwitchThumb variant="risk" />
        </Switch>
      </div>
      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">成本参数</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NestedNumberField
            label="手续费率"
            value={fractionToPercent(cost.commissionRate)}
            max={100}
            onChange={(value) => updateNestedField('cost', 'commissionRate', value / 100)}
          />
          <NestedNumberField
            label="最低手续费"
            value={cost.minimumCommission}
            onChange={(value) => updateNestedField('cost', 'minimumCommission', value)}
          />
          <NestedNumberField
            label="印花税率"
            value={fractionToPercent(cost.stampDutyRate)}
            max={100}
            onChange={(value) => updateNestedField('cost', 'stampDutyRate', value / 100)}
          />
          <NestedNumberField
            label="滑点率"
            value={fractionToPercent(cost.slippageRate)}
            max={100}
            onChange={(value) => updateNestedField('cost', 'slippageRate', value / 100)}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          费率输入单位：百分比；最低手续费单位：人民币。
        </p>
      </details>
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor="strategy-take-profit">止盈比例</FieldLabel>
          <Switch
            id="strategy-take-profit"
            checked={Boolean(takeProfit.value)}
            variant="risk"
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? { ...draft, takeProfit: { type: 'fixed', value: 0.2 } }
                  : (() => {
                      const next = { ...draft };
                      delete next.takeProfit;
                      return next;
                    })(),
              )
            }
          >
            <SwitchThumb variant="risk" />
          </Switch>
        </div>
        {takeProfit.value !== undefined && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Select
              value={typeof takeProfit.type === 'string' ? takeProfit.type : 'fixed'}
              onValueChange={(value) => value && updateNestedField('takeProfit', 'type', value)}
            >
              <SelectTrigger className="w-full" aria-label="止盈类型">
                <SelectValue>
                  {takeProfit.type === 'trailing' ? '移动止盈' : '固定止盈'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fixed">固定止盈</SelectItem>
                  <SelectItem value="trailing">移动止盈</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              id="strategy-take-profit"
              type="number"
              min="0"
              max="100"
              step="1"
              value={fractionToPercent(takeProfit.value)}
              onChange={(event) =>
                updateNestedField('takeProfit', 'value', percentToFraction(event.target.value))
              }
            />
          </div>
        )}
      </Field>
    </>
  );
}

function NestedNumberField({
  label,
  value,
  integer,
  max,
  step = '0.01',
  onChange,
}: {
  label: string;
  value: unknown;
  integer?: boolean;
  max?: number;
  step?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        min="0"
        max={max}
        step={integer ? '1' : step}
        value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
        onChange={(event) =>
          onChange(
            integer
              ? Math.max(1, Math.round(Number(event.target.value)))
              : Number(event.target.value),
          )
        }
      />
    </Field>
  );
}
