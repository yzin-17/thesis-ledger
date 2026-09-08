import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type Signal = { indicator: string; operator: string; value: number | string };

const signalOperatorLabels: Record<string, string> = {
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  crossesAbove: '上穿',
  crossesBelow: '下穿',
};

const signalIndicatorLabels: Record<string, string> = {
  close: '收盘价（close）',
  price: '收盘价（price）',
  open: '开盘价（open）',
  high: '最高价（high）',
  low: '最低价（low）',
  volume: '成交量（volume）',
};

export const signalIndicatorOptions = Object.entries(signalIndicatorLabels).map(
  ([value, label]) => ({ value, label }),
);

export function SignalEditor({
  label,
  signals,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  signals: Signal[];
  onChange: (index: number, field: keyof Signal, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          添加条件
        </Button>
      </div>
      {signals.map((signal, index) => (
        <div
          key={`${label}-${index}`}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <Field>
            <FieldLabel>指标</FieldLabel>
            <Select
              value={signal.indicator}
              onValueChange={(value) => value && onChange(index, 'indicator', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {signalIndicatorLabels[signal.indicator] ??
                    (signal.indicator ? `历史值（${signal.indicator}）` : '请选择指标')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {signalIndicatorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                  {signal.indicator && !signalIndicatorLabels[signal.indicator] && (
                    <SelectItem value={signal.indicator}>历史值（{signal.indicator}）</SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>运算符</FieldLabel>
            <Select
              value={signal.operator}
              onValueChange={(value) => value && onChange(index, 'operator', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {signalOperatorLabels[signal.operator] ?? signal.operator}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="gt">大于</SelectItem>
                  <SelectItem value="gte">大于等于</SelectItem>
                  <SelectItem value="lt">小于</SelectItem>
                  <SelectItem value="lte">小于等于</SelectItem>
                  <SelectItem value="crossesAbove">上穿</SelectItem>
                  <SelectItem value="crossesBelow">下穿</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>值</FieldLabel>
            <Input
              value={String(signal.value)}
              onChange={(event) => onChange(index, 'value', event.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="self-end"
            aria-label={`删除${label} ${index + 1}`}
            onClick={() => onRemove(index)}
            disabled={signals.length <= 1}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
    </section>
  );
}
