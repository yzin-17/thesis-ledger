/** Market Reader 的消费者须接纳完整窗口合同；单窗 Schema 属于来源/构造边界。 */
export function marketWindowConsumerBoundaryViolation(file, source) {
  const consumer = /^apps\/server\/src\/(?:research|backtest)\//u.test(file) ||
    file === 'apps/server/src/market/market-derived-raw-window-v3.ts';
  if (!consumer) return null;
  if (/\bmarketDataBarSeries(?:RequestResponse|Response)V3Schema\s*\.\s*(?:safeParse|parse)\s*\(/u.test(source))
    return 'Market 窗口消费者必须复用完整证据解析器，不能用单窗口 Schema 误拒多窗口观测';
  return null;
}
