import { PageHeader } from '../shared/PageHeader.js';
import { LoadingState } from '@/components/ui/spinner';

export function AccountDataFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="module-page" data-account-data-page>
      <div className="flex w-full max-w-7xl flex-col gap-card">{children}</div>
    </section>
  );
}

export function AccountDataLoading() {
  return (
    <AccountDataFrame>
      <PageHeader eyebrow="ACCOUNT DATA" title="账户数据" />
      <LoadingState label="正在加载账户数据" />
    </AccountDataFrame>
  );
}
