import type { MarketNewsResult, MarketNewsFeedResult } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/date-display';

const statusLabels = { available: '可用', partial: '部分覆盖', unavailable: '暂不可用' };
export const newsSourceLabels: Record<string, string> = {
  hithink: 'HiThink 同花顺',
  akshare: 'AKShare · 东方财富',
  'nvidia-news': 'NVIDIA 官方订阅',
  yfinance: 'Yahoo Finance 新闻',
  cls: '财联社',
  wallstreetcn: '华尔街见闻',
};
const reasonLabels: Record<string, string> = {
  issuer_feed_not_exhaustive: '官方订阅仅保留近期消息，不代表全市场或完整历史',
  search_first_page_not_exhaustive: '个股搜索仅返回近期第一页，不能确认区间内完整新闻',
  timeline_window_not_exhaustive: '个股新闻仅返回当前一页，不能确认区间内完整新闻',
  market_feed_first_page_not_exhaustive: '市场快讯仅返回近期一页，不代表完整历史，也不自动关联个股',
  provider_text_used_as_title: '部分标题取自来源原有快讯文本',
  pagination_truncated: '结果受到条数或订阅范围限制',
  published_time_unknown: '部分消息的发布时间未知',
  source_available_time_unknown: '来源首次可用时间未知',
  not_admitted: '该范围或时间窗口尚未准入',
  not_covered: '当前来源未覆盖该范围',
  rate_limited: '来源请求受限，请稍后再试',
  timeout: '来源读取超时，请稍后再试',
  service_unavailable: '新闻服务暂时不可用',
  upstream_failure: '新闻来源暂时无法读取',
};

export function NewsResult({
  result,
  heading,
}: {
  result: MarketNewsResult | MarketNewsFeedResult;
  heading: string;
}) {
  const { coverage } = result;
  return (
    <section aria-label="新闻检索结果" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{heading}</h3>
        <Badge variant="outline">{statusLabels[result.status]}</Badge>
        <span className="text-sm text-muted-foreground tabular-nums">
          {coverage.returnedCount} 条 · {coverage.uniqueEvidenceCount} 组独立证据
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        数据来源：
        {result.source ? (newsSourceLabels[result.source.providerId] ?? '已配置来源') : '未选定'}
        <br />
        发布时间范围：{formatDateTime(coverage.publishedStart)} 至{' '}
        {formatDateTime(coverage.publishedEnd)}
        <br />
        抓取时间：{formatDateTime(result.fetchedAt, '未知')}
      </p>
      {coverage.missingReasons.length > 0 && (
        <Alert>
          <AlertTitle>覆盖范围有缺口</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {coverage.missingReasons.map((reason) => (
                <li key={reason}>{reasonLabels[reason] ?? '来源未确认完整覆盖'}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {result.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>本次读取受限</AlertTitle>
          <AlertDescription>
            {result.errors
              .map((error) => reasonLabels[error.code] ?? '当前来源无法完成本次读取')
              .join('；')}
          </AlertDescription>
        </Alert>
      )}
      {result.items.length === 0 && (
        <p className="rounded-md border border-border p-4 text-muted-foreground">
          当前窗口没有可展示的新闻；这不代表该期间没有新闻。
        </p>
      )}
      <ol className="divide-y divide-border">
        {result.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 py-4 first:pt-0">
            <a
              className="block leading-relaxed underline underline-offset-4 break-words"
              href={item.originalUrl ?? item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.title}
            </a>
            <p className="text-sm text-muted-foreground">
              {item.publisher ?? '发布方未知'} · 发布于 {formatDateTime(item.publishedAt, '未知')}
            </p>
            <p className="text-xs text-muted-foreground">
              来源首次可用：{formatDateTime(item.sourceAvailableAt, '未知')} · 抓取于{' '}
              {formatDateTime(item.fetchedAt)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
