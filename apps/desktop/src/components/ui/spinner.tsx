import type { ComponentProps } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label="正在加载"
      className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn('flex min-h-24 w-full items-center justify-center text-muted-foreground', className)}
    >
      <Spinner className="size-5" aria-hidden="true" />
    </div>
  );
}
