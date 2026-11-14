import { arenaLiveFieldPlaceholder, arenaLiveSetupFields, arenaResourceFields, type ArenaLiveForm } from '@thesis-ledger/api-client';
import { Input } from '@/components/ui/input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { DateInput } from '@/components/ui/date-input';
import { useId } from 'react';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';

export function ArenaSetupFields<K extends string = keyof ArenaLiveForm>({ keys, form, onChange, fields, optionalBudget = false, errors }: { keys: readonly K[]; form: Record<K, string>; onChange: (key: K, value: string) => void; fields?: readonly (readonly [string, string, string])[]; optionalBudget?: boolean; errors?: Partial<Record<K, string>> }) {
  const id = useId();
  return <FieldGroup className="grid min-w-0 gap-4 sm:grid-cols-2">{keys.map((key) => {
    const field = (fields ?? [...arenaLiveSetupFields, ...arenaResourceFields]).find(([name]) => name === key);
    if (!field) return null;
    const label = field[1];
    const placeholder = fields ? undefined : arenaLiveFieldPlaceholder(key);
    const decimal = ['initialCash', 'minimum', 'cost', 'allCost'].includes(key);
    const date = key === 'startsOn' || key === 'endsOn';
    const error = errors?.[key], errorId = id + '-' + key;
    const validation = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? errorId : undefined };
    return <Field key={key} invalid={Boolean(error)} className="min-w-0"><span className="text-xs text-muted-foreground">{label}</span>
      {decimal && <DecimalInput {...validation} aria-label={label} placeholder={optionalBudget ? '不限额' : placeholder} value={form[key]} onChange={(e) => onChange(key, e.target.value)} />}
      {date && <DateInput {...validation} aria-label={label} type="date" value={form[key]} onChange={(e) => onChange(key, e.target.value)} />}
      {!decimal && !date && <Input {...validation} aria-label={label} placeholder={optionalBudget ? '不限额' : placeholder} inputMode={key === 'title' ? 'text' : 'numeric'} value={form[key]} onChange={(e) => onChange(key, e.target.value)} />}
      {error && <FieldError id={errorId} role="alert">{error}</FieldError>}
    </Field>;
  })}</FieldGroup>;
}
