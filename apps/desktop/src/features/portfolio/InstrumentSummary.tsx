import { cn } from '@/lib/utils';

export function InstrumentSummary({
  symbol,
  name,
  className,
}: {
  symbol: string;
  name?: string | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2',
        className,
      )}
    >
      <strong className="min-w-0 break-words text-sm font-medium">{name || symbol}</strong>
      {name && name !== symbol && <span className="text-xs text-muted-foreground">{symbol}</span>}
    </div>
  );
}
