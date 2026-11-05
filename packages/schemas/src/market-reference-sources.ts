import {
  publicReferenceSources,
  publicReferenceSourceNames,
} from './market-reference-public-sources.js';
import {
  derivativeReferenceSources,
  derivativeReferenceSourceNames,
} from './market-reference-derivative-sources.js';

const sourceNames: Record<string, string> = {
  ...derivativeReferenceSourceNames,
  eastmoney: '东方财富',
  sina: '新浪财经',
  baostock: 'BaoStock',
  tencent: '腾讯财经',
  'wallstreetcn-macro-calendar': '华尔街见闻宏观日历',
  ...publicReferenceSourceNames,
};
export function marketReferenceSourceName(source: string): string {
  return sourceNames[source] ?? '资料来源';
}

// 本轮已接入资料的精确来源修订。
export const marketReferenceSources = {
  ...derivativeReferenceSources,
  ...publicReferenceSources,
  'bond-yields': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-bond-yields-v1',
  },
  'earnings-express': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'financial-balance': {
    providerId: 'akshare',
    upstreamSource: 'sina',
    sourceRevision: 'sina-original-finance-report-v1',
  },
  'financial-income': {
    providerId: 'akshare',
    upstreamSource: 'sina',
    sourceRevision: 'sina-original-finance-report-v1',
  },
  'financial-cashflow': {
    providerId: 'akshare',
    upstreamSource: 'sina',
    sourceRevision: 'sina-original-finance-report-v1',
  },
  margin: {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'holder-count': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'block-trade': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'earnings-forecast': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'holder-trades': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  buyback: {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'institution-survey': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'dragon-tiger': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'lpr-history': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'macro-gdp': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  'macro-pmi': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-reference-events-v1',
  },
  concepts: {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },

  'fund-flow': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },
  'stock-monitor': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },
  'limit-up': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },
  'limit-break': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },
  'limit-down': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },
  'yesterday-limit': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-market-reference-v1',
  },

  'global-news': {
    providerId: 'akshare',
    upstreamSource: 'eastmoney',
    sourceRevision: 'eastmoney-global-news-reference-v1',
  },
  'macro-calendar': {
    providerId: 'wallstreetcn',
    upstreamSource: 'wallstreetcn-macro-calendar',
    sourceRevision: 'wallstreetcn-macro-calendar-v1',
  },
  'index-members': {
    providerId: 'akshare',
    upstreamSource: 'sina',
    sourceRevision: 'sina-current-index-members-v1',
  },
  ticks: {
    providerId: 'tencent',
    upstreamSource: 'tencent',
    sourceRevision: 'tencent-aggregated-ticks-v1',
  },
  'etf-ticks': {
    providerId: 'tencent',
    upstreamSource: 'tencent',
    sourceRevision: 'tencent-aggregated-ticks-v1',
  },
  'valuation-history': {
    providerId: 'baostock',
    upstreamSource: 'baostock',
    sourceRevision: 'baostock-reference-valuation-v1',
  },
} as const;
