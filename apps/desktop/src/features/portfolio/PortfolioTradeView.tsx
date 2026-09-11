import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TradeSummaryResponseV2 } from '@thesis-ledger/api-client';
import { PortfolioTradeDetailDialog } from './PortfolioTradeDetailDialog.js';
import type { PortfolioTradeReviewTarget } from './portfolio-trade.types.js';
import {
  usePortfolioTradesQuery,
  type PortfolioTradeLifecycle,
} from './portfolio-trade.queries.js';
import { accountDisplayLabel, type Account, type PortfolioMode } from './portfolio.types.js';
import {
  formatTradeDateTime,
  tradeExitProgressLabel,
  tradeLifecycleFilterLabel,
  tradeLifecycleLabel,
} from './portfolio-trade.display.js';
import { EmptyListState } from '../shared/EmptyStates.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';

const accountName = (accounts: Account[], accountId: string) =>
  accounts.find((account) => account.id === accountId)?.name ?? accountId;

export function PortfolioTradeView({
  mode,
  accounts,
  onReview,
}: {
  mode: PortfolioMode;
  accounts: Account[];
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [lifecycle, setLifecycle] = useState<PortfolioTradeLifecycle>('ALL');
  const [selectedTrade, setSelectedTrade] = useState<TradeSummaryResponseV2 | null>(null);
  const query = usePortfolioTradesQuery({
    mode,
    ...(accountId ? { accountId } : {}),
    symbol,
    lifecycle,
  });
  const trades = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const activeCount = trades.filter((trade) => trade.lifecycle === 'ACTIVE').length;
  const endedCount = trades.length - activeCount;
  const reviewCount = trades.filter(
    (trade) =>
      trade.excludedReasons.length > 0 || trade.issues.length > 0 || trade.costIssues.length > 0,
  ).length;
  const hasFilters = Boolean(accountId || symbol.trim() || lifecycle !== 'ALL');

  const clearFilters = () => {
    setAccountId('');
    setSymbol('');
    setLifecycle('ALL');
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="portfolio-trades-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="portfolio-trades-title" className="m-0 text-xl font-semibold">
            交易周期
          </h2>
          <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">
            只读查看统一交易投影。实际账户与模拟账户隔离，持仓快照、平仓记录和证据来源均可追溯。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          刷新交易
        </Button>
      </div>

      {query.isSuccess ? (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border px-4 py-3 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">已加载</dt>
            <dd className="m-0 font-semibold tabular-nums">{trades.length}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">进行中</dt>
            <dd className="m-0 font-semibold tabular-nums">{activeCount}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">已结束</dt>
            <dd className="m-0 font-semibold tabular-nums">{endedCount}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">需复核</dt>
            <dd className="m-0 font-semibold tabular-nums">{reviewCount}</dd>
          </div>
        </dl>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-border bg-muted/10 p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_auto]">
        <div className="flex flex-col gap-1 text-xs font-medium">
          账户范围
          <Select
            value={accountId || 'all'}
            onValueChange={(value) => setAccountId(value === 'all' ? '' : (value ?? ''))}
          >
            <SelectTrigger aria-label="交易账户范围" className="w-full bg-background">
              <SelectValue placeholder="全部账户">
                {selectedAccount ? accountDisplayLabel(selectedAccount) : '全部账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部账户</SelectItem>
                {accounts
                  .filter((account) => account.mode === mode)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {accountDisplayLabel(account)}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium">
          标的筛选
          <Input
            aria-label="交易标的筛选"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="例如 600519.SH"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium">
          生命周期
          <Select value={lifecycle} onValueChange={(value) => value && setLifecycle(value)}>
            <SelectTrigger aria-label="交易生命周期" className="w-full bg-background">
              <SelectValue>{tradeLifecycleFilterLabel(lifecycle)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">全部</SelectItem>
                <SelectItem value="ACTIVE">进行中</SelectItem>
                <SelectItem value="ENDED">已结束</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="self-end"
          disabled={!hasFilters}
          onClick={clearFilters}
        >
          清除筛选
        </Button>
      </div>

      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>交易列表读取失败</AlertTitle>
          <AlertDescription>
            当前交易投影未能读取，请检查服务状态后重试。
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void query.refetch()}
            >
              重试读取
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {query.isPending && (
        <div className="grid gap-2" role="status" aria-label="正在读取交易周期">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}
      {query.isSuccess && trades.length === 0 && (
        <EmptyListState
          className="rounded-lg border border-dashed py-8"
          title={hasFilters ? '没有匹配的交易周期' : '暂无交易周期'}
          description={
            hasFilters ? '调整或清除筛选后再查看。' : '录入成交后，交易周期会显示在这里。'
          }
        />
      )}
      {trades.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>标的</th>
                <th>账户</th>
                <th>开始 / 结束</th>
                <th>数量</th>
                <th>净实现盈亏</th>
                <th>状态</th>
                <StickyTableActionHeader>操作</StickyTableActionHeader>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id}>
                  <td>
                    <strong>{trade.assetName ?? trade.symbol}</strong>
                    <span className="text-xs text-muted-foreground">
                      {trade.assetName ? trade.symbol : '标的名称暂不可用'}
                    </span>
                  </td>
                  <td>{accountName(accounts, trade.accountId)}</td>
                  <td>
                    <span>{formatTradeDateTime(trade.openedAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTradeDateTime(trade.closedAt)}
                    </span>
                  </td>
                  <td>
                    <span>{trade.sourceQuantity}</span>
                    <span className="text-xs text-muted-foreground">
                      剩余 {trade.remainingQuantity}
                    </span>
                  </td>
                  <td className="font-mono">{trade.netRealizedPnl ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{tradeLifecycleLabel(trade.lifecycle)}</Badge>
                      <Badge variant="outline">{tradeExitProgressLabel(trade.exitProgress)}</Badge>
                      {trade.excludedReasons.length > 0 && <Badge variant="outline">需复核</Badge>}
                    </div>
                  </td>
                  <StickyTableActionCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="text-button"
                      onClick={() => setSelectedTrade(trade)}
                    >
                      查看详情
                    </Button>
                  </StickyTableActionCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? '正在加载…' : '加载更多'}
          </Button>
        </div>
      )}
      <PortfolioTradeDetailDialog
        trade={selectedTrade}
        accounts={accounts}
        mode={mode}
        open={Boolean(selectedTrade)}
        onOpenChange={(open) => !open && setSelectedTrade(null)}
        onReview={onReview}
      />
    </section>
  );
}
