/** 当前市场状态只允许消费事实驱动的共享入口；历史回测保留独立日历输入。 */
export function marketSessionBoundaryViolation(file, source) {
  const liveServer = /^apps\/server\/src\/(?:market|automation|performance|risk|portfolio|watchlist)\//u.test(file);
  const client = /^apps\/(?:desktop|mobile)\/src\/features\//u.test(file);
  const projection = file === 'packages/domain/src/market-session.ts' || file === 'packages/domain/src/market-quote-session.ts';
  if (!liveServer && !client && !projection) return null;
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@thesis-ledger\/domain['"]/gu)];
  if (imports.some((entry) => /\b(?:cnTradingCalendar|hkTradingCalendar|usTradingCalendar|tradingCalendars|openTradingMarketsAt|CnTradingCalendar|HkTradingCalendar|UsTradingCalendar)\b/u.test(entry[1])))
    return '当前市场状态必须消费 MarketSessionReader/MarketService.getSession，不得旁路到内置年度日历';
  return null;
}
