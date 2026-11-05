import { publicReferenceCatalog } from './market-reference-public-catalog.js';
import { derivativeReferenceCatalog } from './market-reference-derivative-catalog.js';
export {
  marketReferenceIndexInfo,
  marketReferenceSymbolMarket,
  referenceSingleDayDatasets,
} from './market-reference-public-catalog.js';

// 市场资料的稳定列定义；与 DSA 同名合同保持逐字段一致。
export type ReferenceFormat = 'text' | 'decimal' | 'integer' | 'date' | 'datetime' | 'url';
export type ReferenceColumn = {
  key: string;
  label: string;
  format: ReferenceFormat;
  unit: string | null;
};
type Definition = {
  label: string;
  scope: 'security' | 'etf' | 'market' | 'index' | 'future' | 'option';
  dateFilter: string | null;
  columns: readonly ReferenceColumn[];
};
function c(
  key: string,
  label: string,
  format: ReferenceFormat = 'text',
  unit: string | null = null,
): ReferenceColumn {
  return { key, label, format, unit };
}
export const marketReferenceCatalog = {
  ...derivativeReferenceCatalog(c),
  ...publicReferenceCatalog(c),
  'bond-yields': {
    label: '中美国债收益率来源记录',
    scope: 'market',
    dateFilter: 'date',
    columns: [
      c('date', '来源记录日', 'date'),
      c('china2y', '中国两年期', 'decimal', '%'),
      c('china5y', '中国五年期', 'decimal', '%'),
      c('china10y', '中国十年期', 'decimal', '%'),
      c('china30y', '中国三十年期', 'decimal', '%'),
      c('us2y', '美国两年期', 'decimal', '%'),
      c('us5y', '美国五年期', 'decimal', '%'),
      c('us10y', '美国十年期', 'decimal', '%'),
      c('us30y', '美国三十年期', 'decimal', '%'),
    ],
  },
  'earnings-express': {
    label: '业绩快报',
    scope: 'security',
    dateFilter: 'publishedDate',
    columns: [
      c('publishedDate', '公告日', 'date'),
      c('period', '报告期', 'date'),
      c('revenue', '营业收入', 'decimal', 'CNY'),
      c('parentProfit', '归母净利润', 'decimal', 'CNY'),
      c('basicEps', '基本每股收益', 'decimal', 'CNY/股'),
    ],
  },
  'valuation-history': {
    label: '估值历史',
    scope: 'security',
    dateFilter: 'date',
    columns: [
      c('date', '交易日', 'date', null),
      c('peTtm', '市盈率 TTM', 'decimal', '倍'),
      c('pbMrq', '市净率 MRQ', 'decimal', '倍'),
      c('psTtm', '市销率 TTM', 'decimal', '倍'),
      c('pcfTtm', '市现率 TTM', 'decimal', '倍'),
      c('turnoverPct', '换手率', 'decimal', '%'),
    ],
  },
  'financial-balance': {
    label: '资产负债表',
    scope: 'security',
    dateFilter: null,
    columns: [
      c('period', '报告期', 'date', null),
      c('publishedDate', '披露日', 'date', null),
      c('basis', '来源报表类型', 'text', null),
      c('assets', '资产总计', 'decimal', 'CNY'),
      c('liabilities', '负债合计', 'decimal', 'CNY'),
      c('parentEquity', '归母股东权益', 'decimal', 'CNY'),
    ],
  },
  'financial-income': {
    label: '利润表',
    scope: 'security',
    dateFilter: null,
    columns: [
      c('period', '报告期', 'date', null),
      c('publishedDate', '披露日', 'date', null),
      c('basis', '来源报表类型', 'text', null),
      c('revenue', '营业总收入', 'decimal', 'CNY'),
      c('netProfit', '净利润', 'decimal', 'CNY'),
      c('parentProfit', '归母净利润', 'decimal', 'CNY'),
      c('basicEps', '基本每股收益', 'decimal', 'CNY/股'),
    ],
  },
  'financial-cashflow': {
    label: '现金流量表',
    scope: 'security',
    dateFilter: null,
    columns: [
      c('period', '报告期', 'date', null),
      c('publishedDate', '披露日', 'date', null),
      c('basis', '来源报表类型', 'text', null),
      c('operating', '经营活动现金净额', 'decimal', 'CNY'),
      c('investing', '投资活动现金净额', 'decimal', 'CNY'),
      c('financing', '筹资活动现金净额', 'decimal', 'CNY'),
    ],
  },

  'lpr-history': {
    label: 'LPR 来源记录',
    scope: 'market',
    dateFilter: 'date',
    columns: [
      c('date', '来源记录日', 'date', null),
      c('oneYear', '一年期 LPR', 'decimal', '%'),
      c('fiveYear', '五年期以上 LPR', 'decimal', '%'),
    ],
  },
  'macro-gdp': {
    label: 'GDP 来源记录',
    scope: 'market',
    dateFilter: 'recordDate',
    columns: [
      c('recordDate', '来源记录日', 'date', null),
      c('period', '来源统计期', 'text', null),
      c('gdp', 'GDP 来源值', 'decimal', '亿元'),
      c('changePct', '来源同比', 'decimal', '%'),
    ],
  },
  'macro-pmi': {
    label: 'PMI 来源记录',
    scope: 'market',
    dateFilter: 'recordDate',
    columns: [
      c('recordDate', '来源记录日', 'date', null),
      c('period', '来源统计期', 'text', null),
      c('manufacturing', '制造业 PMI', 'decimal', '指数点'),
      c('nonManufacturing', '非制造业 PMI', 'decimal', '指数点'),
    ],
  },
  margin: {
    label: '融资融券事实',
    scope: 'security',
    dateFilter: 'date',
    columns: [
      c('date', '交易日', 'date', null),
      c('financingBalance', '融资余额', 'decimal', 'CNY'),
      c('securitiesBalance', '融券余额', 'decimal', 'CNY'),
      c('financingBuy', '融资买入额', 'decimal', 'CNY'),
    ],
  },
  'holder-count': {
    label: '股东户数',
    scope: 'security',
    dateFilter: null,
    columns: [
      c('period', '统计截止日', 'date', null),
      c('publishedDate', '公告日', 'date', null),
      c('holders', '股东户数', 'integer', '户'),
      c('change', '户数变化', 'integer', '户'),
      c('changePct', '变化比例', 'decimal', '%'),
    ],
  },
  'block-trade': {
    label: '大宗交易事实',
    scope: 'security',
    dateFilter: 'date',
    columns: [
      c('date', '交易日', 'date', null),
      c('price', '成交价格', 'decimal', 'CNY'),
      c('amount', '成交金额', 'decimal', 'CNY'),
      c('buyer', '买方营业部', 'text', null),
      c('seller', '卖方营业部', 'text', null),
    ],
  },
  'earnings-forecast': {
    label: '业绩预告',
    scope: 'security',
    dateFilter: 'publishedDate',
    columns: [
      c('publishedDate', '公告日', 'date', null),
      c('period', '报告期', 'date', null),
      c('indicator', '预告指标', 'text', null),
      c('type', '预告类型', 'text', null),
      c('amountLower', '预测下限', 'decimal', 'CNY'),
      c('amountUpper', '预测上限', 'decimal', 'CNY'),
      c('changeLower', '同比下限', 'decimal', '%'),
      c('changeUpper', '同比上限', 'decimal', '%'),
    ],
  },
  'holder-trades': {
    label: '股东增减持',
    scope: 'security',
    dateFilter: 'publishedDate',
    columns: [
      c('publishedDate', '公告日', 'date', null),
      c('startDate', '变动开始日', 'date', null),
      c('endDate', '变动截止日', 'date', null),
      c('holder', '股东', 'text', null),
      c('direction', '变动方向', 'text', null),
      c('shares10k', '变动股数', 'decimal', '万股'),
      c('averagePrice', '披露均价', 'decimal', 'CNY'),
    ],
  },
  buyback: {
    label: '回购方案与进度',
    scope: 'security',
    dateFilter: 'publishedDate',
    columns: [
      c('publishedDate', '最新公告日', 'date', null),
      c('planId', '来源方案编号', 'text', null),
      c('progress', '来源进度', 'text', null),
      c('amountLower', '计划金额下限', 'decimal', 'CNY'),
      c('amountUpper', '计划金额上限', 'decimal', 'CNY'),
      c('doneAmount', '已回购金额', 'decimal', 'CNY'),
      c('endDate', '计划截止日', 'date', null),
    ],
  },
  'institution-survey': {
    label: '机构调研记录',
    scope: 'security',
    dateFilter: 'publishedDate',
    columns: [
      c('publishedDate', '公告日', 'date', null),
      c('surveyDate', '实际接待日', 'date', null),
      c('participants', '来源参与者说明', 'text', null),
      c('method', '接待方式', 'text', null),
      c('place', '接待地点', 'text', null),
    ],
  },
  'dragon-tiger': {
    label: '龙虎榜记录',
    scope: 'security',
    dateFilter: 'date',
    columns: [
      c('date', '交易日', 'date', null),
      c('reason', '上榜原因', 'text', null),
      c('buyAmount', '买入额', 'decimal', 'CNY'),
      c('sellAmount', '卖出额', 'decimal', 'CNY'),
      c('netAmount', '净买额', 'decimal', 'CNY'),
    ],
  },
  concepts: {
    label: '来源板块归属',
    scope: 'security',
    dateFilter: null,
    columns: [c('code', '来源板块代码', 'text', null), c('name', '来源板块名称', 'text', null)],
  },

  'fund-flow': {
    label: '个股资金流来源估算',
    scope: 'security',
    dateFilter: null,
    columns: [
      c('date', '交易日', 'date', null),
      c('mainNet', '主力净流入', 'decimal', 'CNY'),
      c('mainPct', '主力净占比', 'decimal', '%'),
      c('largeNet', '大单净流入', 'decimal', 'CNY'),
      c('superNet', '超大单净流入', 'decimal', 'CNY'),
    ],
  },
  'macro-calendar': {
    label: '宏观日历',
    scope: 'market',
    dateFilter: 'publishedAt',
    columns: [
      c('publishedAt', '来源计划公布时间', 'datetime', null),
      c('country', '国家或地区', 'text', null),
      c('title', '事件', 'text', null),
      c('actual', '公布值', 'text', null),
      c('forecast', '预期值', 'text', null),
      c('previous', '前值', 'text', null),
      c('revised', '修正值', 'text', null),
      c('sourceUnit', '来源单位', 'text', null),
      c('importance', '来源重要程度', 'integer', null),
      c('originalUrl', '原文', 'url', null),
    ],
  },
  'stock-monitor': {
    label: '来源重点监控名单',
    scope: 'market',
    dateFilter: null,
    columns: [
      c('symbol', '证券代码', 'text', null),
      c('name', '来源证券名称', 'text', null),
      c('startDate', '监控开始日', 'date', null),
      c('endDate', '监控结束日', 'date', null),
      c('originalUrl', '来源说明', 'url', null),
    ],
  },
  'index-members': {
    label: '新浪当前指数成分',
    scope: 'index',
    dateFilter: null,
    columns: [c('symbol', '成分证券', 'text', null), c('name', '来源证券名称', 'text', null)],
  },
  'global-news': {
    label: '东方财富全球快讯',
    scope: 'market',
    dateFilter: null,
    columns: [
      c('publishedAt', '来源发布时间', 'datetime', null),
      c('title', '标题', 'text', null),
      c('summary', '摘要', 'text', null),
      c('originalUrl', '原文', 'url', null),
    ],
  },
  ticks: {
    label: '最近交易日分笔',
    scope: 'security',
    dateFilter: null,
    columns: [
      c('time', '来源成交时间', 'datetime', null),
      c('sequence', '来源序号', 'integer', null),
      c('price', '成交价', 'decimal', 'CNY'),
      c('quantity', '来源成交量', 'integer', '手'),
      c('amount', '来源成交额', 'decimal', 'CNY'),
      c('side', '来源方向', 'text', null),
    ],
  },
  'limit-up': {
    label: '涨停池',
    scope: 'market',
    dateFilter: 'date',
    columns: [
      c('date', '来源交易日', 'date', null),
      c('symbol', '证券代码', 'text', null),
      c('name', '来源证券名称', 'text', null),
      c('price', '来源现价', 'decimal', 'CNY'),
      c('changePct', '来源涨跌幅', 'decimal', '%'),
      c('amount', '来源成交额', 'decimal', 'CNY'),
      c('industry', '来源行业', 'text', null),
    ],
  },
  'limit-break': {
    label: '炸板池',
    scope: 'market',
    dateFilter: 'date',
    columns: [
      c('date', '来源交易日', 'date', null),
      c('symbol', '证券代码', 'text', null),
      c('name', '来源证券名称', 'text', null),
      c('price', '来源现价', 'decimal', 'CNY'),
      c('changePct', '来源涨跌幅', 'decimal', '%'),
      c('amount', '来源成交额', 'decimal', 'CNY'),
      c('industry', '来源行业', 'text', null),
    ],
  },
  'limit-down': {
    label: '跌停池',
    scope: 'market',
    dateFilter: 'date',
    columns: [
      c('date', '来源交易日', 'date', null),
      c('symbol', '证券代码', 'text', null),
      c('name', '来源证券名称', 'text', null),
      c('price', '来源现价', 'decimal', 'CNY'),
      c('changePct', '来源涨跌幅', 'decimal', '%'),
      c('amount', '来源成交额', 'decimal', 'CNY'),
      c('industry', '来源行业', 'text', null),
    ],
  },
  'yesterday-limit': {
    label: '昨日涨停当日表现',
    scope: 'market',
    dateFilter: 'date',
    columns: [
      c('date', '来源交易日', 'date', null),
      c('symbol', '证券代码', 'text', null),
      c('name', '来源证券名称', 'text', null),
      c('price', '来源现价', 'decimal', 'CNY'),
      c('changePct', '来源涨跌幅', 'decimal', '%'),
      c('amount', '来源成交额', 'decimal', 'CNY'),
      c('industry', '来源行业', 'text', null),
    ],
  },
  'etf-ticks': {
    label: '最近交易日 ETF 分笔',
    scope: 'etf',
    dateFilter: null,
    columns: [
      c('time', '来源成交时间', 'datetime', null),
      c('sequence', '来源序号', 'integer', null),
      c('price', '成交价', 'decimal', 'CNY'),
      c('quantity', '来源成交量', 'integer', '手'),
      c('amount', '来源成交额', 'decimal', 'CNY'),
      c('side', '来源方向', 'text', null),
    ],
  },
} as const satisfies Record<string, Definition>;
export type MarketReferenceDataset = keyof typeof marketReferenceCatalog;
export const marketReferenceOptions = Object.entries(marketReferenceCatalog).map(
  ([value, entry]) => ({ value: value as MarketReferenceDataset, label: entry.label }),
);
