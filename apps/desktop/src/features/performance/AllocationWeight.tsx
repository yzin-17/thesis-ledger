import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { formatRatioPercent } from '@thesis-ledger/domain';

export function AllocationWeight({
  value,
  label,
  unavailable = false,
}: {
  value: number | null | undefined;
  label: string;
  unavailable?: boolean;
}) {
  if (unavailable || value === null || value === undefined || !Number.isFinite(value)) {
    return <div className="min-w-32 text-right text-sm text-muted-foreground">—</div>;
  }
  const percent = formatRatioPercent(value);
  return (
    <div className="flex min-w-32 items-center justify-end gap-2">
      <span className="shrink-0 text-sm tabular-nums">{percent}</span>
      {value >= 0 && value <= 1 && (
        <Progress className="w-20 shrink-0" value={value * 100} aria-label={`${label}${percent}`}>
          <ProgressTrack className="h-1">
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      )}
    </div>
  );
}
