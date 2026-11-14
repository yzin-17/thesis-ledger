import type { MarketNewsResult, MarketNewsFeedResult } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { NewsResult } from './MarketNewsResult.js';

export function MarketNewsPages({ result, loading, hasNext, nextError, heading, onMore }: {
  result: MarketNewsResult | MarketNewsFeedResult | undefined;
  loading: boolean;
  hasNext: boolean;
  nextError: boolean;
  heading: string;
  onMore: () => void;
}) {
  if (!result) return loading ? <LoadingState label="正在读取新闻" /> : null;
  let moreLabel = '加载更多';
  if (loading) moreLabel = '正在加载…';
  else if (nextError) moreLabel = '重试加载';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <NewsResult result={result} heading={heading} refreshing={loading} hasMore={hasNext} />
      {nextError && <p role="alert" className="text-sm text-destructive">后续新闻加载失败，已加载内容已保留。可重试；分页失效时请重新查询。</p>}
      {hasNext && (
        <Button type="button" variant="outline" disabled={loading} onClick={onMore}>
          {loading && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {moreLabel}
        </Button>
      )}
      {!hasNext && result.status !== 'unavailable' && (
        <p role="status" className="text-xs text-muted-foreground">
          {result.coverage.complete ? '所选时间范围内的来源新闻已加载完毕。' : '已加载当前来源可提供的结果，完整性限制见上方说明。'}
        </p>
      )}
    </div>
  );
}
