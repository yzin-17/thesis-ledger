import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

type SwitchVariant = 'default' | 'risk' | 'mode';

const switchVariants: Record<SwitchVariant, string> = {
  default: '',
  risk: 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 bg-input p-0.5 outline-none transition-colors data-checked:bg-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
  mode: 'relative inline-flex h-7 w-[70px] shrink-0 cursor-pointer items-center rounded-full border border-[color:var(--color-mode-switch-border)] bg-[color:var(--color-mode-switch-track)] p-0.5 outline-none transition-[border-color,background-color] duration-150 ease-out hover:border-[color:var(--color-mode-switch-border-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-mode-switch-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
};

const switchThumbVariants: Record<SwitchVariant, string> = {
  default: '',
  risk: 'inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-background px-0 text-[11px] font-semibold text-foreground shadow-xs transition-transform duration-150 ease-out data-checked:bg-primary-foreground data-checked:translate-x-5',
  mode: 'relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-mode-switch-thumb-border)] bg-[color:var(--color-mode-switch-thumb)] px-0 text-[11px] font-medium text-foreground transition-transform duration-200 ease-out data-checked:translate-x-[40px] motion-reduce:transition-none',
};

function Switch({
  className,
  variant = 'default',
  ...props
}: SwitchPrimitive.Root.Props & { variant?: SwitchVariant }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      nativeButton
      render={<button type="button" />}
      className={cn(switchVariants[variant], className)}
      {...props}
    />
  );
}

function SwitchThumb({
  className,
  variant = 'default',
  ...props
}: SwitchPrimitive.Thumb.Props & { variant?: SwitchVariant }) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(switchThumbVariants[variant], className)}
      {...props}
    />
  );
}

export { Switch, SwitchThumb };
