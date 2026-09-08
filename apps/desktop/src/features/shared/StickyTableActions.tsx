import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const actionHeaderClasses =
  'sticky right-0 z-20 min-w-40 border-l border-border bg-muted text-right';
const actionCellClasses = 'sticky right-0 z-10 min-w-40 border-l border-border bg-background';

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
