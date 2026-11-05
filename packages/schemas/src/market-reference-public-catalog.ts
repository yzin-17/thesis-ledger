import type { ReferenceColumn } from './market-reference-catalog.js';

type ColumnFactory = (
  key: string,
  label: string,
  format?: ReferenceColumn['format'],
  unit?: string | null,
) => ReferenceColumn;

// 已验公开来源资料的稳定列；外部协议由 DSA 拥有。
export function publicReferenceCatalog(c: ColumnFactory) {
  return {
    'repo-fr': {
      label: '回购定盘利率 FR',
      scope: 'market',
      dateFilter: 'date',
      columns: [
        c('date', '来源记录日', 'date', null),
        c('overnight', '隔夜', 'decimal', '%'),
        c('oneWeek', '七天', 'decimal', '%'),
        c('fortnight', '十四天', 'decimal', '%'),
      ],
    },
    'repo-fdr': {
      label: '银银间回购定盘利率 FDR',
      scope: 'market',
      dateFilter: 'date',
      columns: [
        c('date', '来源记录日', 'date', null),
        c('overnight', '隔夜', 'decimal', '%'),
        c('oneWeek', '七天', 'decimal', '%'),
        c('fortnight', '十四天', 'decimal', '%'),
      ],
    },
    'etf-shares-sh': {
      label: '上交所 ETF 份额',
      scope: 'etf',
      dateFilter: 'date',
      columns: [
        c('date', '规模快照日期', 'date', null),
        c('symbol', 'ETF 代码', 'text', null),
        c('name', '基金名称', 'text', null),
        c('shares10k', '份额', 'decimal', '万份'),
        c('category', '来源分类', 'text', null),
      ],
    },
    'etf-shares-sz': {
      label: '深交所 ETF 最新份额',
      scope: 'etf',
      dateFilter: null,
      columns: [
        c('date', '规模快照日期', 'date', null),
        c('symbol', 'ETF 代码', 'text', null),
        c('name', '基金名称', 'text', null),
        c('shares10k', '份额', 'decimal', '万份'),
        c('category', '来源分类', 'text', null),
      ],
    },
    'csi-index-members': {
      label: '中证沪深 300 成分',
      scope: 'index',
      dateFilter: null,
      columns: [
        c('date', '文件快照日期', 'date', null),
        c('symbol', '成分代码', 'text', null),
        c('name', '成分名称', 'text', null),
        c('exchange', '交易所', 'text', null),
      ],
    },
    'csi-index-weights': {
      label: '中证沪深 300 权重',
      scope: 'index',
      dateFilter: null,
      columns: [
        c('date', '文件快照日期', 'date', null),
        c('symbol', '成分代码', 'text', null),
        c('name', '成分名称', 'text', null),
        c('exchange', '交易所', 'text', null),
        c('weightPct', '权重', 'decimal', '%'),
      ],
    },
    'cni-index-members': {
      label: '国证深证成指成分',
      scope: 'index',
      dateFilter: null,
      columns: [
        c('date', '文件快照日期', 'date', null),
        c('symbol', '成分代码', 'text', null),
        c('name', '成分名称', 'text', null),
        c('exchange', '交易所', 'text', null),
      ],
    },
    'cni-index-weights': {
      label: '国证深证成指权重',
      scope: 'index',
      dateFilter: null,
      columns: [
        c('date', '文件快照日期', 'date', null),
        c('symbol', '成分代码', 'text', null),
        c('name', '成分名称', 'text', null),
        c('exchange', '交易所', 'text', null),
        c('weightPct', '权重', 'decimal', '%'),
      ],
    },
    'cctv-news': {
      label: '央视新闻联播元数据',
      scope: 'market',
      dateFilter: 'date',
      columns: [
        c('date', '节目日期', 'date', null),
        c('kind', '条目类型', 'text', null),
        c('title', '标题', 'text', null),
        c('url', '来源页面', 'url', null),
      ],
    },
    'sse-company-qna': {
      label: '沪市公司近期问答',
      scope: 'market',
      dateFilter: null,
      columns: [
        c('sourceId', '来源问答编号', 'text', null),
        c('symbol', '公司代码', 'text', null),
        c('name', '公司名称', 'text', null),
        c('question', '投资者提问', 'text', null),
        c('askedTime', '来源提问时间', 'text', null),
        c('answer', '公司回复', 'text', null),
        c('answeredTime', '来源回复时间', 'text', null),
      ],
    },
    'szse-company-qna': {
      label: '深市公司近期问答',
      scope: 'security',
      dateFilter: null,
      columns: [
        c('sourceId', '来源问答编号', 'text', null),
        c('symbol', '公司代码', 'text', null),
        c('name', '公司名称', 'text', null),
        c('question', '投资者提问', 'text', null),
        c('askedTime', '来源提问时间', 'text', null),
        c('answer', '公司回复', 'text', null),
        c('answeredTime', '来源回复时间', 'text', null),
      ],
    },
    'tdx-day-package': {
      label: '通达信盘后股票／ETF 快照',
      scope: 'market',
      dateFilter: 'date',
      columns: [
        c('date', '交易日', 'date', null),
        c('symbol', '证券代码', 'text', null),
        c('name', '证券名称', 'text', null),
        c('asset', '证券类别', 'text', null),
        c('open', '开盘价', 'decimal', 'CNY'),
        c('high', '最高价', 'decimal', 'CNY'),
        c('low', '最低价', 'decimal', 'CNY'),
        c('close', '收盘价', 'decimal', 'CNY'),
        c('volume', '成交数量', 'integer', '股／份'),
        c('amount', '成交金额', 'decimal', 'CNY'),
      ],
    },
    'ths-eps-consensus': {
      label: '同花顺来源 EPS 汇总',
      scope: 'security',
      dateFilter: null,
      columns: [
        c('year', '预测年度', 'integer', '年'),
        c('institutions', '来源预测机构数', 'integer', '家'),
        c('minimum', '预测最小值', 'decimal', '来源元／股'),
        c('mean', '预测均值', 'decimal', '来源元／股'),
        c('maximum', '预测最大值', 'decimal', '来源元／股'),
      ],
    },
    'ths-institution-eps': {
      label: '同花顺机构 EPS 预测',
      scope: 'security',
      dateFilter: null,
      columns: [
        c('institution', '预测机构', 'text', null),
        c('analyst', '研究员', 'text', null),
        c('reportDate', '报告日期', 'date', null),
        c('year', '预测年度', 'integer', '年'),
        c('eps', 'EPS 预测', 'decimal', '来源元／股'),
      ],
    },
    'ths-theme-reasons': {
      label: '同花顺编辑题材标签',
      scope: 'market',
      dateFilter: 'date',
      columns: [
        c('date', '来源记录日', 'date', null),
        c('symbol', '证券代码', 'text', null),
        c('name', '证券名称', 'text', null),
        c('reason', '来源编辑标签', 'text', null),
      ],
    },
    'pboc-social-financing': {
      label: '人民银行社融增量',
      scope: 'market',
      dateFilter: null,
      columns: [
        c('period', '统计月份', 'text', null),
        c('total', '社融增量', 'decimal', '亿元人民币'),
        c('rmbLoans', '人民币贷款', 'decimal', '亿元人民币'),
        c('fxLoansRmb', '外币贷款折人民币', 'decimal', '亿元人民币'),
        c('corporateBonds', '企业债券净融资', 'decimal', '亿元人民币'),
        c('governmentBonds', '政府债券净融资', 'decimal', '亿元人民币'),
        c('equity', '非金融企业境内股票融资', 'decimal', '亿元人民币'),
      ],
    },
    'nbs-pmi': {
      label: '统计局最新 PMI 公布',
      scope: 'market',
      dateFilter: null,
      columns: [
        c('period', '统计月份', 'text', null),
        c('publishedDate', '来源发布日期', 'date', null),
        c('manufacturing', '制造业 PMI', 'decimal', '指数点'),
        c('nonManufacturing', '非制造业商务活动指数', 'decimal', '指数点'),
        c('composite', '综合 PMI 产出指数', 'decimal', '指数点'),
      ],
    },
    'chinabond-curves': {
      label: '中债收益率曲线',
      scope: 'market',
      dateFilter: 'date',
      columns: [
        c('date', '来源记录日', 'date', null),
        c('curve', '曲线名称', 'text', null),
        c('threeMonths', '三个月', 'decimal', '%'),
        c('sixMonths', '六个月', 'decimal', '%'),
        c('oneYear', '一年', 'decimal', '%'),
        c('threeYears', '三年', 'decimal', '%'),
        c('fiveYears', '五年', 'decimal', '%'),
        c('sevenYears', '七年', 'decimal', '%'),
        c('tenYears', '十年', 'decimal', '%'),
        c('thirtyYears', '三十年', 'decimal', '%'),
      ],
    },
  } as const;
}

const indexInfo: Record<string, { code: string; label: string }> = {
  'index-members': { code: '000300', label: '沪深 300（000300）' },
  'csi-index-members': { code: '000300', label: '中证沪深 300（000300）' },
  'csi-index-weights': { code: '000300', label: '中证沪深 300（000300）' },
  'cni-index-members': { code: '399001', label: '国证深证成指（399001）' },
  'cni-index-weights': { code: '399001', label: '国证深证成指（399001）' },
};
export function marketReferenceIndexInfo(dataset: string) {
  return indexInfo[dataset] ?? null;
}
export const referenceSingleDayDatasets: readonly string[] = [
  'limit-up',
  'limit-break',
  'limit-down',
  'yesterday-limit',
  'etf-shares-sh',
  'cctv-news',
  'tdx-day-package',
  'ths-theme-reasons',
];

const symbolMarkets: Record<string, string> = {
  'etf-shares-sh': 'SH',
  'etf-shares-sz': 'SZ',
  'szse-company-qna': 'SZ',
};
export function marketReferenceSymbolMarket(dataset: string) {
  return symbolMarkets[dataset] ?? null;
}
