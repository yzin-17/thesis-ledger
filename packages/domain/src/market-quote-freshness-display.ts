/** 只消费报价诊断；客户端不以抓取时间推断来源失败或冷却窗口。 */
type QuoteFreshnessData = {
  stale: boolean;
  freshness?: string | undefined;
  refreshFailure?: string | undefined;
  staleReason?: { code: string; message: string; httpStatus?: number | undefined } | undefined;
  marketTime: string | null;
  fetchedAt: string;
  sessionContext?: { session: string; latestTradingDate?: string | undefined; reason?: string | undefined } | undefined;
};

export function isMarketClosedSnapshot(quote: QuoteFreshnessData): boolean {
  return !quote.stale && quote.freshness !== 'stale' && quote.sessionContext?.session === 'closed_snapshot';
}

export function quoteFreshnessLabel(quote: QuoteFreshnessData): string {
  if (isMarketClosedSnapshot(quote)) return '休市快照';
  if (!quote.stale && quote.freshness !== 'stale') return '最新读取';
  if (quote.staleReason?.code === 'request_budget_cooldown' || !quote.staleReason && quote.refreshFailure === 'budget_cooldown') return '刷新冷却中';
  if (quote.staleReason?.code === 'market_time_aged') return '行情时点超限';
  if (quote.refreshFailure || quote.staleReason && ['timeout', 'rate_limited', 'unauthorized', 'permission_denied', 'invalid_response', 'source_unavailable', 'cache_unavailable', 'control_rejected', 'unknown'].includes(quote.staleReason.code)) return '刷新失败，保留旧数据';
  if (quote.stale || quote.freshness === 'stale') return '行情陈旧';
  return '最新读取';
}

function legacyReason(quote: QuoteFreshnessData): string {
  if (quote.refreshFailure === 'budget_cooldown') return '行情请求仍在 10 分钟冷却窗口内，本次未再次请求来源，当前展示上次可用数据。';
  if (quote.refreshFailure === 'cache_unavailable') return '行情缓存读取、写入或刷新锁不可用，当前展示上次可用数据。';
  if (quote.refreshFailure === 'fetch_failed') return '上次刷新失败，旧响应未记录细分错误，当前展示上次可用数据。';
  return '当前响应标记为陈旧，但缺少判定原因，请重新加载获取诊断。';
}

function displayTime(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '未提供';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(value));
}

export function quoteFreshnessExplanation(quote: QuoteFreshnessData): string | null {
  if (isMarketClosedSnapshot(quote)) {
    const day = quote.sessionContext?.latestTradingDate;
    return `当前休市，展示最近交易日${day ? `（${day}）` : ''}的来源快照。\n${quoteTimeLines(quote).join('\n')}`;
  }
  if (!quote.stale && quote.freshness !== 'stale') return null;
  const reason = quote.staleReason;
  const message = reason?.message ?? legacyReason(quote);
  const status = reason?.httpStatus ? `（HTTP ${reason.httpStatus}）` : '';
  return `${message}${status}\n${quoteTimeLines(quote).join('\n')}`;
}

export function quoteTimeLines(quote: Pick<QuoteFreshnessData, 'marketTime' | 'fetchedAt'>): string[] {
  return [`行情时间：${displayTime(quote.marketTime)}`, `抓取时间：${displayTime(quote.fetchedAt)}`];
}
