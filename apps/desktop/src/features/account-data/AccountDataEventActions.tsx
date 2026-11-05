import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type RowAction = { label: string; run: () => void };

export function AccountDataEventActions({
  subject,
  primary,
  destructive,
  onHistory,
}: {
  subject: string;
  primary?: RowAction | undefined;
  destructive?: RowAction | undefined;
  onHistory: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {primary && (
        <Button type="button" size="sm" variant="ghost" onClick={primary.run}>
          {primary.label}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`更多操作：${subject}`}
            >
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onHistory}>查看历史</DropdownMenuItem>
            {destructive && (
              <DropdownMenuItem variant="destructive" onClick={destructive.run}>
                {destructive.label}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
