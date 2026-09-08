import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  titleId?: string;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="m-0 mb-2 text-xs leading-4 font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h1
          id={titleId}
          className="m-0 text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]"
        >
          {title}
        </h1>
        {description && (
          <p className="m-0 mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-2 pt-1">{actions}</div>
      )}
    </header>
  );
}
