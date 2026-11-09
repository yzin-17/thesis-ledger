import * as React from 'react';
import { cn } from '@/lib/utils';
import { ListRefreshRegion } from './list-refresh-region';

type TableFrame = 'outlined' | 'plain';
type RefreshProps = { refreshing?: boolean | undefined; refreshLabel?: string | undefined; refreshAvoidText?: boolean | undefined };

function TableContainer({
  className,
  frame = 'outlined',
  refreshing,
  refreshLabel,
  refreshAvoidText,
  ...props
}: React.ComponentProps<'div'> & { frame?: TableFrame | undefined } & RefreshProps) {
  const table = (
    <div
      data-slot="table-container"
      data-frame={frame}
      className={cn(
        'relative w-full overflow-x-auto [&_a]:no-underline [&_a:hover]:no-underline [&_button:hover]:no-underline',
        frame === 'outlined' && 'rounded-md border border-border',
        className,
      )}
      {...props}
    />
  );
  if (refreshing === undefined) return table;
  return (
    <ListRefreshRegion refreshing={refreshing} label={refreshLabel} avoidText={refreshAvoidText}>
      {table}
    </ListRefreshRegion>
  );
}

function Table({
  className,
  containerClassName,
  frame,
  refreshing,
  refreshLabel,
  refreshAvoidText,
  ...props
}: Omit<React.ComponentProps<'table'>, 'frame'> &
  RefreshProps & {
    containerClassName?: string | undefined;
    frame?: TableFrame | undefined;
  }) {
  return (
    <TableContainer
      frame={frame}
      className={containerClassName}
      refreshing={refreshing}
      refreshLabel={refreshLabel}
      refreshAvoidText={refreshAvoidText}
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </TableContainer>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('bg-muted [&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-3 py-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-2 text-left align-middle whitespace-nowrap', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableContainer,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
