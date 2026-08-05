import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      nativeButton
      render={<button type="button" />}
      className={cn(className)}
      {...props}
    />
  );
}

function SwitchThumb({ className, ...props }: SwitchPrimitive.Thumb.Props) {
  return <SwitchPrimitive.Thumb data-slot="switch-thumb" className={cn(className)} {...props} />;
}

export { Switch, SwitchThumb };
