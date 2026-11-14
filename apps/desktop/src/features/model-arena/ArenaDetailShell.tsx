import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { arenaSeasonLabel } from '@thesis-ledger/domain';

export function ArenaDetailHeader({ title, backPath, backLabel = '返回比赛列表', backState, titleAccessory, children, actions }: {
  title: string; backPath: string; backLabel?: string; backState?: unknown; titleAccessory?: ReactNode; children?: ReactNode; actions?: ReactNode;
}) {
  return <div className="grid min-w-0 gap-text">
    <Link to={backPath} state={backState} className={buttonVariants({ variant: 'ghost', size: 'sm', className: '-ml-2 w-fit' })}>
      <ArrowLeft data-icon="inline-start" aria-hidden="true" />{backLabel}
    </Link>
    <header className="flex flex-wrap items-start justify-between gap-group">
      <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
        {titleAccessory}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </header>
    {children && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">{children}</div>}
  </div>;
}

export function ArenaFacts({ items }: { items: ReadonlyArray<readonly [string, ReactNode]> }) {
  return <dl className={cn('grid min-w-0 grid-cols-2 gap-x-6 gap-y-4', items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
    {items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium tabular-nums wrap-anywhere">{value}</dd></div>)}
  </dl>;
}

export function ArenaDateRange({ start, end }: { start: string | null; end: string | null }) {
  if (!start || !end) return <span>{arenaSeasonLabel({ startsOn: start, endsOn: end })}</span>;
  return <span className="inline-flex flex-wrap gap-x-1"><span className="whitespace-nowrap">{start}</span><span className="whitespace-nowrap">至 {end}</span></span>;
}

export function ArenaModelName({ model, provider }: { model: string; provider: string }) {
  return <span className="block min-w-0"><span className="block text-sm font-medium wrap-anywhere">{model}</span><span className="mt-1 block text-xs text-muted-foreground wrap-anywhere">{provider}</span></span>;
}

export function ArenaModelHeader({ model, provider, titleId, actions }: {
  model: string; provider: string; titleId?: string; actions?: ReactNode;
}) {
  return <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 bg-muted/60 p-4">
    <div className="min-w-0 flex-1"><h2 id={titleId} className="text-xl font-semibold tracking-tight wrap-anywhere">{model}</h2><p className="mt-1 text-xs text-muted-foreground wrap-anywhere">{provider}</p></div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function ArenaNotice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Empty className="items-start rounded-none px-0 py-6 text-left">
    <EmptyHeader className="max-w-2xl items-start"><EmptyTitle><h3 className="text-sm font-semibold">{title}</h3></EmptyTitle><EmptyDescription>{children}</EmptyDescription></EmptyHeader>
    {action && <EmptyContent className="max-w-none items-start">{action}</EmptyContent>}
  </Empty>;
}
