import { useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { Input } from '@/components/ui/input';
import { InputGroupInput } from '@/components/ui/input-group';

type DecimalInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, 'value' | 'defaultValue'> & {
  value?: string | number | undefined;
  defaultValue?: string | number | undefined;
  fractionDigits?: number;
  grouped?: boolean;
};

export function DecimalInput({
  value,
  defaultValue,
  name,
  form,
  fractionDigits = 6,
  grouped = false,
  onChange,
  onFocus,
  onBlur,
  ...props
}: DecimalInputProps) {
  const [draft, setDraft] = useState(String(defaultValue ?? ''));
  const [focused, setFocused] = useState(false);
  const [resetSequence, setResetSequence] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledReset = useRef(0);
  useLayoutEffect(() => {
    if (handledReset.current === resetSequence) return;
    handledReset.current = resetSequence;
    if (value === undefined) setDraft(String(defaultValue ?? ''));
  }, [resetSequence, value, defaultValue]);
  useLayoutEffect(() => {
    const owner = inputRef.current?.form;
    let active = true;
    // 原生点击可能在监听器之间执行微任务，下一任务再核对事件取消。
    const reset = (event: Event) =>
      setTimeout(() => {
        if (!active || event.defaultPrevented) return;
        setResetSequence((sequence) => sequence + 1);
      }, 0);
    owner?.addEventListener('reset', reset);
    return () => {
      active = false;
      owner?.removeEventListener('reset', reset);
    };
  }, [form, grouped]);
  const raw = value === undefined ? draft : String(value);
  const formatted = useMemo(() => {
    const numeric = Number(raw);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) || !Number.isFinite(numeric))
      return raw;
    const formatter = new Intl.NumberFormat('en-US', {
      useGrouping: false,
      maximumFractionDigits: fractionDigits,
    });
    const format = formatter.format.bind(formatter) as (value: string | number | bigint) => string;
    const text = format(raw);
    return Number(text) === 0 && /[1-9]/.test(raw) ? raw : text;
  }, [raw, fractionDigits]);
  const Control = grouped ? InputGroupInput : Input;

  return (
    <>
      <Control
        {...props}
        ref={inputRef}
        form={form}
        inputMode="decimal"
        value={focused ? raw : formatted}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onChange={(event) => {
          if (value === undefined) setDraft(event.target.value);
          onChange?.(event);
        }}
      />
      {name && (
        <input type="hidden" name={name} form={form} value={raw} disabled={props.disabled} />
      )}
    </>
  );
}
