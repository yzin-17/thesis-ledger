import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type PortfolioModeValue = 'actual' | 'shadow';

export function PortfolioModeSwitch({
  mode,
  onModeChange,
  ariaLabel,
  contextLabel = '模式',
  actualLabel = '实际',
  shadowLabel = '模拟',
  className,
}: {
  mode: PortfolioModeValue;
  onModeChange: (mode: PortfolioModeValue) => void;
  ariaLabel: string;
  contextLabel?: string;
  actualLabel?: string;
  shadowLabel?: string;
  className?: string;
}) {
  const isShadow = mode === 'shadow';
  const currentLabel = isShadow ? shadowLabel : actualLabel;
  const nextLabel = isShadow ? actualLabel : shadowLabel;

  return (
    <div
      className={cn('inline-flex min-h-7 items-center gap-1 whitespace-nowrap', className)}
      role="group"
      aria-label={ariaLabel}
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground">
        {contextLabel}
      </span>
      <Switch
        variant="risk"
        checked={isShadow}
        aria-label={`当前${currentLabel}，切换到${nextLabel}`}
        onCheckedChange={(checked) => onModeChange(checked ? 'shadow' : 'actual')}
      >
        <SwitchThumb variant="risk">{currentLabel}</SwitchThumb>
      </Switch>
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
