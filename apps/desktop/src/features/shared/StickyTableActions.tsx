import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const actionHeaderClasses =
  "sticky right-0 z-20 min-w-40 bg-muted text-right before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border before:content-['']";
const actionCellClasses =
  "sticky right-0 z-10 min-w-40 bg-background before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border before:content-['']";

export function StickyTableActionHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<'th'>) {
  return (
    <th
      {...props}
      data-sticky-table-action="header"
      className={cn(actionHeaderClasses, className)}
    />
  );
}

export function StickyTableActionCell({
  className,
  ...props
}: ComponentPropsWithoutRef<'td'>) {
  return (
    <td
      {...props}
      data-sticky-table-action="cell"
      className={cn(actionCellClasses, className)}
    />
  );
}
