import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 页面顶栏 ghost 刷新图标按钮：与模式开关同高（h-7），刷新中图标旋转并禁用。 */
export function RefreshIconButton({
  label,
  refreshing,
  disabled = false,
  onClick,
}: {
  label: string;
  refreshing: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-7 w-7 rounded-lg text-muted-foreground"
      title={label}
      aria-label={label}
      disabled={disabled || refreshing}
      onClick={onClick}
    >
      <RefreshCw
        className={cn('size-[18px]', refreshing && 'animate-spin')}
        aria-hidden="true"
      />
    </Button>
  );
}
