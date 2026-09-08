import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  dataSourceDisplay,
  type DailyBarCacheStatus,
  type ProviderManifest,
} from './market-data.types.js';

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '尚无缓存';

export function MarketCachePanel({
  cache,
  providers,
  loading,
  error,
}: {
  cache: DailyBarCacheStatus | null;
  providers: ProviderManifest[];
  loading: boolean;
  error: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="m-0 text-xl font-semibold">本地日线缓存</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            相同范围优先读取本地缓存；手动刷新会重新请求 DSA。
          </p>
        </div>
        {error ? (
          <p className="text-sm text-destructive">缓存状态暂时无法读取。</p>
        ) : loading || !cache ? (
          <p className="text-sm text-muted-foreground">正在读取缓存状态…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-4">
                <span className="text-xs text-muted-foreground">日线记录</span>
                <strong className="mt-1 block text-2xl font-semibold">
                  {cache.barCount.toLocaleString('zh-CN')}
                </strong>
              </div>
              <div className="rounded-lg border border-border p-4">
                <span className="text-xs text-muted-foreground">已缓存标的</span>
                <strong className="mt-1 block text-2xl font-semibold">
                  {cache.symbolCount.toLocaleString('zh-CN')}
                </strong>
              </div>
              <div className="rounded-lg border border-border p-4">
                <span className="text-xs text-muted-foreground">最近市场日期</span>
                <strong className="mt-1 block text-sm font-semibold">
                  {dateTime(cache.latestMarketDate)}
                </strong>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">实际来源</span>
                <span className="text-xs text-muted-foreground">
                  最近写入 {dateTime(cache.updatedAt)}
                </span>
              </div>
              {cache.sources.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {cache.sources.map((source) => (
                    <Badge
                      key={`${source.provider}:${source.upstreamSource ?? 'unknown'}`}
                      variant="outline"
                    >
                      {dataSourceDisplay(source.provider, source.upstreamSource, providers)} ·{' '}
                      {source.count.toLocaleString('zh-CN')} 条
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">
                  尚无本地日线。首次读取成功后会自动写入。
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
