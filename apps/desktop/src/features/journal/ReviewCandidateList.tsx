import { SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { JournalLegacyReviewCandidate, JournalReviewCandidate } from './journal.types.js';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value));

const formatMoney = (value: number | null) =>
  value === null
    ? '证据不足'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

const pnlClass = (value: number | null) => {
  if (value === null) return 'text-muted-foreground';
  return value >= 0 ? 'text-positive' : 'text-negative';
};

const objectLabel = (candidate: JournalReviewCandidate) =>
  candidate.reviewObjectType === 'TRADE_CYCLE' ? '完整交易' : '减仓片段';

const completenessLabel = (value: JournalReviewCandidate['evidenceCompleteness']) => {
  if (value === 'complete') return '证据完整';
  if (value === 'partial') return '计划部分缺失';
  return '仅有实际交易';
};

const completenessVariant = (value: JournalReviewCandidate['evidenceCompleteness']) => {
  if (value === 'complete') return 'default' as const;
  if (value === 'partial') return 'secondary' as const;
  return 'outline' as const;
};

export function ReviewCandidateList({
  candidates,
  legacyItems = [],
  selectedId,
  filter,
  onFilterChange,
  onSelect,
  loading,
  emptyDescription = '当前账户还没有可以复盘的已平仓交易。',
  startDate = '',
  endDate = '',
  onStartDateChange,
  onEndDateChange,
}: {
  candidates: JournalReviewCandidate[];
  legacyItems?: JournalLegacyReviewCandidate[] | undefined;
  selectedId?: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect?: (candidate: JournalReviewCandidate) => void;
  loading?: boolean;
  emptyDescription?: string;
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (value: string) => void;
  onEndDateChange?: (value: string) => void;
}) {
  const normalizedFilter = filter.trim().toUpperCase();
  const visibleCandidates = normalizedFilter
    ? candidates.filter((candidate) => candidate.symbol.toUpperCase().includes(normalizedFilter))
    : candidates;
  let content;
  if (loading) {
    content = (
      <div className="flex flex-col gap-2 p-2" aria-label="正在加载交易" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  } else if (visibleCandidates.length === 0) {
    content = (
      <Empty className="min-h-48 border-0 p-6">
        <EmptyHeader>
          <EmptyTitle>{normalizedFilter ? '没有匹配交易' : '暂无已平仓交易'}</EmptyTitle>
          <EmptyDescription>
            {normalizedFilter ? '换一个标的代码试试。' : emptyDescription}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <div className="flex max-h-[30rem] flex-col gap-1 overflow-y-auto" role="list">
        {visibleCandidates.map((candidate) => (
          <Button
            key={candidate.id}
            type="button"
            variant="ghost"
            className="h-auto justify-start px-3 py-3 text-left whitespace-normal"
            data-selected={selectedId === candidate.id}
            aria-pressed={selectedId === candidate.id}
            onClick={() => onSelect?.(candidate)}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center justify-between gap-3">
                <strong className="truncate font-medium">{candidate.symbol}</strong>
                <span className={pnlClass(candidate.pnl)}>
                  {candidate.pnl !== null && candidate.pnl >= 0 ? '+' : ''}
                  {formatMoney(candidate.pnl)}
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {formatDate(candidate.entryAt)} → {formatDate(candidate.exitAt)}
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  <Badge variant="outline">{objectLabel(candidate)}</Badge>
                  <Badge variant={completenessVariant(candidate.evidenceCompleteness)}>
                    {completenessLabel(candidate.evidenceCompleteness)}
                  </Badge>
                  {candidate.stale && <Badge variant="destructive">投影已过期</Badge>}
                </span>
              </span>
            </span>
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Card className="min-w-0 shadow-none">
        <CardHeader className="gap-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>已平仓交易</CardTitle>
              <CardDescription>从 Ledger 读取，不会自动写入任何记录。</CardDescription>
            </div>
            <Badge variant="outline">{candidates.length} 笔</Badge>
          </div>
          <div className="relative block">
            <span className="sr-only">按标的筛选</span>
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              className="pl-9"
              placeholder="搜索标的代码"
              aria-label="按标的筛选"
            />
          </div>
          {(onStartDateChange || onEndDateChange) && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>开始日期</span>
                <DateInput
                  type="date"
                  value={startDate}
                  onChange={(event) => onStartDateChange?.(event.target.value)}
                  aria-label="按开始日期筛选"
                />
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>结束日期</span>
                <DateInput
                  type="date"
                  value={endDate}
                  onChange={(event) => onEndDateChange?.(event.target.value)}
                  aria-label="按结束日期筛选"
                />
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-2">{content}</CardContent>
      </Card>
      {legacyItems.length > 0 && (
        <Card className="min-w-0 border-dashed shadow-none">
          <CardHeader>
            <CardTitle className="text-base">旧复盘引用待确认</CardTitle>
            <CardDescription>
              以下 Journal 引用无法唯一对应当前 Close Slice，不会按标的或日期自动猜测。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {legacyItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <span>
                  {item.symbol ?? '未知标的'} · {item.journalEntryId.slice(0, 8)}
                </span>
                <Badge variant="outline">人工确认</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
