import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { DateSelectionPanel } from '@/components/ui/date-selection-panel';
import type { DateInputProps } from '@/components/ui/date-input.types';
import { Field } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  dateInputValidationMessage,
  useDateInputEditor,
} from '@/components/ui/use-date-input-editor';
import { cn } from '@/lib/utils';

export type { DateInputProps } from '@/components/ui/date-input.types';

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
    onInvalid,
    placeholder,
    autoFocus,
    tabIndex,
    title,
    ...props
  },
  forwardedRef,
) {
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const triggerId = React.useId();
  const errorId = React.useId();
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '');
  const [open, setOpen] = React.useState(false);
  const rawValue = String(value ?? uncontrolledValue);
  const blocked = Boolean(disabled || readOnly);
  const editor = useDateInputEditor(type, rawValue);

  const setValueRef = React.useCallback(
    (input: HTMLInputElement | null) => {
      editor.valueRef.current = input;
      if (typeof forwardedRef === 'function') forwardedRef(input);
      else if (forwardedRef) forwardedRef.current = input;
    },
    [forwardedRef, editor.valueRef],
  );

  React.useEffect(() => {
    const input = editor.valueRef.current;
    const reset = () => queueMicrotask(() => setUncontrolledValue(input?.value ?? ''));
    input?.form?.addEventListener('reset', reset);
    return () => input?.form?.removeEventListener('reset', reset);
  }, [editor.valueRef]);

  const changeOpen = (next: boolean) => setOpen(next && !blocked);
  const selectValue = (next: string) => {
    if (blocked || !editor.commit(next, true)) return;
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
        <InputGroupInput
          {...props}
          ref={setValueRef}
          type={type}
          value={value}
          defaultValue={defaultValue}
          id={props.id ? `${props.id}-value` : undefined}
          data-slot="date-input-value"
          disabled={disabled}
          readOnly={readOnly}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onFocus={() => editor.editorRef.current?.focus()}
          onInvalid={(event) => {
            onInvalid?.(event);
            event.preventDefault();
            editor.setError(dateInputValidationMessage(event.currentTarget));
            editor.editorRef.current?.focus();
          }}
          onChange={(event) => {
            if (value === undefined) setUncontrolledValue(event.currentTarget.value);
            editor.resetDraft(event.currentTarget.value);
            onChange?.(event);
          }}
        />
        <Field className="min-w-0 flex-1" name="">
          <InputGroupInput
            ref={editor.editorRef}
            id={props.id}
            type="text"
            name=""
            value={editor.draft}
            disabled={disabled}
            readOnly={readOnly}
            autoComplete="off"
            autoFocus={autoFocus}
            tabIndex={tabIndex}
            title={title}
            placeholder={placeholder || '请选择日期'}
            className="tabular-nums"
            aria-label={props['aria-label']}
            aria-labelledby={props['aria-labelledby']}
            aria-invalid={Boolean(editor.error) || props['aria-invalid']}
            aria-required={props.required}
            aria-describedby={
              [props['aria-describedby'], editor.error && errorId].filter(Boolean).join(' ') ||
              undefined
            }
            aria-haspopup="dialog"
            aria-expanded={open && !blocked}
            onChange={(event) => editor.edit(event.currentTarget.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onPointerDown={onPointerDown}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented) changeOpen(true);
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              if (event.defaultPrevented) return;
              if (event.key === 'Escape') {
                if (open || editor.error) event.stopPropagation();
                editor.resetDraft(rawValue);
                setOpen(false);
              } else if (
                event.key === 'F4' ||
                event.key === 'Enter' ||
                (event.altKey && event.key === 'ArrowDown')
              ) {
                event.preventDefault();
                changeOpen(true);
              }
            }}
          />
        </Field>
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
      {editor.error && !open && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {editor.error}
        </p>
      )}
      <PopoverContent
        ref={popupRef}
        align="start"
        anchor={groupRef}
        className="w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0"
        aria-label={type === 'month' ? '选择月份' : '选择日期和时间'}
        finalFocus={editor.editorRef}
        initialFocus={() => {
          if (document.activeElement === editor.editorRef.current) return false;
          return (
            popupRef.current?.querySelector<HTMLElement>(
              '[data-selected-single="true"], [aria-pressed="true"]',
            ) ?? true
          );
        }}
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
        {editor.error && (
          <p id={errorId} role="alert" className="px-3 pb-3 text-xs text-destructive">
            {editor.error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
});

export { DateInput };
