import * as React from 'react';
import type { DateInputType } from '@/components/ui/date-input.types';

const formats = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  'datetime-local': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/,
};

const dateInputFormats = {
  date: 'YYYY-MM-DD',
  month: 'YYYY-MM',
  'datetime-local': 'YYYY-MM-DD HH:mm',
};

export function dateInputValidationMessage(input: HTMLInputElement) {
  if (input.validity.customError) return input.validationMessage;
  if (input.validity.valueMissing) return '请选择日期或时间。';
  if (input.validity.rangeUnderflow) return `日期或时间不能早于 ${input.min.replace('T', ' ')}。`;
  if (input.validity.rangeOverflow) return `日期或时间不能晚于 ${input.max.replace('T', ' ')}。`;
  if (input.validity.stepMismatch) return '请选择允许间隔内的日期或时间。';
  return '请检查日期或时间。';
}

export function useDateInputEditor(type: DateInputType, rawValue: string) {
  const valueRef = React.useRef<HTMLInputElement | null>(null);
  const editorRef = React.useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = React.useState(rawValue.replace('T', ' '));
  const [error, setError] = React.useState('');
  const resetDraft = React.useCallback((value: string) => {
    setDraft(value.replace('T', ' '));
    setError('');
    valueRef.current?.setCustomValidity('');
  }, []);
  React.useEffect(() => resetDraft(rawValue), [rawValue, resetDraft]);
  React.useEffect(() => {
    const valueInput = valueRef.current;
    const labelledBy = valueInput?.getAttribute('aria-labelledby');
    if (labelledBy && !editorRef.current?.hasAttribute('aria-label')) {
      editorRef.current?.setAttribute('aria-labelledby', labelledBy);
    }
    const reset = () => queueMicrotask(() => resetDraft(valueInput?.value ?? ''));
    valueInput?.form?.addEventListener('reset', reset);
    return () => valueInput?.form?.removeEventListener('reset', reset);
  }, [resetDraft]);

  const commit = (next: string, checkConstraints = false) => {
    const input = valueRef.current;
    if (!input) return false;
    const previous = input.value;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    input.setCustomValidity('');
    descriptor?.set?.call(input, next);
    if (checkConstraints && next && !input.validity.valid) {
      descriptor?.set?.call(input, previous);
      setError('请选择允许范围和间隔内的日期或时间。');
      return false;
    }
    if (input.value !== previous) input.dispatchEvent(new Event('input', { bubbles: true }));
    resetDraft(input.value);
    return true;
  };
  const edit = (text: string) => {
    setDraft(text);
    const next = text.trim().replace(' ', 'T');
    const probe = document.createElement('input');
    probe.type = type;
    probe.value = next;
    if (next && (!formats[type].test(next) || !probe.value)) {
      const message = `请输入有效的${type === 'month' ? '月份' : '日期'}，格式为 ${dateInputFormats[type]}。`;
      valueRef.current?.setCustomValidity(message);
      setError(message);
      return;
    }
    commit(next);
  };
  return { valueRef, editorRef, draft, error, setError, resetDraft, commit, edit };
}
