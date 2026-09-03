import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TradeSummaryResponseV2 } from '@thesis-ledger/api-client';
import { PortfolioTradeDetailSheet } from './PortfolioTradeDetailSheet.js';
import type { PortfolioTradeReviewTarget } from './PortfolioTradeDetailSheet.js';
import {
  usePortfolioTradesQuery,
  type PortfolioTradeLifecycle,
} from './portfolio-trade.queries.js';
import type { Account, PortfolioMode } from './portfolio.types.js';

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '—';

const lifecycleLabel = (value: TradeSummaryResponseV2['lifecycle']) =>
  value === 'ACTIVE' ? '进行中' : '已结束';

const exitProgressLabel = (value: TradeSummaryResponseV2['exitProgress']) => {
  if (value === 'FULL') return '全部平仓';
  if (value === 'PARTIAL') return '部分平仓';
  return '未平仓';
};

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

  return (
    <section className="flex flex-col gap-4" aria-labelledby="portfolio-trades-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Trade Projection</p>
          <h2 id="portfolio-trades-title" className="m-0 text-xl font-semibold">
            交易周期
          </h2>
          <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">
            这里只读展示统一 Trade
            Projection。实际账户与模拟账户隔离，持仓快照、平仓片段和证据来源均可追溯。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          刷新交易
        </Button>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-muted/10 p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_10rem]">
        <div className="flex flex-col gap-1 text-xs font-medium">
          账户范围
          <Select
            value={accountId || 'all'}
            onValueChange={(value) => setAccountId(value === 'all' ? '' : (value ?? ''))}
          >
            <SelectTrigger aria-label="交易账户范围" className="w-full bg-background">
              <SelectValue placeholder="全部账户">
                {selectedAccount?.name ?? '全部账户'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部账户</SelectItem>
                {accounts
                  .filter((account) => account.mode === mode)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
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
              <SelectValue>
                {lifecycle === 'ACTIVE' ? '进行中' : lifecycle === 'ENDED' ? '已结束' : '全部'}
              </SelectValue>
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
      </div>

      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>交易列表读取失败</AlertTitle>
          <AlertDescription>
            当前 Trade Projection 未能读取，请检查服务状态后重试。
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
        <p
          className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
          role="status"
        >
          正在读取交易周期…
        </p>
      )}
      {query.isSuccess && trades.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          当前账户范围没有符合筛选条件的 Trade。
        </p>
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
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id}>
                  <td>
                    <strong>{trade.symbol}</strong>
                    <span className="font-mono text-xs text-muted-foreground">{trade.id}</span>
                  </td>
                  <td>{accountName(accounts, trade.accountId)}</td>
                  <td>
                    <span>{formatDateTime(trade.openedAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(trade.closedAt)}
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
                      <Badge variant="secondary">{lifecycleLabel(trade.lifecycle)}</Badge>
                      <Badge variant="outline">{exitProgressLabel(trade.exitProgress)}</Badge>
                      {trade.excludedReasons.length > 0 && <Badge variant="outline">需复核</Badge>}
                    </div>
                  </td>
                  <td>
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => setSelectedTrade(trade)}
                    >
                      查看详情
                    </Button>
                  </td>
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
      <PortfolioTradeDetailSheet
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
