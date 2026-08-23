import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

type SwitchVariant = 'default' | 'risk';

const switchVariants: Record<SwitchVariant, string> = {
  default: '',
  risk: 'relative inline-flex h-7 w-16 shrink-0 items-center rounded-full border border-input bg-muted p-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
};

const switchThumbVariants: Record<SwitchVariant, string> = {
  default: '',
  risk: 'inline-flex h-5 w-8 items-center justify-center rounded-full bg-background px-0.5 text-[11px] font-semibold text-foreground shadow-xs transition-transform duration-150 ease-out data-checked:translate-x-7',
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
