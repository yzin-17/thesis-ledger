import { backtestExecutionModelSchemaV3, type BacktestExecutionModelV3 } from '@thesis-ledger/schemas';

export type BrokerCommission = NonNullable<NonNullable<BacktestExecutionModelV3['segments'][number]['fees']>['brokerCommission']>;
export function defaultBrokerCommission(market: 'HK' | 'US', normalized = true): BrokerCommission {
  const common = {
    broker: 'futu-hk' as const, plan: 'standard-fixed-platform' as const,
    sourceUrl: 'https://www.futuhk.com/hans/support/topic2_335', checkedDate: '2026-10-07',
    applicability: 'current-schedule-research' as const, userModified: false,
    collection: 'single-fill-order-v1' as const,
  };
  if (market === 'HK') return { ...common, basis: { kind: 'turnover' },
    commission: { rate: '0.0003', minimumAmount: '3', maximumTurnoverRatio: null },
    platformFee: { kind: 'fixed', amount: '15' } };
  return { ...common, sourceUrl: 'https://www.futuhk.com/hans/support/topic2_283',
    basis: normalized ? { kind: 'referencePrice', price: '20' } : { kind: 'actualShares' },
    commission: { rate: '0.0049', minimumAmount: '0.99', maximumTurnoverRatio: '0.005' },
    platformFee: { kind: 'perShare', rate: '0.005', minimumAmount: '1', maximumTurnoverRatio: '0.005' } };
}
export function applyBrokerCommission(model: BacktestExecutionModelV3, profile: BrokerCommission, clock = new Date().toISOString()) {
  return backtestExecutionModelSchemaV3.parse({ ...model, segments: model.segments.map((segment) => {
    if (!segment.fees || segment.execution.mode !== 'exchange') throw new Error('券商预设只支持交易所执行');
    return { ...segment, source: { kind: 'userConfiguration', revision: 'futu-cost-v1',
      configuredAt: clock, description: '富途香港券商成本研究配置', references: [...segment.source.references, profile.sourceUrl] },
      assumptions: [...segment.assumptions.filter((item) => !item.startsWith('券商成本：')),
        '券商成本：当前标准网上交易及固定式平台费；一单一次成交，公共收费另算，不证明历史账户费率。',
      ], fees: { ...segment.fees, brokerCommission: profile,
        commission: { ...segment.fees.commission, rate: '0', minimum: { kind: 'none' }, side: 'both' } } };
  }) });
}
