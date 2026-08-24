import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type PortfolioModeValue = 'actual' | 'shadow';

export function PortfolioModeSwitch({
  mode,
  onModeChange,
  ariaLabel,
  actualLabel = '实际',
  shadowLabel = '模拟',
  className,
}: {
  mode: PortfolioModeValue;
  onModeChange: (mode: PortfolioModeValue) => void;
  ariaLabel: string;
  actualLabel?: string;
  shadowLabel?: string;
  className?: string;
}) {
  const isActual = mode === 'actual';
  const currentLabel = isActual ? actualLabel : shadowLabel;
  const nextLabel = isActual ? shadowLabel : actualLabel;
  const modeLabelClass =
    'pointer-events-none absolute inset-y-0 z-0 flex items-center text-[13px] font-medium leading-none text-[color:var(--color-mode-switch-text)] whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none';

  return (
    <div className={cn('inline-flex items-center', className)}>
      <Switch
        variant="mode"
        checked={isActual}
        data-mode={mode}
        aria-label={`${ariaLabel}：当前${currentLabel}，切换到${nextLabel}`}
        title={`当前${currentLabel}，切换到${nextLabel}`}
        onCheckedChange={(checked) => onModeChange(checked ? 'actual' : 'shadow')}
      >
        <span
          aria-hidden="true"
          className={cn(modeLabelClass, 'left-2 px-1', isActual ? 'opacity-100' : 'opacity-0')}
        >
          {actualLabel}
        </span>
        <span
          aria-hidden="true"
          className={cn(modeLabelClass, 'right-2 px-1', isActual ? 'opacity-0' : 'opacity-100')}
        >
          {shadowLabel}
        </span>
        <SwitchThumb variant="mode" aria-hidden="true" />
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
