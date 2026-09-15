import { PageHeader } from '../shared/PageHeader.js';
import { Skeleton } from '@/components/ui/skeleton';

export function AccountDataFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="module-page" data-account-data-page>
      <div className="flex w-full max-w-7xl flex-col gap-6">{children}</div>
    </section>
  );
}

export function AccountDataLoading() {
  return (
    <AccountDataFrame>
      <PageHeader className="mb-0" eyebrow="ACCOUNT DATA" title="账户数据" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </AccountDataFrame>
  );
}
