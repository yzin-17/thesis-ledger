import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function BacktestAssumptionSection({
  title,
  status,
  children,
}: {
  title: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <Card role="region" aria-label={title} className="gap-4 rounded-none border-0 bg-transparent py-0">
      <CardHeader className="px-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle role="heading" aria-level={3} className="text-xl">{title}</CardTitle>
          {status && <Badge variant="secondary">{status}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4 px-0">{children}</CardContent>
    </Card>
  );
}

export function BacktestAssumptionField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm leading-relaxed">{children}</dd>
    </div>
  );
}
