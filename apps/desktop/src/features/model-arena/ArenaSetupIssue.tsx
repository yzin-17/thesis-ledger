import { useId, type ReactNode } from 'react';
import { Field, FieldError } from '@/components/ui/field';

export function ArenaSetupIssue({ label, error, children }: { label: string; error: string | undefined; children?: ReactNode }) {
  const id = useId();
  if (!error && !children) return null;
  return <Field role="group" aria-label={label} invalid={Boolean(error)} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined} tabIndex={error ? -1 : undefined}>
    {children}
    {error && <FieldError id={id} role="alert">{error}</FieldError>}
  </Field>;
}
