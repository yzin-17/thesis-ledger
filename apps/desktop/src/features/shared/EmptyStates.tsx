import { LoadingState } from '@/components/ui/spinner';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 表格内空行。
 *
 * `filtered` 区分「本来就没有数据」与「筛选后没有匹配」：
 * 前者让用户去建数据，后者让用户去改条件，文案不同才不会误导。
 */
export const EmptyTableRow = ({
  colSpan,
  label,
  loading = false,
  filtered = false,
}: {
  colSpan: number;
  label?: string;
  loading?: boolean;
  filtered?: boolean;
}) => {
  const text = label ?? (filtered ? '当前筛选下没有记录' : '暂无记录');
  return (
    <tr>
      <td className="p-0 text-center hover:bg-transparent" colSpan={colSpan}>
        {loading ? (
          <LoadingState label={text} className="min-h-16" />
        ) : (
          <Empty className="min-h-16 rounded-none border-0 px-3 py-group" aria-live="polite">
            <EmptyDescription>{text}</EmptyDescription>
          </Empty>
        )}
      </td>
    </tr>
  );
};

/**
 * 列表空态。
 *
 * 传 `filtered` 时自动换成「筛选无结果」的标题与动作，动作文案固定「清空筛选」，
 * 调用方只需把重置回调接到 `onAction`，不必再自己判断该说哪句话。
 */
export const EmptyListState = ({
  className,
  title = '暂无记录',
  description,
  actionLabel,
  onAction,
  filtered = false,
  filteredTitle = '没有匹配结果',
  filteredDescription = '调整筛选条件后重试。',
}: {
  className?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  filtered?: boolean;
  filteredTitle?: string;
  filteredDescription?: string;
}) => {
  const shownTitle = filtered ? filteredTitle : title;
  const shownDescription = filtered ? filteredDescription : description;
  const shownActionLabel = actionLabel ?? (filtered && onAction ? '清空筛选' : undefined);
  return (
    <Empty className={cn('min-h-16 rounded-none border-0 p-5', className)} aria-live="polite">
      <EmptyHeader>
        <EmptyTitle>{shownTitle}</EmptyTitle>
        {shownDescription && <EmptyDescription>{shownDescription}</EmptyDescription>}
      </EmptyHeader>
      {shownActionLabel && onAction && (
        <EmptyContent>
          <Button type="button" onClick={onAction}>
            {shownActionLabel}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
};
