// 精确发布来源与本轮公开协议修订。
export const publicReferenceSources = {
  'repo-fr': {
    providerId: 'akshare',
    upstreamSource: 'chinamoney-repo-fixing',
    sourceRevision: 'chinamoney-repo-fixing-v1',
  },
  'repo-fdr': {
    providerId: 'akshare',
    upstreamSource: 'chinamoney-repo-fixing',
    sourceRevision: 'chinamoney-repo-fixing-v1',
  },
  'etf-shares-sh': {
    providerId: 'akshare',
    upstreamSource: 'sse-etf-shares',
    sourceRevision: 'sse-etf-shares-v1',
  },
  'etf-shares-sz': {
    providerId: 'akshare',
    upstreamSource: 'szse-etf-shares',
    sourceRevision: 'szse-etf-shares-v1',
  },
  'csi-index-members': {
    providerId: 'akshare',
    upstreamSource: 'csindex-official',
    sourceRevision: 'csindex-official-v1',
  },
  'csi-index-weights': {
    providerId: 'akshare',
    upstreamSource: 'csindex-official',
    sourceRevision: 'csindex-official-v1',
  },
  'cni-index-members': {
    providerId: 'akshare',
    upstreamSource: 'cnindex-official',
    sourceRevision: 'cnindex-official-v1',
  },
  'cni-index-weights': {
    providerId: 'akshare',
    upstreamSource: 'cnindex-official',
    sourceRevision: 'cnindex-official-v1',
  },
  'cctv-news': {
    providerId: 'akshare',
    upstreamSource: 'cctv-news-metadata',
    sourceRevision: 'cctv-news-metadata-v1',
  },
  'sse-company-qna': {
    providerId: 'akshare',
    upstreamSource: 'sse-interaction',
    sourceRevision: 'sse-interaction-v1',
  },
  'szse-company-qna': {
    providerId: 'akshare',
    upstreamSource: 'cninfo-interaction',
    sourceRevision: 'cninfo-interaction-v1',
  },
  'tdx-day-package': {
    providerId: 'pytdx',
    upstreamSource: 'tdx-http-package',
    sourceRevision: 'tdx-http-package-v1',
  },
  'ths-eps-consensus': {
    providerId: 'hithink',
    upstreamSource: 'ths-public-forecast',
    sourceRevision: 'ths-public-forecast-v1',
  },
  'ths-institution-eps': {
    providerId: 'hithink',
    upstreamSource: 'ths-public-forecast',
    sourceRevision: 'ths-public-forecast-v1',
  },
  'ths-theme-reasons': {
    providerId: 'hithink',
    upstreamSource: 'ths-editorial-themes',
    sourceRevision: 'ths-editorial-themes-v1',
  },
  'pboc-social-financing': {
    providerId: 'akshare',
    upstreamSource: 'pboc-social-financing',
    sourceRevision: 'pboc-social-financing-v1',
  },
  'nbs-pmi': {
    providerId: 'akshare',
    upstreamSource: 'nbs-pmi-release',
    sourceRevision: 'nbs-pmi-release-v1',
  },
  'chinabond-curves': {
    providerId: 'akshare',
    upstreamSource: 'chinabond-yield-curves',
    sourceRevision: 'chinabond-yield-curves-v1',
  },
} as const;
export const publicReferenceSourceNames: Record<string, string> = {
  'chinamoney-repo-fixing': '中国货币网',
  'sse-etf-shares': '上交所 ETF 规模',
  'szse-etf-shares': '深交所 ETF 规模',
  'csindex-official': '中证指数',
  'cnindex-official': '国证指数',
  'cctv-news-metadata': '央视网',
  'sse-interaction': '上证 e 互动',
  'cninfo-interaction': '互动易',
  'tdx-http-package': '通达信官网盘后包',
  'ths-public-forecast': '同花顺公开盈利预测',
  'ths-editorial-themes': '同花顺编辑题材',
  'pboc-social-financing': '中国人民银行',
  'nbs-pmi-release': '国家统计局',
  'chinabond-yield-curves': '中债收益率曲线',
};
