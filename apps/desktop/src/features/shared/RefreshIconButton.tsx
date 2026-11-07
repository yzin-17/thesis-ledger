import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { RefreshCw } from 'lucide-react';

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
      aria-busy={refreshing}
      disabled={disabled || refreshing}
      onClick={onClick}
    >
      {refreshing ? <Spinner aria-hidden="true" /> : <RefreshCw className="size-[18px]" aria-hidden="true" />}
    </Button>
  );
}
