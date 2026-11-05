// 衍生品公开协议的精确来源修订。
export const derivativeReferenceSources = {
  'futures-daily-shfe': {
    providerId: 'akshare',
    upstreamSource: 'shfe-futures-public',
    sourceRevision: 'shfe-futures-public-v1',
  },
  'futures-daily-ine': {
    providerId: 'akshare',
    upstreamSource: 'ine-futures-public',
    sourceRevision: 'ine-futures-public-v1',
  },
  'futures-daily-czce': {
    providerId: 'akshare',
    upstreamSource: 'czce-futures-public',
    sourceRevision: 'czce-futures-public-v1',
  },
  'futures-daily-cffex': {
    providerId: 'akshare',
    upstreamSource: 'cffex-futures-public',
    sourceRevision: 'cffex-futures-public-v1',
  },
  'futures-daily-gfex': {
    providerId: 'akshare',
    upstreamSource: 'gfex-futures-public',
    sourceRevision: 'gfex-futures-public-v1',
  },
  'futures-rank-shfe': {
    providerId: 'akshare',
    upstreamSource: 'shfe-member-rank-public',
    sourceRevision: 'shfe-member-rank-public-v1',
  },
  'futures-rank-ine': {
    providerId: 'akshare',
    upstreamSource: 'ine-member-rank-public',
    sourceRevision: 'ine-member-rank-public-v1',
  },
  'futures-rank-czce': {
    providerId: 'akshare',
    upstreamSource: 'czce-member-rank-public',
    sourceRevision: 'czce-member-rank-public-v1',
  },
  'futures-rank-cffex': {
    providerId: 'akshare',
    upstreamSource: 'cffex-member-rank-public',
    sourceRevision: 'cffex-member-rank-public-v1',
  },
  'futures-quote': {
    providerId: 'akshare',
    upstreamSource: 'sina-futures-public-quote',
    sourceRevision: 'sina-futures-public-quote-v1',
  },
  'futures-kline': {
    providerId: 'akshare',
    upstreamSource: 'sina-futures-public-kline',
    sourceRevision: 'sina-futures-public-kline-v1',
  },
  'a50-source-quote': {
    providerId: 'akshare',
    upstreamSource: 'sina-a50-public-quote',
    sourceRevision: 'sina-a50-public-quote-v1',
  },
  'etf-option-contracts': {
    providerId: 'akshare',
    upstreamSource: 'sina-etf-option-public',
    sourceRevision: 'sina-etf-option-public-v1',
  },
  'etf-option-quote': {
    providerId: 'akshare',
    upstreamSource: 'sina-etf-option-public',
    sourceRevision: 'sina-etf-option-public-v1',
  },
  'etf-option-greeks': {
    providerId: 'akshare',
    upstreamSource: 'sina-etf-option-public',
    sourceRevision: 'sina-etf-option-public-v1',
  },
  'convertible-bond-reference': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney-convertible-reference',
    sourceRevision: 'eastmoney-convertible-reference-v1',
  },
} as const;
export const derivativeReferenceSourceNames: Record<string, string> = {
  'shfe-futures-public': '上期所官方日行情',
  'ine-futures-public': '上期能源官方日行情',
  'czce-futures-public': '郑商所官方日行情',
  'cffex-futures-public': '中金所官方日行情',
  'gfex-futures-public': '广期所官方日行情',
  'shfe-member-rank-public': '上期所官方会员排名',
  'ine-member-rank-public': '上期能源官方会员排名',
  'czce-member-rank-public': '郑商所官方会员排名',
  'cffex-member-rank-public': '中金所官方会员排名',
  'sina-futures-public-quote': '新浪国内期货',
  'sina-futures-public-kline': '新浪期货日线',
  'sina-a50-public-quote': '新浪 A50 来源报价',
  'sina-etf-option-public': '新浪 ETF 期权',
  'eastmoney-convertible-reference': '东方财富可转债',
};
