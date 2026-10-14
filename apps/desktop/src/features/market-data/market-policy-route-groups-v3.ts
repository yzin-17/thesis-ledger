import type { MarketPolicyRouteRowV3 } from './market-data-routes-v3.js';

export const marketPolicyRouteGroupsV3 = (rows: readonly MarketPolicyRouteRowV3[]) => {
  const market: MarketPolicyRouteRowV3[] = [];
  const historical: MarketPolicyRouteRowV3[] = [];
  const security: MarketPolicyRouteRowV3[] = [];
  const events: MarketPolicyRouteRowV3[] = [];
  for (const row of rows) {
    if (
      row.key.kind === 'data' &&
      ['HISTORICAL_TRADING_STATUS', 'DAILY_TRADING_STATUS', 'RISK_WARNING', 'DAILY_PRICE_RULE'].includes(row.key.capability)
    ) {
      historical.push(row);
    } else if (row.key.kind === 'data' &&
      ['SECURITY_BASIC_DATES', 'LISTING_PHASE', 'SECURITY_STATIC_INFO', 'SECURITY_LOT_SIZE'].includes(row.key.capability)) {
      security.push(row);
    } else if (row.key.kind === 'data' &&
      ['HISTORICAL_PUBLIC_FEES', 'CASH_DISTRIBUTION', 'SPLIT_EVENT'].includes(row.key.capability)) {
      events.push(row);
    } else {
      market.push(row);
    }
  }
  return [
    { id: 'market', label: '行情与市场数据', rows: market },
    { id: 'historical', label: '交易状态与风险规则', rows: historical },
    { id: 'security', label: '证券资料与上市阶段', rows: security },
    { id: 'events', label: '分红拆分与公共收费', rows: events },
  ].filter((group) => group.rows.length > 0);
};
