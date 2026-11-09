import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { TableContainer, TableHeader, TableHead } from '@/components/ui/table';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TradeSummaryResponse } from '@thesis-ledger/api-client';
import { PortfolioTradeDetailDialog } from './PortfolioTradeDetailDialog.js';
import type { PortfolioTradeReviewTarget } from './portfolio-trade.types.js';
import {
  usePortfolioTradesQuery,
  usePortfolioTradeInstrumentsQuery,
  type PortfolioTradeLifecycle,
} from './portfolio-trade.queries.js';
import type { Account, PortfolioMode } from './portfolio.types.js';
import { PortfolioAccountFilter } from './PortfolioAccountFilter.js';
import { PortfolioTradeInstrumentFilter } from './PortfolioTradeInstrumentFilter.js';
import { useManagedAccountsQuery } from './portfolio.queries.js';
import { cn } from '@/lib/utils';
import {
  formatTradeDateTime,
  tradeExitProgressLabel,
  tradeLifecycleFilterLabel,
  tradeLifecycleLabel,
} from './portfolio-trade.display.js';
import { EmptyListState } from '../shared/EmptyStates.js';
import { StickyTableActionCell, StickyTableActionHeader } from '../shared/StickyTableActions.js';

const accountName = (accounts: Account[], accountId: string) =>
  accounts.find((account) => account.id === accountId)?.name ?? '账户名称暂不可用';

export function PortfolioTradeView({
  mode,
  accounts,
  accountScope,
  onReview,
}: {
  mode: PortfolioMode;
  accounts: Account[];
  accountScope?: { accountId: string; onChange: (accountId: string) => void };
  onReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  const managedAccountsQuery = useManagedAccountsQuery(true);
  const displayAccounts = useMemo(
    () => [...accounts, ...(managedAccountsQuery.data ?? [])],
    [accounts, managedAccountsQuery.data],
  );
  const [localAccountId, setLocalAccountId] = useState('');
  const accountId = accountScope?.accountId ?? localAccountId;
  const setAccountId = accountScope?.onChange ?? setLocalAccountId;
  const [symbolSelection, setSymbolSelection] = useState({ mode, accountId, symbol: '' });
  const [lifecycle, setLifecycle] = useState<PortfolioTradeLifecycle>('ALL');
  const [selectedTrade, setSelectedTrade] = useState<TradeSummaryResponse | null>(null);
  const selectedAccount = accounts.find(
    (account) => account.id === accountId && account.mode === mode && account.active !== false,
  );
  const effectiveAccountId = selectedAccount?.id ?? '';
  const instrumentsQuery = usePortfolioTradeInstrumentsQuery(mode, effectiveAccountId);
  const selectedInstrument = instrumentsQuery.data?.items.find((item) =>
    symbolSelection.mode === mode && symbolSelection.accountId === effectiveAccountId && item.symbol === symbolSelection.symbol,
  );
  const symbol = selectedInstrument?.symbol ?? '';
  const setSymbol = (nextSymbol: string) => setSymbolSelection({ mode, accountId: effectiveAccountId, symbol: nextSymbol });
  useEffect(() => {
    setSymbolSelection((current) => {
      if (current.mode !== mode || current.accountId !== effectiveAccountId ||
        (instrumentsQuery.data && current.symbol && !instrumentsQuery.data.items.some((item) => item.symbol === current.symbol))) {
        return { mode, accountId: effectiveAccountId, symbol: '' };
      }
      return current;
    });
  }, [mode, effectiveAccountId, instrumentsQuery.data]);
  const effectiveSelectedTrade =
    selectedTrade?.accountMode === mode &&
    (!effectiveAccountId || selectedTrade.accountId === effectiveAccountId)
      ? selectedTrade
      : null;
  useEffect(() => {
    if (accountId && !effectiveAccountId) setAccountId('');
  }, [accountId, effectiveAccountId, setAccountId]);
  useEffect(() => {
    if (selectedTrade && !effectiveSelectedTrade) setSelectedTrade(null);
  }, [effectiveSelectedTrade, selectedTrade]);

  const query = usePortfolioTradesQuery({
    mode,
    ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
    symbol,
    lifecycle,
  });
  const trades = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const activeCount = trades.filter((trade) => trade.lifecycle === 'ACTIVE').length;
  const endedCount = trades.length - activeCount;
  const reviewCount = trades.filter(
    (trade) =>
      trade.excludedReasons.length > 0 || trade.issues.length > 0 || trade.costIssues.length > 0,
  ).length;
  const hasFilters = Boolean((!accountScope && effectiveAccountId) || symbol.trim() || lifecycle !== 'ALL');

  const clearFilters = () => {
    if (!accountScope) setLocalAccountId('');
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
        </div>
      </div>

        <dl aria-busy={query.isPending} className="m-0 flex min-h-5 flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">已加载</dt>
            <dd className="m-0 min-w-4 font-semibold tabular-nums">{query.isSuccess ? trades.length : '—'}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">进行中</dt>
            <dd className="m-0 min-w-4 font-semibold tabular-nums">{query.isSuccess ? activeCount : '—'}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">已结束</dt>
            <dd className="m-0 min-w-4 font-semibold tabular-nums">{query.isSuccess ? endedCount : '—'}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">需复核</dt>
            <dd className="m-0 min-w-4 font-semibold tabular-nums">{query.isSuccess ? reviewCount : '—'}</dd>
          </div>
        </dl>

      <div className={cn(
        'grid gap-3',
        accountScope
          ? 'md:grid-cols-[minmax(12rem,1fr)_10rem_auto]'
          : 'md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_auto]',
      )}>
        {!accountScope && (
          <PortfolioAccountFilter
            accounts={accounts}
            mode={mode}
            accountId={effectiveAccountId}
            onAccountChange={setAccountId}
            label="交易账户范围"
          />
        )}
        <PortfolioTradeInstrumentFilter
          items={instrumentsQuery.data?.items ?? []}
          symbol={symbol}
          loading={instrumentsQuery.isPending}
          unavailable={instrumentsQuery.isError && !instrumentsQuery.data}
          onChange={setSymbol}
        />
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
        <LoadingState label="正在读取交易周期" />
      )}
      <ListRefreshRegion refreshing={query.isRefetching && query.data !== undefined} label="正在刷新交易周期">
        {query.isSuccess && trades.length === 0 && (
          <EmptyListState
            className="rounded-md border border-border py-8"
            title={hasFilters ? '没有匹配的交易周期' : '暂无交易周期'}
            description={
              hasFilters ? '调整或清除筛选后再查看。' : '录入成交后，交易周期会显示在这里。'
            }
          />
        )}
        {trades.length > 0 && (
          <TableContainer>
            <table>
              <TableHeader>
                <tr>
                  <TableHead>标的</TableHead>
                  <TableHead className="text-left">账户</TableHead>
                  <TableHead>开始 / 结束</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">净实现盈亏</TableHead>
                  <TableHead>状态</TableHead>
                  <StickyTableActionHeader>操作</StickyTableActionHeader>
                </tr>
              </TableHeader>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id}>
                    <td>
                      <strong>{trade.assetName ?? trade.symbol}</strong>
                      <span className="text-xs text-muted-foreground">
                        {trade.assetName ? trade.symbol : '标的名称暂不可用'}
                      </span>
                    </td>
                    <td className="text-left">{accountName(displayAccounts, trade.accountId)}</td>
                    <td>
                      <span>{formatTradeDateTime(trade.openedAt)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTradeDateTime(trade.closedAt)}
                      </span>
                    </td>
                    <td className="text-right">
                      <span>{trade.sourceQuantity}</span>
                      <span className="text-xs text-muted-foreground">
                        剩余 {trade.remainingQuantity}
                      </span>
                    </td>
                    <td className="text-right font-mono">{trade.netRealizedPnl ?? '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {tradeLifecycleLabel(trade.lifecycle)} · {tradeExitProgressLabel(trade.exitProgress)}
                        </Badge>
                        {trade.excludedReasons.length > 0 && <Badge variant="secondary">需复核</Badge>}
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
          </TableContainer>
        )}
      </ListRefreshRegion>
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            aria-busy={query.isFetchingNextPage}
            type="button"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {query.isFetchingNextPage ? '正在加载…' : '加载更多'}
          </Button>
        </div>
      )}
      <PortfolioTradeDetailDialog
        trade={effectiveSelectedTrade}
        accounts={displayAccounts}
        mode={mode}
        open={Boolean(effectiveSelectedTrade)}
        onOpenChange={(open) => !open && setSelectedTrade(null)}
        onReview={onReview}
      />
    </section>
  );
}
