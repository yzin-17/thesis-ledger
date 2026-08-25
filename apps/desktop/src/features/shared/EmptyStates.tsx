import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const EmptyTableRow = ({
  colSpan,
  label = '暂无记录',
}: {
  colSpan: number;
  label?: string;
}) => (
  <tr>
    <td className="p-0 text-center hover:bg-transparent" colSpan={colSpan}>
      <Empty className="min-h-16 rounded-none border-0 px-3 py-[18px]" aria-live="polite">
        <EmptyDescription>{label}</EmptyDescription>
      </Empty>
    </td>
  </tr>
);

export const EmptyListState = ({
  className,
  title = '暂无记录',
  description,
  actionLabel,
  onAction,
}: {
  className?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <Empty className={cn('min-h-16 rounded-none border-0 p-5', className)} aria-live="polite">
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      {description && <EmptyDescription>{description}</EmptyDescription>}
    </EmptyHeader>
    {actionLabel && onAction && (
      <EmptyContent>
        <Button type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      </EmptyContent>
    )}
  </Empty>
);
