/** 已核对的公开文件引用；不声明完整规则或某笔成交的适用性。 */
export const shanghaiRuleReference = {
  title: '上交所交易规则（2026年修订）',
  version: '上证发〔2026〕41号',
  sourceUrl:
    'https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml',
  publishedOn: '2026-04-24',
  reviewedOn: '2026-10-21',
} as const;

export const hasShanghaiRuleReference = (symbol: string) => /^\d{6}\.SH$/.test(symbol);
