import { z } from 'zod';
import { securityLotSharesSchema, securityLotSourceSchema } from './market-security-lot-size.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

export const backtestResearchLotSizeSchema = z.strictObject({
  sharesPerLot: securityLotSharesSchema,
  defaultSharesPerLot: securityLotSharesSchema,
  origin: z.enum(['providerCurrent', 'userOverride']),
  historicalChanges: z.literal('unverified'),
  source: securityLotSourceSchema,
}).superRefine((value, context) => {
  if (value.origin === 'providerCurrent' && value.sharesPerLot !== value.defaultSharesPerLot)
    context.addIssue({ code: 'custom', path: ['sharesPerLot'], message: '来源默认值与采用值不同，必须声明手动覆盖' });
});
export type BacktestResearchLotSize = z.infer<typeof backtestResearchLotSizeSchema>;

/** 预设是模型参数，不能获得历史规则身份或归一化数量资格。 */
export function researchLotSizeModelIssuesV3(model: {
  researchLotSize?: BacktestResearchLotSize | undefined;
  scope: { symbol?: string; market: string; instrumentType: string; currency: string };
  segments: readonly { source: { kind: string }; execution: { mode: string; normalizedExecution?: unknown } }[];
}) {
  if (!model.researchLotSize) return [];
  const messages = [];
  if (model.researchLotSize.source.symbol && model.researchLotSize.source.symbol !== model.scope.symbol)
    messages.push('每手股数独立来源标的与执行模型不匹配');
  if (model.scope.market !== 'HK' || model.scope.instrumentType !== 'STOCK' || model.scope.currency !== 'HKD')
    messages.push('每手研究预设仅用于港股股票实际股数');
  if (model.segments.some(segment => segment.source.kind === 'historicalFact'))
    messages.push('每手研究预设不能作为历史规则事实');
  if (model.segments.some(segment => segment.execution.mode !== 'exchange' || segment.execution.normalizedExecution))
    messages.push('每手研究预设不能应用于净值或归一化数量');
  return messages.map(message => ({ path: ['researchLotSize'], message }));
}

export function researchLotSizeClockIssuesV3(model: { researchLotSize?: BacktestResearchLotSize | undefined }, dataAsOf: string) {
  if (!model.researchLotSize) return [];
  const comparison = compareMarketPitEvidenceInstantStringsV1(model.researchLotSize.source.observedAt, dataAsOf);
  if (comparison === -1 || comparison === 0) return [];
  return [{ path: ['researchLotSize', 'source', 'observedAt'], message: '每手预设来源观察晚于研究冻结截点' }];
}
