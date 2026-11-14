/** Market Reader 的消费者须接纳完整窗口合同；单窗 Schema 属于来源/构造边界。 */
export function marketWindowConsumerBoundaryViolation(file, source) {
  const interactiveCache = /\bMarket(?:ChartResultCache|BarResultCacheStore)\b|market-(?:chart-result-cache|bar-result-cache-store)/u.test(source);
  const frozen = /market-(?:bar-reader-v3|frozen-window-reader-v3|event-free-reader)\.ts$/u.test(file);
  if (file.startsWith('apps/server/src/') && interactiveCache &&
      (!file.startsWith('apps/server/src/market/') || frozen))
    return '交互基础行情缓存只由Market交互读取消费，研究与冻结路径不得接入';
  const consumer = /^apps\/server\/src\/(?:research|backtest)\//u.test(file) ||
    file === 'apps/server/src/market/market-derived-raw-window-v3.ts';
  if (!consumer) return null;
  if (/\bmarketDataBarSeries(?:RequestResponse|Response)V3Schema\s*\.\s*(?:safeParse|parse)\s*\(/u.test(source))
    return 'Market 窗口消费者必须复用完整证据解析器，不能用单窗口 Schema 误拒多窗口观测';
  return null;
}
