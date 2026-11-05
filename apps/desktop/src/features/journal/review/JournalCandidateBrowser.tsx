import { useState, type ReactNode } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { JournalCandidateWindowFilter } from './JournalCandidateWindowFilter.js';
import { getDesktopApiClient } from '@/shared/api/client';
import { StickyTableActionCell, StickyTableActionHeader } from '../../shared/StickyTableActions.js';
import { JournalEmpty, JournalRequestError } from './JournalReviewFeedback.js';
import { evidenceLabel, reviewObjectLabels, reviewStatusLabels } from './journal-review-display.js';

export function JournalCandidateBrowser({
  accountId,
  mode,
  symbol,
  selectedId,
  onSelect,
  onWindowApplied,
  selectionPrompt,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  symbol: string;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onWindowApplied: () => void;
  selectionPrompt?: ReactNode;
}) {
  const api = getDesktopApiClient().journalReviews;
  const client = useQueryClient();
  const [window, setWindow] = useState({ start: '', end: '' });
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
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">复盘对象</h2>
          <p className="text-xs text-muted-foreground">完整交易周期与单次减仓分别复盘</p>
        </div>
      </div>
      <JournalCandidateWindowFilter accountId={accountId} mode={mode} window={window}
        onApply={(nextWindow) => { setWindow(nextWindow); onWindowApplied(); }} />
      {query.isPending && <Skeleton className="h-40 w-full" />}
      {query.isError && (
        <JournalRequestError
          title="候选读取失败"
          error={query.error}
          retry={() => {
            void client.resetQueries({ queryKey, exact: true });
          }}
        />
      )}
      {rows.length === 0 && !query.isError && !query.isPending && (
        <JournalEmpty
          title="没有可复盘对象"
          description="当前范围没有可读取的交易周期或减仓。只有持仓或基线观察时，历史成交证据仍可能不足。"
        />
      )}
      {rows.length > 0 && (
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow>
              <TableHead>标的与粒度</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>统计资格</TableHead>
              <StickyTableActionHeader className="h-10 w-28 min-w-28 px-2 align-middle font-medium whitespace-nowrap">
                选择
              </StickyTableActionHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.input.reference.reviewObjectId}
                data-state={selectedId === row.input.reference.reviewObjectId ? 'selected' : undefined}
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
                    onClick={() => onSelect(row.input.reference.reviewObjectId)}
                  >
                    {selectedId === row.input.reference.reviewObjectId ? '已选择' : '选择对象'}
                  </Button>
                </StickyTableActionCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage || query.isError}
          onClick={() => void query.fetchNextPage()}
        >
          读取下一页
        </Button>
      )}
      {rows.length > 0 && !query.isError && !query.isPending && selectionPrompt}
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
