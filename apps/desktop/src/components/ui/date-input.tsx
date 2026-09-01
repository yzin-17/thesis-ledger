import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type DateInputType = 'date' | 'datetime-local';
type PickerInputElement = HTMLInputElement & { showPicker?: () => void };

export type DateInputProps = Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type'> & {
  type: DateInputType;
};

const dateInputDisplayValue = (value: DateInputProps['value'], type: DateInputType) => {
  const inputValue = value == null ? '' : String(value);
  if (!inputValue) return type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm';

  const [date, time] = inputValue.split('T');
  if (type === 'date') return date;
  return time ? `${date} ${time.slice(0, 5)}` : date;
};

const inputClassName =
  'absolute inset-0 z-10 h-full cursor-pointer border-0 bg-transparent shadow-none outline-none ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0';

const pickerInputClassName =
  'select-none text-transparent caret-transparent opacity-0 placeholder:text-transparent selection:bg-transparent selection:text-transparent [-webkit-text-fill-color:transparent] [&::-webkit-datetime-edit]:opacity-0 [&::-webkit-datetime-edit-text]:opacity-0 [&::-webkit-datetime-edit-year-field]:opacity-0 [&::-webkit-datetime-edit-month-field]:opacity-0 [&::-webkit-datetime-edit-day-field]:opacity-0 [&::-webkit-datetime-edit-hour-field]:opacity-0 [&::-webkit-datetime-edit-minute-field]:opacity-0 [&::-webkit-datetime-edit-ampm-field]:opacity-0';

const fallbackInputClassName =
  'select-none text-transparent caret-transparent placeholder:text-transparent selection:bg-transparent selection:text-transparent [-webkit-text-fill-color:transparent] [&::-webkit-datetime-edit]:opacity-0 [&::-webkit-datetime-edit-text]:opacity-0 [&::-webkit-datetime-edit-year-field]:opacity-0 [&::-webkit-datetime-edit-month-field]:opacity-0 [&::-webkit-datetime-edit-day-field]:opacity-0 [&::-webkit-datetime-edit-hour-field]:opacity-0 [&::-webkit-datetime-edit-minute-field]:opacity-0 [&::-webkit-datetime-edit-ampm-field]:opacity-0';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ className, onPointerDown, type, value, ...props }, forwardedRef) {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [pickerSupported, setPickerSupported] = React.useState<boolean | null>(null);

    const setInputRef = React.useCallback(
      (input: HTMLInputElement | null) => {
        inputRef.current = input;
        if (typeof forwardedRef === 'function') forwardedRef(input);
        else if (forwardedRef) forwardedRef.current = input;
      },
      [forwardedRef],
    );

    useIsomorphicLayoutEffect(() => {
      const input = inputRef.current as PickerInputElement | null;
      setPickerSupported(typeof input?.showPicker === 'function');
    }, []);

    const openDatePicker = (event: React.PointerEvent<HTMLInputElement>) => {
      const input = event.currentTarget as PickerInputElement;
      if (event.button !== 0 || typeof input.showPicker !== 'function') {
        onPointerDown?.(event);
        return;
      }

      event.preventDefault();
      input.focus();
      try {
        input.showPicker();
      } catch {
        // The native picker can reject calls outside a user-activation context.
      }
      onPointerDown?.(event);
    };

    return (
      <div className="relative flex h-9 w-full min-w-0 items-center justify-between rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none min-w-0 flex-1 truncate',
          value ? 'text-foreground' : 'text-muted-foreground',
        )}
        >
          {dateInputDisplayValue(value, type)}
        </span>
        {pickerSupported !== false && (
          <CalendarIcon
            aria-hidden="true"
            className="pointer-events-none size-4 shrink-0 text-muted-foreground"
          />
        )}
        <Input
        {...props}
        ref={setInputRef}
        type={type}
        value={value}
        onPointerDown={openDatePicker}
        className={cn(
          inputClassName,
          pickerSupported === false ? fallbackInputClassName : pickerInputClassName,
          className,
        )}
      />
      </div>
    );
  },
);

export { DateInput };
