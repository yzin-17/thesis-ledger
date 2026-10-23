import { DateInput, type DateInputProps } from '@/components/ui/date-input';

export function journalLocalTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
}

export function journalInstant(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

export function JournalWindowTimeInput({
  value,
  onValueChange,
  ...props
}: Omit<DateInputProps, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <DateInput
      {...props}
      type="datetime-local"
      step="any"
      value={journalLocalTime(value)}
      onChange={(event) => onValueChange(journalInstant(event.target.value))}
    />
  );
}
