import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { getDesktopApiClient } from '@/shared/api/client';
import { StickyTableActionCell, StickyTableActionHeader } from '../../shared/StickyTableActions.js';
import { JournalEmpty, JournalRequestError } from './JournalReviewFeedback.js';
import { evidenceLabel, reviewObjectLabels, reviewStatusLabels } from './journal-review-display.js';

export function JournalCandidateBrowser(props: JournalCandidateBrowserProps) {
  const {
    selectedId,
    onSelect,
    onResetFilter,
    client,
    filtered,
    queryKey,
    query,
    rows,
    legacy,
    instrumentLabel,
  } = useJournalCandidates(props);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium">复盘对象</h2>
      {query.isPending && <LoadingState label="正在读取复盘候选" />}
      {query.isError && (
        <JournalRequestError
          title="候选读取失败"
          error={query.error}
          retry={() => {
            void client.resetQueries({ queryKey, exact: true });
          }}
        />
      )}
      <ListRefreshRegion
        refreshing={query.isRefetching && query.data !== undefined}
        label="正在刷新复盘候选"
      >
        {rows.length === 0 && !query.isError && !query.isPending && (
          <JournalEmpty
            title={filtered ? '当前筛选下没有可复盘对象' : '没有可复盘对象'}
            description={
              filtered
                ? '调整筛选条件，或清空筛选查看该账户全部对象。'
                : '当前范围没有可读取的交易周期或减仓。'
            }
            action={
              filtered && onResetFilter ? (
                <Button variant="outline" onClick={onResetFilter}>
                  清空筛选
                </Button>
              ) : undefined
            }
          />
        )}
        {rows.length > 0 && (
          <Table className="min-w-[32rem]">
            <TableHeader>
              <TableRow>
                <TableHead>标的与粒度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>统计资格</TableHead>
                <StickyTableActionHeader className="w-28 min-w-28">操作</StickyTableActionHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.input.reference.reviewObjectId}
                  data-state={
                    selectedId === row.input.reference.reviewObjectId ? 'selected' : undefined
                  }
                >
                  <TableCell>
                    <p>{instrumentLabel(row.input.trade.symbol)}</p>
                    <p className="text-xs text-muted-foreground">
                      {reviewObjectLabels[row.input.reference.reviewObjectType]}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{reviewStatusLabels[row.reviewStatus]}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {row.statisticsEligibility.eligible
                      ? '符合资格'
                      : row.statisticsEligibility.reasons.map(evidenceLabel).join('；')}
                  </TableCell>
                  <StickyTableActionCell className="w-28 min-w-28 p-2 text-right align-middle whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={selectedId === row.input.reference.reviewObjectId}
                      onClick={() =>
                        onSelect(
                          row.input.reference.reviewObjectId,
                          instrumentLabel(row.input.trade.symbol),
                        )
                      }
                    >
                      {selectedId === row.input.reference.reviewObjectId ? '查看中' : '查看复盘'}
                    </Button>
                  </StickyTableActionCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListRefreshRegion>
      {query.hasNextPage && (
        <Button
          aria-busy={query.isFetchingNextPage}
          variant="outline"
          disabled={query.isFetchingNextPage || query.isError}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage && <Spinner data-icon="inline-start" aria-hidden="true" />}
          读取下一页
        </Button>
      )}
      {legacy.length > 0 && (
        <details>
          <summary className="cursor-pointer">旧 Journal 记录待确认（{legacy.length}）</summary>
          {legacy.map((row) => (
            <p className="mt-2 text-sm" key={row.journalEntry.id}>
              {row.journalEntry.symbol ? instrumentLabel(row.journalEntry.symbol) : '未知标的'} ·
              旧记录待确认 ·{' '}
              {row.reason === 'SELL_MAPPING_AMBIGUOUS' ? '减仓映射存在歧义' : '未找到对应减仓'}
            </p>
          ))}
          <p className="mt-2 text-sm text-muted-foreground">
            这些记录保留原始内容，尚未进入正式统计。
          </p>
        </details>
      )}
    </div>
  );
}

type JournalCandidateBrowserProps = {
  accountId: string;
  mode: 'actual' | 'shadow';
  symbol: string;
  window: { start: string; end: string };
  selectedId?: string | null;
  onSelect: (id: string, label?: string) => void;
  onResetFilter?: () => void;
};

function useJournalCandidates({
  accountId,
  mode,
  symbol,
  window,
  selectedId,
  onSelect,
  onResetFilter,
}: JournalCandidateBrowserProps) {
  const api = getDesktopApiClient().journalReviews;
  const client = useQueryClient();
  const filtered = Boolean(symbol || window.start || window.end);
  const queryKey = ['journal-review-candidates', accountId, mode, symbol, window];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.candidates(
        {
          accountId,
          mode,
          ...(symbol ? { symbol } : {}),
          limit: 30,
          ...(window.start ? { start: window.start } : {}),
          ...(window.end ? { end: window.end } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const legacy = query.data?.pages[0]?.legacyItems ?? [];
  const instrumentNames = new Map(
    query.data?.pages.flatMap((page) =>
      (page.instrumentDirectory?.items ?? []).map(
        (item) => [item.symbol.toUpperCase(), item.displayName] as const,
      ),
    ),
  );
  const instrumentLabel = (symbol: string) => {
    const name = instrumentNames.get(symbol.toUpperCase());
    return name ? `${name} · ${symbol}` : symbol;
  };
  return {
    selectedId,
    onSelect,
    onResetFilter,
    client,
    filtered,
    queryKey,
    query,
    rows,
    legacy,
    instrumentLabel,
  };
}
