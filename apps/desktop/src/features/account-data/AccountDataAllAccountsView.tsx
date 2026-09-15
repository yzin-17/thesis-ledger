import { PageHeader } from '../shared/PageHeader.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { AccountDataAccountSelector } from './AccountDataAccountSelector.js';
import { AccountDataFrame, AccountDataLoading } from './AccountDataLayout.js';
import { usePortfolioValuationQuery } from '../portfolio/portfolio.queries.js';
import { PortfolioPositionTable, PortfolioSummary } from '../portfolio/PortfolioOverview.js';
import type { Account } from '../portfolio/portfolio.types.js';

export function AccountDataAllAccountsView({
  accounts,
  accountId,
  mode,
  onSelectAccount,
}: {
  accounts: Account[];
  accountId: string;
  mode: Account['mode'];
  onSelectAccount: (accountId: string) => void | Promise<unknown>;
}) {
  const valuationQuery = usePortfolioValuationQuery(mode, true);
  const accountSelector = (
    <AccountDataAccountSelector
      accounts={accounts}
      accountId={accountId}
      onSelectAccount={onSelectAccount}
    />
  );

  if (valuationQuery.isPending && !valuationQuery.data) return <AccountDataLoading />;
  if (valuationQuery.isError && !valuationQuery.data) {
    return (
      <AccountDataFrame>
        <PageHeader
          className="mb-0"
          eyebrow="ACCOUNT DATA"
          title="全部账户"
          description="查看当前估值范围内的组合汇总与持仓明细。"
        />
        {accountSelector}
        <Alert variant="destructive">
          <AlertTitle>组合读取失败</AlertTitle>
          <AlertDescription>无法读取全部账户估值，请稍后重试。</AlertDescription>
          <Button type="button" variant="outline" onClick={() => void valuationQuery.refetch()}>
            重新加载组合
          </Button>
        </Alert>
      </AccountDataFrame>
    );
  }
  if (!valuationQuery.data) return <AccountDataLoading />;

  return (
    <AccountDataFrame>
      <PageHeader
        className="mb-0"
        eyebrow="ACCOUNT DATA"
        title="全部账户"
        description="只读查看当前估值范围内的组合汇总与持仓明细。"
      />
      {accountSelector}
      <PortfolioSummary portfolio={valuationQuery.data} />
      <PortfolioPositionTable portfolio={valuationQuery.data} />
    </AccountDataFrame>
  );
}
