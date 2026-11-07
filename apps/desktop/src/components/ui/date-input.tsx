import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { DateSelectionPanel } from '@/components/ui/date-selection-panel';
import type { DateInputProps } from '@/components/ui/date-input.types';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type { DateInputProps } from '@/components/ui/date-input.types';

const placeholders = { date: 'YYYY-MM-DD', month: 'YYYY-MM', 'datetime-local': 'YYYY-MM-DD HH:mm' };

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  {
    className,
    type,
    value,
    defaultValue,
    disabled,
    readOnly,
    onChange,
    onPointerDown,
    onClick,
    onKeyDown,
    onFocus,
    onBlur,
    ...props
  },
  forwardedRef,
) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const triggerId = React.useId();
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '');
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [selectionError, setSelectionError] = React.useState('');
  const rawValue = String(value ?? uncontrolledValue);
  const blocked = Boolean(disabled || readOnly);

  const setInputRef = React.useCallback(
    (input: HTMLInputElement | null) => {
      inputRef.current = input;
      if (typeof forwardedRef === 'function') forwardedRef(input);
      else if (forwardedRef) forwardedRef.current = input;
    },
    [forwardedRef],
  );

  React.useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => queueMicrotask(() => setUncontrolledValue(inputRef.current?.value ?? ''));
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, []);

  const changeOpen = (next: boolean) => {
    setOpen(next && !blocked);
    setSelectionError('');
  };
  const selectValue = (next: string) => {
    const input = inputRef.current;
    if (!input || blocked) return;
    const previous = input.value;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, next);
    if (
      next &&
      (input.validity.rangeUnderflow || input.validity.rangeOverflow || input.validity.stepMismatch)
    ) {
      descriptor?.set?.call(input, previous);
      setSelectionError('请选择允许范围和间隔内的日期或时间。');
      return;
    }
    if (input.value !== previous) input.dispatchEvent(new Event('input', { bubbles: true }));
    setSelectionError('');
    if (type !== 'datetime-local' || !next) setOpen(false);
  };

  return (
    <Popover open={open && !blocked} triggerId={triggerId} onOpenChange={changeOpen}>
      <InputGroup
        ref={groupRef}
        data-slot="date-input"
        data-disabled={disabled ? 'true' : undefined}
        className={cn('relative bg-transparent text-foreground has-disabled:opacity-50', className)}
      >
        <div className="relative min-w-0 flex-1">
          {!focused && (
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 flex items-center truncate px-2.5 text-sm tabular-nums',
                rawValue ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {rawValue ? rawValue.replace('T', ' ') : placeholders[type]}
            </span>
          )}
          <InputGroupInput
            {...props}
            ref={setInputRef}
            type={type}
            value={value}
            defaultValue={defaultValue}
            disabled={disabled}
            readOnly={readOnly}
            aria-haspopup="dialog"
            aria-expanded={open && !blocked}
            className={cn(
              'tabular-nums [&::-webkit-calendar-picker-indicator]:hidden',
              !focused &&
                'text-transparent caret-transparent [-webkit-text-fill-color:transparent]',
            )}
            onChange={(event) => {
              if (value === undefined) setUncontrolledValue(event.currentTarget.value);
              onChange?.(event);
            }}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            onPointerDown={(event) => {
              onPointerDown?.(event);
              if (!event.defaultPrevented && event.button === 0 && !blocked) {
                event.preventDefault();
                changeOpen(true);
              }
            }}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented && !blocked) {
                event.preventDefault();
                changeOpen(true);
              }
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (
                !event.defaultPrevented &&
                (event.key === 'F4' ||
                  event.key === ' ' ||
                  event.key === 'Enter' ||
                  (event.altKey && event.key === 'ArrowDown'))
              ) {
                event.preventDefault();
                changeOpen(true);
              }
            }}
          />
        </div>
        <InputGroupAddon align="inline-end">
          <PopoverTrigger
            id={triggerId}
            disabled={blocked}
            render={
              <InputGroupButton
                size="icon-xs"
                aria-label={`打开${props['aria-label'] ?? '日期选择'}`}
              />
            }
          >
            <CalendarIcon aria-hidden="true" />
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent
        ref={popupRef}
        align="start"
        anchor={groupRef}
        className="w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0"
        aria-label={type === 'month' ? '选择月份' : '选择日期和时间'}
        finalFocus={inputRef}
        initialFocus={() =>
          popupRef.current?.querySelector<HTMLElement>(
            '[data-selected-single="true"], [aria-pressed="true"]',
          ) ?? true
        }
      >
        <DateSelectionPanel
          type={type}
          value={rawValue}
          min={props.min}
          max={props.max}
          step={props.step}
          onSelect={selectValue}
          onClose={() => setOpen(false)}
        />
        {selectionError && (
          <p role="alert" className="px-3 pb-3 text-xs text-destructive">
            {selectionError}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
});

export { DateInput };
