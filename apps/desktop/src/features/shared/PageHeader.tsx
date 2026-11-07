import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  titleId?: string;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  actions,
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-group', className)}>
      <div className="min-w-0 flex-1 basis-64">
        <p
          lang="en"
          className="m-0 mb-2 text-xs leading-4 font-semibold tracking-[0.16em] text-muted-foreground uppercase"
        >
          {eyebrow}
        </p>
        <h1
          id={titleId}
          className="m-0 text-page-small leading-tight font-semibold tracking-tight wrap-anywhere sm:text-page"
        >
          {title}
        </h1>
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-2 sm:mt-6">{actions}</div>
      )}
    </header>
  );
}
