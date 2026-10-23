import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export type PortfolioModeValue = 'actual' | 'shadow';

export function PortfolioModeSwitch({
  mode,
  onModeChange,
  ariaLabel,
  actualLabel = '实际',
  shadowLabel = '模拟',
  className,
  disabled = false,
  compact = false,
}: {
  mode: PortfolioModeValue;
  onModeChange: (mode: PortfolioModeValue) => void;
  ariaLabel: string;
  actualLabel?: string;
  shadowLabel?: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const isActual = mode === 'actual';
  const currentLabel = isActual ? actualLabel : shadowLabel;
  const nextLabel = isActual ? shadowLabel : actualLabel;
  return (
    <div className={cn('flex flex-col items-start gap-1.5', compact && 'items-center', className)}>
      <span className="text-xs text-muted-foreground">{compact ? currentLabel : '账户范围'}</span>
      <ToggleGroup
        value={[mode]}
        disabled={disabled}
        aria-busy={disabled}
        className={cn('flex-nowrap gap-0.5 rounded-md bg-muted p-0.5', compact && 'flex-col')}
        data-mode={mode}
        aria-label={`${ariaLabel}：当前${currentLabel}，切换到${nextLabel}`}
        onValueChange={(values) => {
          const next = values[0];
          if ((next === 'actual' || next === 'shadow') && next !== mode) onModeChange(next);
        }}
      >
        <ToggleGroupItem
          value="actual"
          className="border-transparent bg-transparent data-pressed:bg-background data-pressed:text-foreground"
        >
          {actualLabel}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="shadow"
          className="border-transparent bg-transparent data-pressed:bg-background data-pressed:text-foreground"
        >
          {shadowLabel}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function PortfolioModeNote({ children }: { children: ReactNode }) {
  return (
    <p className="mode-note flex items-center gap-2" role="status" aria-live="polite">
      <Badge
        variant="outline"
        className="border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
      >
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        模拟模式
      </Badge>
      <span>{children}</span>
    </p>
  );
}
