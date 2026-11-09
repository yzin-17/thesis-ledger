import type { CadenceCatalog } from './watchlist-source-cadence.js';
import { WatchlistTrend } from './WatchlistTrend.js';
import { WatchlistRange } from './WatchlistRange.js';
import { WatchlistSource } from './WatchlistSource.js';
import { Bookmark, Pin } from 'lucide-react';
import type {
  WatchlistChange,
  WatchlistItem,
  WatchlistPage,
  WatchlistPrice,
} from '@thesis-ledger/schemas';
import { watchlistPriceDisplay } from '@thesis-ledger/domain';
import { cn } from '@/lib/utils';
import { marketToneClass, marketToneForValue } from '@/ui/market-color';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { LoadingState } from '@/components/ui/spinner';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { StickyTableActionHeader, StickyTableActionCell } from '../shared/StickyTableActions.js';
import { WatchlistMenu } from './WatchlistMenu.js';

export function WatchlistTable({
  page,
  prices,
  mode,
  busy,
  refreshing,
  filtered,
  select,
  change,
  catalog,
  period = '1d',
  queryRoot = ['desktop', 'watchlist'],
}: {
  catalog?: CadenceCatalog;
  period?: '1m' | '1d';
  queryRoot?: readonly unknown[];
  page: WatchlistPage | undefined;
  prices: WatchlistPrice[] | undefined;
  mode: 'actual' | 'shadow';
  busy: boolean;
  refreshing: boolean;
  filtered: boolean;
  select: (item: WatchlistItem) => void;
  change: (op: WatchlistChange) => void;
}) {
  if (!page || page.items.length === 0) {
    if (!page && !refreshing) return null;
    return (
      <div className="rounded-md border">
        {refreshing ? (
          <LoadingState className="min-h-36" label={page ? '正在刷新自选' : '正在读取自选'} />
        ) : (
          <Empty className="min-h-36 p-5">
            <EmptyHeader>
              <Bookmark aria-hidden="true" className="mb-1 size-5 text-muted-foreground" />
              <EmptyTitle className="text-base">
                {filtered ? '当前筛选下没有标的' : '自选名单为空'}
              </EmptyTitle>
              <EmptyDescription>
                {filtered ? '可调整分组、市场或标的类型。' : '点击「添加标的」，按代码或名称搜索。'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }
  return (
    <Table
      className="table-fixed min-w-[56rem] max-sm:min-w-0 max-sm:table-auto"
      containerClassName="min-h-36"
      aria-label="自选标的"
      refreshing={refreshing}
      refreshAvoidText
      refreshLabel="正在刷新自选"
    >
      <TableHeader className="max-sm:sr-only">
        <TableRow>
          <TableHead className="w-44">标的</TableHead>
          <TableHead className="w-44 text-right">价格 / 净值</TableHead>
          <TableHead className="w-28 text-right">涨跌幅 / 涨跌额</TableHead>
          <TableHead className="w-44">走势</TableHead>
          <TableHead className="w-44">日内分时</TableHead>
          <StickyTableActionHeader className="w-14 min-w-14">
            操作
          </StickyTableActionHeader>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.items.map((item) => {
          const snap = prices?.find((p) => p.itemId === item.id);
          const value = watchlistPriceDisplay(snap?.price, snap?.quoteContext);
          const quote = snap?.price.kind === 'quote' ? snap.price.quote : undefined;
          const tone =
            quote && quote.previousClose > 0
              ? marketToneForValue(quote.price - quote.previousClose)
              : undefined;
          return (
            <TableRow
              key={item.id}
              className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto_2rem] max-sm:items-start max-sm:gap-x-2 max-sm:gap-y-1 max-sm:p-3 max-sm:[&>td]:border-0 [&>td]:align-top max-sm:[&>td]:p-0"
            >
              <TableCell className="max-sm:col-start-1 max-sm:row-start-1">
                <Button
                  variant="ghost"
                  className="h-auto min-w-0 max-w-full flex-col items-start gap-0.5 p-0 text-left text-foreground whitespace-normal"
                  onClick={() => select(item)}
                >
                  <strong className="flex items-center gap-1 text-sm leading-5">
                    {item.pinned && <Pin className="size-3" aria-label="置顶" />}
                    {item.displayName}
                  </strong>
                  <span className="mt-0 text-xs font-normal text-muted-foreground">
                    {item.instrument.canonicalCode}.{item.instrument.market}
                  </span>
                </Button>
                {snap?.held && (
                  <span className="block text-xs text-muted-foreground">
                    {mode === 'actual' ? '实际持有' : '模拟持有'}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right whitespace-normal font-medium text-foreground tabular-nums max-sm:col-span-3 max-sm:col-start-1 max-sm:row-start-2 max-sm:text-left">
                <span className="mr-1 inline text-xs font-normal text-muted-foreground sm:hidden">
                  {item.instrument.instrumentType === 'MUTUAL_FUND' ? '净值' : '价格'}
                </span>
                {value.value}
                <WatchlistSource
                  item={item}
                  snap={snap}
                  catalog={catalog}
                  className="mt-2 items-end font-normal max-sm:items-start"
                />
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums max-sm:col-start-2 max-sm:row-start-1 max-sm:text-xs',
                  marketToneClass(tone),
                )}
              >
                <span className="mr-1 inline text-muted-foreground sm:hidden">涨跌幅</span>
                {value.change}
                <span className="block text-xs text-inherit">{value.changeAmount}</span>
              </TableCell>
              <TableCell className="whitespace-normal max-sm:col-span-3 max-sm:row-start-3">
                <WatchlistTrend
                  item={item}
                  snap={snap}
                  period={period}
                  queryRoot={queryRoot}
                  catalog={catalog}
                  select={() => select(item)}
                />
              </TableCell>
              <TableCell className="whitespace-normal max-sm:col-span-3 max-sm:row-start-4">
                <div className="flex min-w-0 flex-col gap-1">
                  {item.instrument.instrumentType !== 'MUTUAL_FUND' && (
                    <WatchlistTrend
                      item={item}
                      snap={snap}
                      period="1m"
                      queryRoot={queryRoot}
                      catalog={catalog}
                      select={() => select(item)}
                    />
                  )}
                  <WatchlistRange snap={snap} />
                </div>
              </TableCell>
              <StickyTableActionCell className="w-14 min-w-14 px-2 max-sm:static max-sm:col-start-3 max-sm:row-start-1 max-sm:w-auto max-sm:min-w-0 max-sm:bg-transparent max-sm:before:hidden">
                <WatchlistMenu item={item} page={page} busy={busy} change={change} />
              </StickyTableActionCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
