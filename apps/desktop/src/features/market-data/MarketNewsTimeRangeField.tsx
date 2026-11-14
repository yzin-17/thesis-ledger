import { useId } from 'react';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateOnly } from '@/lib/date-display';

const rangeOptions = [
  { value: '1', label: '最近 24 小时' },
  { value: '3', label: '最近 3 天' },
  { value: '7', label: '最近 7 天' },
  { value: '30', label: '最近 30 天' },
  { value: 'custom', label: '自定义日期范围' },
] as const;

export type MarketNewsTimeRange = {
  preset: (typeof rangeOptions)[number]['value'];
  start: string;
  end: string;
};

export const defaultMarketNewsTimeRange: MarketNewsTimeRange = { preset: '3', start: '', end: '' };

/** News publication windows use elapsed time, or inclusive dates in the user's local timezone. */
export function resolveMarketNewsTimeRange(value: MarketNewsTimeRange, now = new Date()) {
  if (value.preset !== 'custom') {
    return {
      publishedStart: new Date(now.getTime() - Number(value.preset) * 86_400_000).toISOString(),
      publishedEnd: now.toISOString(),
    };
  }
  if (!value.start || !value.end) throw new Error('请选择起始日期和截止日期。');
  const start = new Date(`${value.start}T00:00:00`);
  const end = new Date(`${value.end}T23:59:59.999`);
  if (formatDateOnly(start.toString()) !== value.start || formatDateOnly(end.toString()) !== value.end) {
    throw new Error('请选择有效的日期。');
  }
  if (start > end) throw new Error('截止日期不能早于起始日期。');
  return { publishedStart: start.toISOString(), publishedEnd: end.toISOString() };
}

export function MarketNewsTimeRangeField({ value, onChange }: {
  value: MarketNewsTimeRange;
  onChange: (value: MarketNewsTimeRange) => void;
}) {
  const id = useId();
  return (
    <>
      <Field>
        <FieldLabel id={`${id}-label`}>时间范围</FieldLabel>
        <Select
          value={value.preset}
          items={rangeOptions}
          onValueChange={(preset) => {
            if (preset) onChange({ ...value, preset });
          }}
        >
          <SelectTrigger aria-labelledby={`${id}-label`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {rangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {value.preset === 'custom' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-start`}>起始日期</FieldLabel>
            <DateInput id={`${id}-start`} aria-label="起始日期" type="date" placeholder="" value={value.start}
              onChange={(event) => onChange({ ...value, start: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-end`}>截止日期</FieldLabel>
            <DateInput id={`${id}-end`} aria-label="截止日期" type="date" placeholder="" value={value.end}
              onChange={(event) => onChange({ ...value, end: event.target.value })} />
          </Field>
        </div>
      )}
    </>
  );
}
