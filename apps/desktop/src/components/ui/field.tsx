import * as React from 'react';
import { Field as FieldPrimitive } from '@base-ui/react/field';

import { cn } from '@/lib/utils';

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="field-group" className={cn('flex flex-col gap-4', className)} {...props} />
  );
}

function Field({ className, invalid, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      data-invalid={invalid ? '' : undefined}
      className={cn('flex flex-col gap-2', className)}
      invalid={invalid}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

function FieldError({ className, children, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      match
      className={cn('text-xs text-destructive', className)}
      {...props}
    >
      {children}
    </FieldPrimitive.Error>
  );
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
