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

type LabelInteractionEvent = Pick<React.SyntheticEvent<HTMLElement>, 'preventDefault' | 'target'>;

function isInteractiveLabelTarget(target: EventTarget | null) {
  if (!target) return false;
  const element = target as EventTarget & {
    closest?: (selectors: string) => Element | null;
  };
  return typeof element.closest === 'function' && element.closest('button,input,select,textarea') !== null;
}

function preventLabelActivation(event: LabelInteractionEvent) {
  if (!isInteractiveLabelTarget(event.target)) event.preventDefault();
}

function FieldLabel({
  className,
  onClick,
  onMouseDown,
  onPointerDown,
  ...props
}: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
      onClick={(event) => {
        preventLabelActivation(event);
        onClick?.(event);
      }}
      onMouseDown={(event) => {
        preventLabelActivation(event);
        onMouseDown?.(event);
      }}
      onPointerDown={(event) => {
        preventLabelActivation(event);
        onPointerDown?.(event);
      }}
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
