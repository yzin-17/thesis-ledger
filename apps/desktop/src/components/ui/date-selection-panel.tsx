import { useId, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { zhCN } from 'react-day-picker/locale';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateInputType, DateInputProps } from '@/components/ui/date-input.types';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type PanelProps = Pick<DateInputProps, 'min' | 'max' | 'step'> & {
  type: DateInputType;
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

function calendarDayValue(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DateSelectionPanel({ type, value, min, max, step, onSelect, onClose }: PanelProps) {
  const selected = value ? new Date(`${value.slice(0, 10)}T00:00:00`) : undefined;
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const timeId = useId();
  const validSelected = selected && Number.isFinite(selected.getTime()) ? selected : undefined;
  const minimum = min == null ? '' : String(min);
  const maximum = max == null ? '' : String(max);
  const time = value.split('T')[1] ?? '00:00';
  const chooseDate = (date: Date) => {
    const day = calendarDayValue(date);
    onSelect(type === 'datetime-local' ? `${day}T${time}` : day);
  };
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const shortcut = type === 'month' ? currentMonth : calendarDayValue(today);
  const lower = minimum.slice(0, shortcut.length);
  const upper = maximum.slice(0, shortcut.length);

  return (
    <Field className="gap-0">
      {type === 'month' ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="上一年"
              disabled={year <= 1}
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Input
              aria-label="年份"
              type="number"
              min={1}
              max={9999}
              value={year}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isInteger(next) && next >= 1 && next <= 9999) setYear(next);
              }}
              className="w-24 text-center"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="下一年"
              disabled={year >= 9999}
              onClick={() => setYear(year + 1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <div
            className="grid grid-cols-3 gap-2"
            role="group"
            aria-label="月份"
            onKeyDown={(event) => {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              );
              const index = buttons.indexOf(event.target as HTMLButtonElement);
              const moves: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: 3,
                ArrowUp: -3,
              };
              const move = moves[event.key];
              if (index >= 0 && move !== undefined) {
                event.preventDefault();
                buttons[(index + move + buttons.length) % buttons.length]?.focus();
              }
            }}
          >
            {Array.from({ length: 12 }, (_, index) => {
              const month = `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`;
              return (
                <Button
                  key={month}
                  variant={month === value ? 'default' : 'ghost'}
                  aria-pressed={month === value}
                  disabled={Boolean((minimum && month < minimum) || (maximum && month > maximum))}
                  onClick={() => onSelect(month)}
                >
                  {index + 1}月
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <Calendar
          mode="single"
          locale={zhCN}
          autoFocus
          selected={validSelected}
          defaultMonth={validSelected ?? new Date()}
          captionLayout="label"
          startMonth={
            new Date(minimum ? `${minimum.slice(0, 7)}-01T00:00:00` : '0001-01-01T00:00:00')
          }
          endMonth={
            new Date(maximum ? `${maximum.slice(0, 7)}-01T00:00:00` : '9999-12-01T00:00:00')
          }
          disabled={(date) => {
            const day = calendarDayValue(date);
            return Boolean(
              (minimum && day < minimum.slice(0, 10)) || (maximum && day > maximum.slice(0, 10)),
            );
          }}
          onSelect={(date) => {
            if (date) chooseDate(date);
          }}
          className="w-full"
        />
      )}
      {type === 'datetime-local' && (
        <Field className="px-3 pb-3">
          <FieldLabel htmlFor={timeId}>时间</FieldLabel>
          <Input
            id={timeId}
            aria-label="时间"
            type="time"
            value={time}
            step={step ?? 60}
            disabled={!value}
            className="[&::-webkit-calendar-picker-indicator]:hidden"
            onChange={(event) => {
              if (event.target.value && value)
                onSelect(`${value.slice(0, 10)}T${event.target.value}`);
            }}
          />
        </Field>
      )}
      <div className="flex items-center justify-between gap-2 border-t p-3">
        <Button variant="ghost" size="sm" onClick={() => onSelect('')}>
          清除
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={Boolean((lower && shortcut < lower) || (upper && shortcut > upper))}
          onClick={() => {
            if (type === 'month') onSelect(currentMonth);
            else chooseDate(today);
          }}
        >
          {type === 'month' ? '本月' : '今天'}
        </Button>
        {type === 'datetime-local' && (
          <Button size="sm" onClick={onClose}>
            完成
          </Button>
        )}
      </div>
    </Field>
  );
}
