/** 跨客户端的估值展示投影；只消费读取结果，不查询来源或改写快照。 */
type ValuationPosition = {
  marketPrice?: number | null | undefined;
  marketValue: number | null;
  stale: boolean;
  availabilityReason?: string | undefined;
};

export function valuationPositionLabel(position: ValuationPosition) {
  if (position.marketPrice === null || position.marketValue === null) return '未估值';
  if (position.stale) return '行情陈旧';
  return '已估值';
}

function missingValuationDescriptions(missing: readonly ValuationPosition[]): string[] {
  const descriptions: string[] = [];
  const reasons = new Set(missing.map((position) => position.availabilityReason));
  if (reasons.has('not_selected')) descriptions.push('持仓所需的行情或净值路由尚未配置。');
  if (reasons.has('disabled')) descriptions.push('持仓所需的行情或净值功能已关闭。');
  if (reasons.has('not_eligible')) descriptions.push('所选行情或净值来源当前不可用，请检查来源配置。');
  if (reasons.has('unavailable') || reasons.has(undefined)) descriptions.push('部分持仓价格暂不可用。');
  return descriptions;
}

export function portfolioValuationNotice(portfolio: {
  partial: boolean;
  positions: readonly ValuationPosition[];
  dataQuality?: { missingCurrencies?: readonly string[] | undefined } | undefined;
  fx?: { status?: string | undefined; stale?: boolean | undefined; fxStale?: boolean | undefined } | undefined;
  dailyChange?: { partial: boolean } | undefined;
}): { title: string; description: string } | null {
  const missing = portfolio.positions.filter((position) => valuationPositionLabel(position) === '未估值');
  const stale = portfolio.positions.some((position) => valuationPositionLabel(position) === '行情陈旧') ||
    portfolio.fx?.status === 'stale' || portfolio.fx?.stale || portfolio.fx?.fxStale;
  const descriptions = missingValuationDescriptions(missing);
  if (portfolio.dataQuality?.missingCurrencies?.length) descriptions.push('部分币种缺少可用汇率。');
  if (portfolio.partial && descriptions.length === 0) descriptions.push('部分估值数据暂不可用。');
  if (stale) descriptions.push('部分行情或汇率使用了陈旧数据。');
  if (portfolio.partial || missing.length > 0) {
    return { title: '估值不完整', description: descriptions.join('') + '缺失部分未计入完整估值。' };
  }
  if (stale) return { title: '行情陈旧', description: descriptions.join('') };
  if (portfolio.dailyChange?.partial) {
    return { title: '今日盈亏不完整', description: '部分持仓缺少前收盘价或前一日净值，今日盈亏暂不可完整计算。' };
  }
  return null;
}
