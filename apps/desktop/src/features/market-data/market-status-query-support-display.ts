import type { StatusQuerySupportV1 } from '@thesis-ledger/schemas';

/** 来源声明的参数范围；不表示所选窗口已经完整。 */
export function statusQuerySupportLabelV1(support?: StatusQuerySupportV1) {
  if (!support) return null;
  switch (support.capability) {
    case 'DAILY_TRADING_STATUS':
      return `日级状态，单次最多 ${support.maximumWindowDays} 天`;
    case 'RISK_WARNING': {
      const labels: string[] = [];
      if (support.detailKinds.includes('coarseST')) labels.push('粗 ST 状态');
      if (support.riskCategories.includes('delisting')) labels.push('退市风险');
      if (support.riskCategories.includes('other')) labels.push('其他风险');
      return labels.join('、');
    }
    case 'DAILY_PRICE_RULE':
      return support.representations.map((kind) => kind === 'rule' ? '比例或文字规则' : '明确涨跌停价格').join('、');
    case 'SECURITY_BASIC_DATES':
      return support.fields.map((field) => field === 'ipoDate' ? '上市日期' : '摘牌日期').join('、');
    case 'LISTING_PHASE': {
      const labels = { notListed: '未上市', initialListing: '初始上市', listed: '已上市',
        delistingPeriod: '退市整理期', delisted: '已摘牌' };
      return support.phases.map((phase) => labels[phase]).join('、');
    }
  }
}
