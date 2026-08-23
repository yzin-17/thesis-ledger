import { Empty, EmptyDescription } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export const EmptyTableRow = ({ colSpan }: { colSpan: number }) => (
  <tr>
    <td className="p-0 text-center hover:bg-transparent" colSpan={colSpan}>
      <Empty className="min-h-16 rounded-none border-0 px-3 py-[18px]" aria-live="polite">
        <EmptyDescription>暂无记录</EmptyDescription>
      </Empty>
    </td>
  </tr>
);

export const EmptyListState = ({ className }: { className?: string }) => (
  <Empty className={cn('min-h-16 rounded-none border-0 p-5', className)} aria-live="polite">
    <EmptyDescription>暂无记录</EmptyDescription>
  </Empty>
);
